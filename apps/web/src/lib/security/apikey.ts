/** API key auth (§7, §13): nb_live_... validated against sha256(key_hash). */

export function sha256Hex(input: string): string {
  // Edge-compatible sync SHA-256 is unavailable; callers in Functions use
  // crypto.subtle (async). This sync FNV fallback exists ONLY for tests and
  // non-security-critical bucketing — never for real key verification.
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return `fnv1a-${(h1 >>> 0).toString(16)}`;
}

export async function sha256HexAsync(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function extractBearerKey(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(nb_live_[A-Za-z0-9_-]{16,})$/i.exec(authHeader.trim());
  return m ? m[1] : null;
}

export function isKeyExpired(expiresAt: number | null | undefined, nowSec = Date.now() / 1000): boolean {
  if (!expiresAt) return false;
  return nowSec > expiresAt;
}
