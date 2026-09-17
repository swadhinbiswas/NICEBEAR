import { createDb, type Database } from "../db/client";

/** Minimal KV interface — matches Cloudflare KV namespace for our uses. */
export interface KvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface QueueSender {
  send(message: unknown, opts?: { delaySeconds?: number }): Promise<void>;
}

export interface AppEnv {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  GITHUB_TOKEN?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  NODE_ENV?: string;
  /** Asset store selector: `github` (default) or `hf` (Hugging Face buckets). */
  ASSET_STORE?: string;
  HF_NAMESPACE?: string;
  HF_BUCKET?: string;
  HF_S3_ACCESS_KEY_ID?: string;
  HF_S3_SECRET_ACCESS_KEY?: string;
  HF_PUBLIC_BASE_URL?: string;
  DECISIONS?: KvStore;
  WEBHOOK_QUEUE?: QueueSender;
}

/**
 * Resolve runtime env. On Cloudflare (Astro + @astrojs/cloudflare v12),
 * bindings live at `locals.runtime.env`; locally/in tests, fall back to
 * `process.env`. `extra` lets routes inject fakes in tests.
 */
export function getEnv(locals: unknown, extra?: Partial<AppEnv>): AppEnv {
  const runtime = (locals as { runtime?: { env?: Record<string, unknown> } } | null | undefined)?.runtime;
  const base = (runtime?.env ?? {}) as Record<string, unknown>;
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const pick = (k: string): string | undefined => {
    const v = base[k];
    if (typeof v === "string") return v;
    return proc?.env?.[k];
  };
  return {
    TURSO_DATABASE_URL: pick("TURSO_DATABASE_URL"),
    TURSO_AUTH_TOKEN: pick("TURSO_AUTH_TOKEN"),
    GITHUB_TOKEN: pick("GITHUB_TOKEN"),
    BETTER_AUTH_SECRET: pick("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: pick("BETTER_AUTH_URL"),
    GITHUB_CLIENT_ID: pick("GITHUB_CLIENT_ID"),
    GITHUB_CLIENT_SECRET: pick("GITHUB_CLIENT_SECRET"),
    NODE_ENV: pick("NODE_ENV"),
    ASSET_STORE: pick("ASSET_STORE"),
    HF_NAMESPACE: pick("HF_NAMESPACE"),
    HF_BUCKET: pick("HF_BUCKET"),
    HF_S3_ACCESS_KEY_ID: pick("HF_S3_ACCESS_KEY_ID"),
    HF_S3_SECRET_ACCESS_KEY: pick("HF_S3_SECRET_ACCESS_KEY"),
    HF_PUBLIC_BASE_URL: pick("HF_PUBLIC_BASE_URL"),
    DECISIONS: (base["DECISIONS"] as KvStore | undefined) ?? extra?.DECISIONS,
    WEBHOOK_QUEUE: (base["WEBHOOK_QUEUE"] as QueueSender | undefined) ?? extra?.WEBHOOK_QUEUE,
  };
}

let cached: { key: string; db: Database } | null = null;

/** Request-scoped DB handle (cached per connection string). Throws when unconfigured. */
export function getDb(env: AppEnv): Database {
  const url = env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not configured");
  if (!cached || cached.key !== url) {
    cached = { key: url, db: createDb(url, env.TURSO_AUTH_TOKEN) };
  }
  return cached.db;
}

/** waitUntil shim — edge `context.waitUntil`, no-op locally. */
export function getWaitUntil(locals: unknown): (p: Promise<unknown>) => void {
  const w = (locals as { runtime?: { waitUntil?: (p: Promise<unknown>) => void } })?.runtime?.waitUntil;
  if (typeof w === "function") return (p) => w.call(null, p);
  return (p) => {
    p.catch(() => undefined);
  };
}
