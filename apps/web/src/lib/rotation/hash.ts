/** FNV-1a 32-bit — tiny, deterministic, no deps. Used for seeded picks. */
export function hashStringToUint32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pickIndex(key: string, length: number): number {
  if (length <= 0) return 0;
  return hashStringToUint32(key) % length;
}
