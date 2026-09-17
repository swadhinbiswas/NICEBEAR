import { sha256HexAsync, extractBearerKey, isKeyExpired } from "../security/apikey";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export interface KeyRow {
  id: string;
  ownerId: string;
  ownerType: "user" | "organization";
  keyHash: string;
  scope: "read" | "admin";
  rateLimitPerMin: number;
  monthlyQuota: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
}

export interface AuthContext {
  keyId: string;
  ownerId: string;
  ownerType: "user" | "organization";
  scope: "read" | "admin";
  rateLimitPerMin: number;
  monthlyQuota: number | null;
}

/** YYYY-MM bucket for monthly quota accounting. */
export function monthBucket(nowSec = Date.now() / 1000): string {
  const d = new Date(nowSec * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Validate `Authorization: Bearer nb_live_...` against the key store.
 * Pure except for injected loaders — trivially unit-testable, no Turso needed.
 * Throws HttpError(401/403/429). Rate-limit (KV) is enforced separately in
 * routes via lib/security/ratelimit so public + authed paths share one limiter.
 */
export async function authenticateRequest(
  opts: { authHeader: string | null; requiredScope: "read" | "admin"; nowSec?: number },
  deps: {
    loadKeyByHash: (hash: string) => Promise<KeyRow | null>;
    monthlyCount: (keyId: string, month: string) => Promise<number>;
  },
): Promise<AuthContext> {
  const nowSec = opts.nowSec ?? Date.now() / 1000;
  const plaintext = extractBearerKey(opts.authHeader);
  if (!plaintext) throw new HttpError(401, "missing or malformed Authorization header", "unauthorized");

  const hash = await sha256HexAsync(plaintext);
  const row = await deps.loadKeyByHash(hash);
  if (!row || row.revokedAt) throw new HttpError(401, "invalid or revoked API key", "unauthorized");
  if (isKeyExpired(row.expiresAt, nowSec)) throw new HttpError(401, "API key expired", "unauthorized");
  if (opts.requiredScope === "admin" && row.scope !== "admin") {
    throw new HttpError(403, "admin scope required", "forbidden");
  }
  if (row.monthlyQuota != null) {
    const used = await deps.monthlyCount(row.id, monthBucket(nowSec));
    if (used >= row.monthlyQuota) {
      throw new HttpError(429, "monthly quota reached", "quota_reached");
    }
  }
  return {
    keyId: row.id,
    ownerId: row.ownerId,
    ownerType: row.ownerType,
    scope: row.scope,
    rateLimitPerMin: row.rateLimitPerMin,
    monthlyQuota: row.monthlyQuota,
  };
}

/** Map HttpError (or unknown) to a JSON Response for Astro routes. */
export function toErrorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message, code: e.code ?? "error" }, { status: e.status });
  }
  return Response.json({ error: "internal error" }, { status: 500 });
}
