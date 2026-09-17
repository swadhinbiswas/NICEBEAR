#!/usr/bin/env node
/**
 * Bootstrap an org + admin API key for local dev / self-hosting.
 * Usage: TURSO_DATABASE_URL="file:./nicebear.db" pnpm --filter @nicebear/web db:seed [org-slug]
 * Prints the plaintext key ONCE — store it, it cannot be recovered.
 */
import { createClient } from "@libsql/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("TURSO_DATABASE_URL is required");
  process.exit(1);
}
const token = process.env.TURSO_AUTH_TOKEN;
const slug = process.argv[2] ?? "acme";
const now = Math.floor(Date.now() / 1000);
const id = (p) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

const db = createClient({ url, authToken: token });

const existing = await db.execute({ sql: "SELECT id FROM organizations WHERE slug = ? AND deleted_at IS NULL", args: [slug] });
let orgId;
if (existing.rows.length > 0) {
  orgId = existing.rows[0].id;
  console.log(`org "${slug}" exists (${orgId}) — minting an additional admin key`);
} else {
  orgId = id("org");
  await db.execute({
    sql: "INSERT INTO organizations (id, name, slug, plan, github_installation_id, created_at, deleted_at) VALUES (?, ?, ?, 'free', NULL, ?, NULL)",
    args: [orgId, slug, slug, now],
  });
  console.log(`created org "${slug}" (${orgId})`);
}

const plaintext = `nb_live_${randomBytes(32).toString("base64url")}`;
const hash = createHash("sha256").update(plaintext).digest("hex");
const keyId = id("key");
await db.execute({
  sql: `INSERT INTO api_keys (id, owner_id, owner_type, key_hash, scope, rate_limit_per_min, monthly_quota, expires_at, last_used_at, created_at, revoked_at)
        VALUES (?, ?, 'organization', ?, 'admin', 600, NULL, NULL, NULL, ?, NULL)`,
  args: [keyId, orgId, hash, now],
});

console.log("\nADMIN API KEY (shown once):");
console.log(plaintext);
console.log(`\nkey_id=${keyId} org_id=${orgId}`);
console.log("Example: curl -H \"Authorization: Bearer <key>\" http://localhost:4321/api/analytics?metric=summary");
