#!/usr/bin/env node
/**
 * Apply migrations/*.sql to Turso/local LibSQL, idempotently.
 * Works with both `libsql://...` (Turso) and `file:...` (local dev).
 * Usage: TURSO_DATABASE_URL="file:./nicebear.db" pnpm db:migrate
 */
import { createClient } from "@libsql/client";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("TURSO_DATABASE_URL is required");
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dir = join(root, "migrations");
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

await db.execute(
  "CREATE TABLE IF NOT EXISTS __nicebear_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
);
const applied = new Set(
  (await db.execute("SELECT name FROM __nicebear_migrations")).rows.map((r) => r.name),
);

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
let ran = 0;
for (const f of files) {
  if (applied.has(f)) {
    console.log(`skip ${f} (already applied)`);
    continue;
  }
  const sql = await readFile(join(dir, f), "utf8");
  const statements = sql
    .split(/--> statement-breakpoint/g)
    .map((s) => s.trim())
    .filter(Boolean);
  await db.batch(statements.map((s) => ({ sql: s, args: [] })));
  await db.execute({
    sql: "INSERT INTO __nicebear_migrations (name, applied_at) VALUES (?, ?)",
    args: [f, Math.floor(Date.now() / 1000)],
  });
  console.log(`applied ${f} (${statements.length} statements)`);
  ran++;
}
console.log(ran === 0 ? "up to date" : `done — ${ran} migration(s) applied`);
