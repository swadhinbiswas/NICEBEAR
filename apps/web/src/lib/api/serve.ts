import type { RotationDsl } from "@nicebear/shared-types";
import { clampKvTtl, decisionCacheKey } from "../cache/keys";
import { getEngine } from "../engines/registry";
import { jsdelivrUrl, parseGithubRepo } from "../github/jsdelivr";
import { resolveActiveAvatar, secondsUntilNextBoundary } from "../rotation/evaluator";

export interface ServeDeps {
  /** Resolved avatar pointer row (from Turso on KV miss). Null = 404. */
  avatarRow?: {
    id: string;
    seed?: string | null;
    engine?: string | null;
    githubRepo?: string | null;
    githubPath?: string | null;
    commitSha?: string | null;
    externalUrl?: string | null;
  } | null;
  rule?: RotationDsl | null;
  collections?: Record<string, string[]>;
  seed?: string;
  version?: string; // ?v=2 | ?v=latest — resolved by caller to a commit sha / pointer
  kvGet?: (key: string) => Promise<string | null>;
  kvPut?: (key: string, value: string, ttlSeconds: number) => Promise<void>;
  now?: Date;
}

/**
 * Request flow (§4.4): edge → KV decision lookup → [miss: evaluator] →
 * populate KV → Response (redirect to jsDelivr for committed assets,
 * inline SVG for generated). Target <50ms cached, <200ms uncached.
 */
export async function serveAvatar(deps: ServeDeps): Promise<Response> {
  const now = deps.now ?? new Date();
  const kvKey = decisionCacheKey(deps.avatarRow?.id ?? "unknown");

  if (deps.kvGet) {
    const cached = await deps.kvGet(kvKey).catch(() => null);
    if (cached) {
      return redirectOrSvg(cached, deps, true);
    }
  }

  let resolved = deps.avatarRow?.id ?? null;
  if (deps.rule) {
    resolved = resolveActiveAvatar(deps.rule, now, { collections: deps.collections, seed: deps.seed });
  }

  if (!resolved) return new Response("no avatar matched", { status: 404 });

  if (deps.rule && deps.kvPut) {
    const ttl = clampKvTtl(secondsUntilNextBoundary(deps.rule, now));
    await deps.kvPut(kvKey, resolved, ttl).catch(() => undefined);
  }

  return redirectOrSvg(resolved, deps, false);
}

function redirectOrSvg(resolved: string, deps: ServeDeps, cached: boolean): Response {
  const row = deps.avatarRow;
  // Generated inline SVG path
  if (row?.engine) {
    const engine = getEngine(row.engine);
    if (engine) {
      const svg = engine.generate(row.seed ?? deps.seed ?? resolved);
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600, s-maxage=86400",
          "X-NiceBear-Cache": cached ? "HIT" : "MISS",
        },
      });
    }
  }
  // Committed asset → jsDelivr (immutable per sha)
  if (row?.githubRepo && row?.githubPath) {
    const { owner, repo } = parseGithubRepo(row.githubRepo);
    const url = jsdelivrUrl(owner, repo, row.githubPath, row.commitSha ?? undefined);
    return Response.redirect(url, 302);
  }
  if (row?.externalUrl) {
    return Response.redirect(row.externalUrl, 302);
  }
  return new Response(resolved, {
    headers: { "Content-Type": "text/plain", "X-NiceBear-Cache": cached ? "HIT" : "MISS" },
  });
}
