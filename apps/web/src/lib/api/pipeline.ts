import { and, eq, isNull } from "drizzle-orm";
import type { RotationDsl } from "@nicebear/shared-types";
import { logUsage } from "../analytics/log";
import { readBytes, writeBytes, readDecision, writeDecision, purgeDecision } from "../cache/edge";
import { avatars } from "../db/schema";
import { getDb, getEnv, getWaitUntil, type AppEnv } from "../runtime/env";
import { checkRateLimit, getClientIp } from "../security/ratelimit";
import { getAnimated } from "../engines/registry";
import { hfPublicUrl } from "../storage/index.js";
import { secondsUntilNextBoundary } from "../rotation/evaluator";
import { buildDailyRule, buildWeeklyRule } from "../rotation/wrappers";
import { serveAvatar, type ImageFormat } from "./serve";
import {
  buildCollectionsMap,
  evaluateRuleStack,
  loadAvatar,
  loadCollection,
  loadCollectionMembers,
  loadHistory,
  loadRuleStack,
  pickVersion,
  toAvatarRow,
  type StackedRule,
} from "./avatars";
import type { Database } from "../db/client";

export interface AvatarRequestOptions {
  request: Request;
  url: URL;
  avatarId: string;
  locals: unknown;
  /** Route-specific rule (daily/weekly/monthly/custom). Absent → stored rule stack. */
  rule?: RotationDsl | null;
  /**
   * Thin-wrapper preset (§5.2). Built AFTER the avatar loads so the rule can
   * target the avatar's own collection. `collection:__self__` inside `rule`
   * is substituted the same way.
   */
  preset?: "daily" | "weekly" | "monthly" | "random";
  /** /refresh: bypass KV + byte caches, new resolution every call. */
  noCache?: boolean;
  now?: Date;
}

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

/**
 * Full read flow (§4.4): IP rate-limit → Turso (avatar + rules, on KV miss
 * of the decision tier) → evaluator → KV write → bytes (Cache API for
 * generated SVG/PNG/GIF, 302 to jsDelivr or HF resolve URLs for committed
 * assets) → async usage log.
 * Target: <50ms cached, <200ms uncached.
 */
export async function handleAvatarRequest(opts: AvatarRequestOptions): Promise<Response> {
  const t0 = Date.now();
  const now = opts.now ?? new Date();
  const env = getEnv(opts.locals);
  const waitUntil = getWaitUntil(opts.locals);

  const ip = getClientIp(opts.request);
  const ipLimit = await checkRateLimit(env.DECISIONS, "ip", ip, 120);
  if (!ipLimit.allowed) {
    return withHeaders(json(429, { error: "rate limit exceeded", code: "rate_limited" }), {
      "Retry-After": "60",
    });
  }

  let db: Database;
  try {
    db = getDb(env);
  } catch {
    return json(503, { error: "database not configured (TURSO_DATABASE_URL)", code: "unconfigured" });
  }

  const row = await loadAvatar(db, opts.avatarId).catch(() => null);
  if (!row) {
    waitUntil(logUsage(db, usage(false, opts.avatarId, null, t0, 404, opts.request)));
    return json(404, { error: "avatar not found" });
  }

  // ?v=2 | ?v=latest → pinned commit sha (versioned reads are immutable).
  const history = await loadHistory(db, row.id).catch(() => []);
  const commitOverride = pickVersion(history, row.commitSha, opts.url.searchParams.get("v"));
  const seedParam = opts.url.searchParams.get("seed") ?? undefined;
  // /random with no explicit seed varies per call; /refresh bypasses caches below.
  const seed =
    seedParam ?? (opts.preset === "random" ? Math.random().toString(36).slice(2) : undefined);

  // Engine for generated avatars comes from the parent collection;
  // collection-less generated avatars fall back to identicons (seeded by id).
  let engine: string | null = null;
  if (row.sourceType === "generated") {
    engine = row.collectionId
      ? ((await loadCollection(db, row.collectionId).catch(() => null))?.engineType ?? null)
      : null;
    engine ??= "identicons";
  }

  // Output format (?format=svg|png|gif, ?w= for png). Animated engines
  // default to gif; anything else defaults to svg.
  const formatParam = opts.url.searchParams.get("format");
  const animatedDefault = !!engine && !!getAnimated(engine);
  const format: ImageFormat =
    formatParam === "png" ? "png" : formatParam === "gif" ? "gif" : formatParam === "svg" ? "svg" : animatedDefault ? "gif" : "svg";
  if (formatParam && !["svg", "png", "gif"].includes(formatParam)) {
    return json(400, { error: "?format must be svg, png, or gif" });
  }
  const width = Number(opts.url.searchParams.get("w") ?? 256);

  // Byte-tier fast path (generated SVG / pinned sha).
  const byteRef = `${format}:${commitOverride ? `sha:${commitOverride}` : engine ? `engine:${engine}:${row.seed ?? seed ?? row.id}` : `avatar:${row.id}`}${format === "png" ? `:w${Math.max(16, Math.min(1024, Math.floor(width) || 256))}` : ""}`;
  const byteHit = opts.noCache ? null : await readBytes(byteRef);
  if (byteHit) {
    waitUntil(logUsage(db, usage(true, row.id, null, t0, 200, opts.request)));
    return withHeaders(byteHit, {
      "X-NiceBear-Cache": "HIT",
      "X-NiceBear-RateLimit-Remaining": String(ipLimit.remaining),
    });
  }

  // Decision tier: stored policy stack, or the route's thin-wrapper rule.
  // `collection:__self__` always means "this avatar's collection (or itself)".
  const selfId = row.collectionId ?? row.id;
  const substituteSelf = (r: RotationDsl): RotationDsl => ({
    ...r,
    rules: r.rules.map((item) =>
      item.avatar_from === "collection:__self__"
        ? { ...item, avatar_from: `collection:${selfId}` }
        : item,
    ),
  });
  let stacked: StackedRule[];
  if (opts.preset === "daily") {
    stacked = [{ priority: 0, rule: buildDailyRule(selfId) }];
  } else if (opts.preset === "weekly") {
    stacked = [{ priority: 0, rule: buildWeeklyRule(selfId) }];
  } else if (opts.preset === "monthly") {
    stacked = [
      {
        priority: 0,
        rule: { type: "composite", priority: "first_match", rules: [{ when: "every:30d", avatar_from: `collection:${selfId}` }] },
      },
    ];
  } else if (opts.preset === "random") {
    stacked = [
      {
        priority: 0,
        rule: {
          type: "composite",
          priority: "first_match",
          rules: [{ when: "random", avatar_from: `collection:${selfId}`, seed_by: "request" }],
        },
      },
    ];
  } else if (opts.rule) {
    stacked = [{ priority: 0, rule: substituteSelf(opts.rule) }];
  } else {
    stacked = await loadRuleStack(db, {
      id: row.id,
      collectionId: row.collectionId,
      orgId: row.orgId,
    }).catch(() => []);
  }

  let resolvedId: string | null = null;
  let decisionHit = false;
  // Random + refresh + pinned versions always re-resolve; everything else may
  // serve the KV decision until the next rotation boundary.
  const useDecisionCache =
    !opts.noCache && !opts.url.searchParams.get("v") && opts.preset !== "random";
  const cached = useDecisionCache ? await readDecision(env.DECISIONS, row.id) : null;
  if (cached) {
    resolvedId = cached;
    decisionHit = true;
  } else {
    const extraIds = row.collectionId ? [row.collectionId, row.id] : [row.id];
    const collectionsMap: Record<string, string[]> = await buildCollectionsMap(db, stacked, extraIds).catch(() => ({}));
    // An avatar (or its collection) with no other members still serves itself.
    for (const id of extraIds) {
      if (!collectionsMap[id] || collectionsMap[id].length === 0) collectionsMap[id] = [row.id];
    }
    resolvedId = evaluateRuleStack(stacked, now, { collections: collectionsMap, seed }) ?? row.id;
    if (useDecisionCache) {
      const ttl =
        stacked.length > 0
          ? Math.min(...stacked.map((s) => secondsUntilNextBoundary(s.rule, now)))
          : 60;
      waitUntil(writeDecision(env.DECISIONS, row.id, resolvedId, ttl));
    }
  }

  // Storage URL for hf-backed rows (?v= pins to the versioned key from
  // history; for hf rows commit_sha IS the key, so pickVersion resolves keys).
  const hfKey = commitOverride ?? row.storageKey;
  const storageUrl = row.storageBackend === "hf" && hfKey ? hfPublicUrl(env, hfKey) : null;

  const res = await serveAvatar({
    avatarRow: toAvatarRow(row, { engine, commitSha: commitOverride, storageUrl }),
    seed,
    format,
    width,
  }).catch(() => json(500, { error: "serve failed" }));

  const out = withHeaders(res, {
    "X-NiceBear-Cache": decisionHit ? "HIT" : "MISS",
    "X-NiceBear-RateLimit-Remaining": String(ipLimit.remaining),
  });
  if (out.status === 200 && !opts.noCache) writeBytes(byteRef, out, waitUntil);
  waitUntil(logUsage(db, usage(decisionHit, row.id, null, t0, out.status, opts.request)));
  void resolvedId;
  return out;
}

function usage(
  cacheHit: boolean,
  avatarId: string | null,
  apiKeyId: string | null,
  t0: number,
  status: number,
  request: Request,
) {
  return {
    cacheHit,
    avatarId,
    apiKeyId,
    region: request.headers.get("CF-IPCountry"),
    responseMs: Date.now() - t0,
    statusCode: status,
  };
}

function withHeaders(res: Response, headers: Record<string, string>): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

/** Purge decision cache for one avatar (called by every mutation route). */
export async function purgeAvatar(env: AppEnv, avatarId: string): Promise<void> {
  await purgeDecision(env.DECISIONS, avatarId);
}

/**
 * Purge for a rule target. Collection/org rules fan out to member avatars
 * (bounded at 500; the Queue consumer handles larger orgs in the full slice).
 */
export async function purgeRuleTarget(
  env: AppEnv,
  db: Database,
  targetType: string,
  targetId: string,
): Promise<void> {
  try {
    if (targetType === "avatar") {
      await purgeDecision(env.DECISIONS, targetId);
      return;
    }
    let ids: string[] = [];
    if (targetType === "collection") {
      ids = await loadCollectionMembers(db, targetId);
    } else if (targetType === "organization") {
      const rows = await db
        .select({ id: avatars.id })
        .from(avatars)
        .where(and(eq(avatars.orgId, targetId), isNull(avatars.deletedAt)));
      ids = rows.map((r) => r.id);
    }
    await Promise.all(ids.slice(0, 500).map((id) => purgeDecision(env.DECISIONS, id)));
  } catch {
    /* cache purge must never fail a mutation */
  }
}
