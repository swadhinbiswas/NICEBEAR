import type { KvStore } from "../runtime/env";

/**
 * Fixed-window rate limiting + monthly quota counters backed by KV (§7, §13).
 * - Per-minute: `rl:{kind}:{id}:{minuteBucket}` incr, 70s TTL.
 * - Monthly: `quota:{keyId}:{YYYY-MM}` incr, TTL to end of month.
 * KV absent (local dev) → allow-open. KV errors → fail-open for reads/limits
 * (availability over strictness at the edge; usage_logs remains the source of
 * truth for usage accounting), but quota increments still best-effort.
 */

export function minuteBucket(nowMs: number): number {
  return Math.floor(nowMs / 60_000);
}

export function rateLimitKey(kind: "key" | "ip", id: string, nowMs: number): string {
  return `rl:${kind}:${id}:${minuteBucket(nowMs)}`;
}

export function quotaMonthKey(keyId: string, month: string): string {
  return `quota:${keyId}:${month}`;
}

/** Seconds from now until 00:00 UTC on the 1st of next month. */
export function secondsToMonthEnd(nowSec: number): number {
  const d = new Date(nowSec * 1000);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return Math.max(60, Math.floor((end - nowSec * 1000) / 1000));
}

export interface LimitResult {
  allowed: boolean;
  remaining: number;
}

async function kvIncr(kv: KvStore, key: string, ttlSeconds: number): Promise<number> {
  const raw = await kv.get(key).catch(() => null);
  const next = (raw ? Number.parseInt(raw, 10) || 0 : 0) + 1;
  await kv.put(key, String(next), { expirationTtl: ttlSeconds }).catch(() => undefined);
  return next;
}

export async function checkRateLimit(
  kv: KvStore | undefined,
  kind: "key" | "ip",
  id: string,
  limit: number,
  nowMs = Date.now(),
): Promise<LimitResult> {
  if (!kv) return { allowed: true, remaining: limit };
  try {
    const count = await kvIncr(kv, rateLimitKey(kind, id, nowMs), 70);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

/** Pre-request quota gate — runs BEFORE Turso (§7). Increment lands post-serve. */
export async function checkMonthlyQuota(
  kv: KvStore | undefined,
  keyId: string,
  quota: number | null | undefined,
  month: string,
): Promise<LimitResult> {
  if (!kv || quota == null) return { allowed: true, remaining: quota ?? Number.MAX_SAFE_INTEGER };
  try {
    const raw = await kv.get(quotaMonthKey(keyId, month));
    const used = raw ? Number.parseInt(raw, 10) || 0 : 0;
    return { allowed: used < quota, remaining: Math.max(0, quota - used) };
  } catch {
    return { allowed: true, remaining: quota };
  }
}

export async function incrMonthlyQuota(
  kv: KvStore | undefined,
  keyId: string,
  month: string,
  nowSec = Date.now() / 1000,
): Promise<void> {
  if (!kv) return;
  try {
    await kvIncr(kv, quotaMonthKey(keyId, month), secondsToMonthEnd(nowSec));
  } catch {
    /* best-effort */
  }
}

/** Best-effort client IP for per-IP limiting (CF header first). */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("CF-Connecting-IP") ??
    req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
