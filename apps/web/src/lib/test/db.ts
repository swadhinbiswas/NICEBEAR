import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readdir, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../db/schema";

/**
 * Fresh in-memory LibSQL + all migrations applied. Foreign keys are relaxed
 * (PRAGMA foreign_keys = OFF), so tests can seed minimal rows without building
 * whole object graphs — each test documents what it seeds.
 */
export async function createTestDb() {
  const client = createClient({ url: ":memory:" });
  // Relax FK enforcement: tests seed minimal rows without whole object graphs.
  // FK shape itself is covered by migrations + live E2E, not unit tests.
  await client.execute("PRAGMA foreign_keys = OFF");
  const db = drizzle(client, { schema });
  await applyMigrations((s) => client.execute(s));
  return db;
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDb>>;

function migrationsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "migrations");
}

async function applyMigrations(exec: (sql: string) => Promise<unknown>): Promise<void> {
  const dir = migrationsDir();
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = await readFile(join(dir, f), "utf8");
    const statements = sql
      .split(/--> statement-breakpoint/g)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of statements) await exec(s);
  }
}

/**
 * File-backed DB for route-level tests. Routes open their own handle via
 * getDb({TURSO_DATABASE_URL: url}) — same file, so seeded rows are visible.
 * Unique per call; cleanup() unlinks the file.
 */
export async function createFileDb(): Promise<{ db: TestDatabase; url: string; cleanup: () => Promise<void> }> {
  const path = join(tmpdir(), `nb-test-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
  const url = `file:${path}`;
  const client = createClient({ url });
  await client.execute("PRAGMA foreign_keys = OFF");
  await applyMigrations((s) => client.execute(s));
  const db = drizzle(client, { schema });
  return { db, url, cleanup: () => unlink(path).catch(() => undefined) };
}
