/** Two-tier edge cache helpers (§4.4). Pure key/TTL builders — runtime-agnostic. */

export function decisionCacheKey(avatarId: string): string {
  return `avatar:${avatarId}:active`;
}

/** Byte-cache key: immutable per resolved version (commit sha / engine:seed hash). */
export function byteCacheKey(resolvedRef: string): string {
  return `bytes:${resolvedRef}`;
}

/** KV TTL = until next rotation boundary; clamped to [60s, 30d]. */
export function clampKvTtl(seconds: number): number {
  return Math.min(30 * 24 * 3600, Math.max(60, Math.floor(seconds)));
}
