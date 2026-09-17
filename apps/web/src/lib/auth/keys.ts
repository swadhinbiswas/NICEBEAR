import { sha256HexAsync } from "../security/apikey";

/** API key lifecycle: mint (plaintext shown once) + verify (sha256 compare). */

export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface MintedKey {
  /** Plaintext — returned to the caller ONCE, never stored. */
  plaintext: string;
  /** sha256 hex — stored in api_keys.key_hash. */
  hash: string;
}

export async function mintApiKey(): Promise<MintedKey> {
  const plaintext = `nb_live_${randomToken(32)}`;
  return { plaintext, hash: await sha256HexAsync(plaintext) };
}

export async function verifyApiKey(plaintext: string, hash: string): Promise<boolean> {
  const computed = await sha256HexAsync(plaintext);
  if (computed.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
