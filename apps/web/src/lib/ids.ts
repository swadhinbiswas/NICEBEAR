/** Prefixed IDs: av_, col_, rl_, sk_... — edge + node compatible. */
export function newId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `${prefix}_${rand}`;
}
