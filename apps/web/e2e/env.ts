import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface E2EState {
  baseURL: string;
  key: string;
  keyId: string;
  orgId: string;
  dbUrl: string;
  dir: string;
  serverPid: number;
}

const here = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(here, ".state.json");

let cached: E2EState | null = null;

/** Read by specs: admin key, org, and server URL from global setup. */
export function state(): E2EState {
  if (!cached) {
    cached = JSON.parse(readFileSync(STATE_PATH, "utf8")) as E2EState;
  }
  return cached;
}

export function authHeaders(key?: string): Record<string, string> {
  return { authorization: `Bearer ${key ?? state().key}` };
}

/** Unique suffix per test for parallel-safe resource names/ids. */
export function uid(prefix: string): string {
  return `${prefix}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}
