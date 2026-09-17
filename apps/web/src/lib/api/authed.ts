import { and, count, eq, gte } from "drizzle-orm";
import {
  authenticateRequest,
  monthBucket,
  toErrorResponse,
  type AuthContext,
  type KeyRow,
} from "../auth/authenticate";
import { can, type Role } from "../auth/rbac";
import { getAuth, getSessionUser } from "../auth/server";
import type { Database } from "../db/client";
import { apiKeys, memberships, usageLogs } from "../db/schema";
import { getDb, getEnv, getWaitUntil, type AppEnv } from "../runtime/env";
import { checkMonthlyQuota, checkRateLimit, incrMonthlyQuota } from "../security/ratelimit";
import { extractBearerKey } from "../security/apikey";

export interface Authed {
  env: AppEnv;
  db: Database;
  auth: AuthContext;
  waitUntil: (p: Promise<unknown>) => void;
  /** Call after a successful mutation (or serve) to account quota + touch key. */
  account: () => void;
}

/**
 * Shared gate for every mutating + analytics route (§7, §9, §13):
 * API key (Bearer nb_live_…) first; absent bearer falls back to the
 * Better Auth session cookie. A PRESENT-but-invalid bearer fails closed
 * (401) rather than silently downgrading to the session.
 * Session callers act as their user id with per-org RBAC gating downstream.
 */
export async function requireAuth(
  request: Request,
  locals: unknown,
  requiredScope: "read" | "admin",
): Promise<Authed> {
  const env = getEnv(locals);
  const waitUntil = getWaitUntil(locals);
  let db: Database;
  try {
    db = getDb(env);
  } catch {
    throw Response.json(
      { error: "database not configured (TURSO_DATABASE_URL)", code: "unconfigured" },
      { status: 503 },
    );
  }

  let auth: AuthContext;
  let isSession = false;
  const bearer = extractBearerKey(request.headers.get("authorization"));
  if (bearer) {
    try {
      auth = await authenticateRequest(
        { authHeader: request.headers.get("authorization"), requiredScope },
        {
          loadKeyByHash: async (hash): Promise<KeyRow | null> => {
            const rows = await db
              .select()
              .from(apiKeys)
              .where(eq(apiKeys.keyHash, hash))
              .limit(1);
            const r = rows[0];
            if (!r) return null;
            return {
              id: r.id,
              ownerId: r.ownerId,
              ownerType: r.ownerType as "user" | "organization",
              keyHash: r.keyHash,
              scope: r.scope as "read" | "admin",
              rateLimitPerMin: r.rateLimitPerMin,
              monthlyQuota: r.monthlyQuota,
              expiresAt: r.expiresAt,
              revokedAt: r.revokedAt,
            };
          },
          monthlyCount: async (keyId, month): Promise<number> => {
            const start = monthStartSec(month);
            const rows = await db
              .select({ n: count() })
              .from(usageLogs)
              .where(and(eq(usageLogs.apiKeyId, keyId), gte(usageLogs.createdAt, start)));
            return rows[0]?.n ?? 0;
          },
        },
      );
    } catch (e) {
      throw toErrorResponse(e);
    }
  } else {
    // No bearer → session cookie (dashboard users). Never downgrades an
    // explicitly presented key: that path threw above.
    let user: { id: string; email: string; name: string | null } | null = null;
    try {
      user = await getSessionUser(getAuth(env), request);
    } catch {
      user = null;
    }
    if (!user) {
      throw Response.json({ error: "authentication required", code: "unauthorized" }, { status: 401 });
    }
    isSession = true;
    auth = {
      keyId: `sess:${user.id}`,
      ownerId: user.id,
      ownerType: "user",
      scope: "admin", // per-org membership gates downstream, not the coarse key scope
      rateLimitPerMin: 600,
      monthlyQuota: null,
    };
  }

  const rl = await checkRateLimit(env.DECISIONS, "key", auth.keyId, auth.rateLimitPerMin);
  if (!rl.allowed) {
    throw Response.json({ error: "rate limit exceeded", code: "rate_limited" }, { status: 429 });
  }
  const month = monthBucket();
  if (!isSession) {
    const q = await checkMonthlyQuota(env.DECISIONS, auth.keyId, auth.monthlyQuota, month);
    if (!q.allowed) {
      throw Response.json({ error: "monthly quota reached", code: "quota_reached" }, { status: 429 });
    }
  }

  return {
    env,
    db,
    auth,
    waitUntil,
    account: () => {
      if (isSession) return; // no key to touch, no key quota to consume
      waitUntil(incrMonthlyQuota(env.DECISIONS, auth.keyId, month));
      waitUntil(
        db
          .update(apiKeys)
          .set({ lastUsedAt: Math.floor(Date.now() / 1000) })
          .where(eq(apiKeys.id, auth.keyId))
          .catch(() => undefined),
      );
    },
  };
}

function monthStartSec(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, 1) / 1000);
}

/**
 * Org RBAC (§9): org-owned keys act as owner of their org; user keys need a
 * membership with sufficient role. Returns the resolved org id.
 */
export async function requireOrgRole(
  db: Database,
  auth: AuthContext,
  orgId: string,
  minRole: Role,
): Promise<string> {
  if (auth.ownerType === "organization") {
    if (auth.ownerId !== orgId) {
      throw Response.json({ error: "key does not belong to this organization" }, { status: 403 });
    }
    return orgId;
  }
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, auth.ownerId)))
    .limit(1);
  const role = rows[0]?.role as Role | undefined;
  if (!can(role, minRole)) {
    throw Response.json(
      { error: `forbidden: requires ${minRole} in this organization`, code: "forbidden" },
      { status: 403 },
    );
  }
  return orgId;
}

export interface RouteInfo {
  params: Record<string, string | undefined>;
  url: URL;
}

/** Wrap an authed handler: maps thrown Responses + HttpErrors to responses. */
export function authedRoute(
  scope: "read" | "admin",
  handler: (ctx: Authed, req: Request, info: RouteInfo) => Promise<Response>,
): (args: { request: Request; locals: unknown; params: Record<string, string | undefined>; url: URL }) => Promise<Response> {
  return async ({ request, locals, params, url }) => {
    try {
      const ctx = await requireAuth(request, locals, scope);
      return await handler(ctx, request, { params, url });
    } catch (e) {
      if (e instanceof Response) return e;
      return toErrorResponse(e);
    }
  };
}
