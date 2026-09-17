import { clampKvTtl, decisionCacheKey } from "./keys";
import type { KvStore } from "../runtime/env";

/** Decision-tier (KV) read/write — degrades to miss when KV is unbound (dev). */
export async function readDecision(kv: KvStore | undefined, avatarId: string): Promise<string | null> {
  if (!kv) return null;
  try {
    return await kv.get(decisionCacheKey(avatarId));
  } catch {
    return null;
  }
}

export async function writeDecision(
  kv: KvStore | undefined,
  avatarId: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(decisionCacheKey(avatarId), value, { expirationTtl: clampKvTtl(ttlSeconds) });
  } catch {
    /* cache write failures must never fail the request */
  }
}

export async function purgeDecision(kv: KvStore | undefined, avatarId: string): Promise<void> {
  if (!kv) return;
  try {
    await kv.delete(decisionCacheKey(avatarId));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------- byte tier (Cache API)

function cacheStorage(): { match(r: Request): Promise<Response | undefined>; put(r: Request, res: Response): Promise<void> } | null {
  try {
    const caches = (globalThis as unknown as { caches?: { default: unknown } }).caches;
    const dflt = caches?.default as
      | { match(r: Request): Promise<Response | undefined>; put(r: Request, res: Response): Promise<void> }
      | undefined;
    return dflt ?? null;
  } catch {
    return null;
  }
}

/** Synthetic immutable key for a resolved version (commit sha / engine-seed hash). */
export function byteCacheRequest(resolvedRef: string): Request {
  return new Request(`https://nicebear-bytes.local/${encodeURIComponent(resolvedRef)}`);
}

export async function readBytes(resolvedRef: string): Promise<Response | null> {
  const cache = cacheStorage();
  if (!cache) return null;
  try {
    return (await cache.match(byteCacheRequest(resolvedRef))) ?? null;
  } catch {
    return null;
  }
}

export function writeBytes(resolvedRef: string, res: Response, waitUntil: (p: Promise<unknown>) => void): void {
  const cache = cacheStorage();
  if (!cache || res.status !== 200) return;
  try {
    waitUntil(cache.put(byteCacheRequest(resolvedRef), res.clone()));
  } catch {
    /* ignore */
  }
}
