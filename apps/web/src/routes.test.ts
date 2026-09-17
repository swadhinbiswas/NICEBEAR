import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiKeys, avatars, collections, memberships, organizations, usageLogs, users } from "./lib/db/schema";
import { createFileDb, type TestDatabase } from "./lib/test/db";
import { GET as listKeys } from "./pages/api/api-keys/index";
import { GET as analyticsGet } from "./pages/api/analytics/index";
import { POST as rollupPost } from "./pages/api/analytics/rollup";
import { GET as listCollections } from "./pages/api/collections/index";
import { POST as createRule } from "./pages/api/rotation-rules/index";
import { DELETE as teamDelete, GET as teamGet, POST as teamPost, PUT as teamPut } from "./pages/api/team/index";

const NOW = Math.floor(Date.now() / 1000);
let db: TestDatabase;
let url: string;
let cleanup: () => Promise<void>;

const K = {
  orgA: "nb_live_testkey_org_a_admin",
  admin: "nb_live_testkey_user_admin",
  viewer: "nb_live_testkey_user_viewer",
  stranger: "nb_live_testkey_stranger_x",
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

function ctx(path: string, key: string | null, init?: RequestInit) {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (key) headers.authorization = `Bearer ${key}`;
  const request = new Request(`http://test${path}`, { ...init, headers });
  return {
    request,
    locals: { runtime: { env: { TURSO_DATABASE_URL: url } } },
    params: {},
    url: new URL(`http://test${path}`),
  } as unknown as Parameters<typeof listKeys>[0];
}
const json = (o: unknown) =>
  ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) }) as RequestInit;

async function seed() {
  await db.insert(organizations).values([
    { id: "org_a", name: "A", slug: "a", plan: "free", githubInstallationId: null, createdAt: NOW, deletedAt: null },
    { id: "org_b", name: "B", slug: "b", plan: "free", githubInstallationId: null, createdAt: NOW, deletedAt: null },
  ]);
  await db.insert(users).values([
    { id: "u_owner", email: "owner@a.dev", name: "Owner", githubId: null, avatarUrl: null, createdAt: NOW, deletedAt: null },
    { id: "u_admin", email: "admin@a.dev", name: "Admin", githubId: null, avatarUrl: null, createdAt: NOW, deletedAt: null },
    { id: "u_viewer", email: "viewer@a.dev", name: "Viewer", githubId: null, avatarUrl: null, createdAt: NOW, deletedAt: null },
    { id: "u_stranger", email: "stranger@x.dev", name: "Stranger", githubId: null, avatarUrl: null, createdAt: NOW, deletedAt: null },
  ]);
  await db.insert(memberships).values([
    { id: "m1", orgId: "org_a", userId: "u_owner", role: "owner", createdAt: NOW },
    { id: "m2", orgId: "org_a", userId: "u_admin", role: "admin", createdAt: NOW },
    { id: "m3", orgId: "org_a", userId: "u_viewer", role: "viewer", createdAt: NOW },
  ]);
  await db.insert(apiKeys).values([
    { id: "k_org", ownerId: "org_a", ownerType: "organization", keyHash: hash(K.orgA), scope: "admin", rateLimitPerMin: 600, monthlyQuota: null, expiresAt: null, lastUsedAt: null, createdAt: NOW, revokedAt: null },
    { id: "k_admin", ownerId: "u_admin", ownerType: "user", keyHash: hash(K.admin), scope: "admin", rateLimitPerMin: 600, monthlyQuota: null, expiresAt: null, lastUsedAt: null, createdAt: NOW, revokedAt: null },
    { id: "k_viewer", ownerId: "u_viewer", ownerType: "user", keyHash: hash(K.viewer), scope: "read", rateLimitPerMin: 600, monthlyQuota: null, expiresAt: null, lastUsedAt: null, createdAt: NOW, revokedAt: null },
    { id: "k_stranger", ownerId: "u_stranger", ownerType: "user", keyHash: hash(K.stranger), scope: "admin", rateLimitPerMin: 600, monthlyQuota: null, expiresAt: null, lastUsedAt: null, createdAt: NOW, revokedAt: null },
  ]);
  await db.insert(collections).values([
    { id: "col_a", orgId: "org_a", name: "team", engineType: "pixel-art", createdAt: NOW, deletedAt: null },
  ]);
  await db.insert(avatars).values([
    { id: "av_a", collectionId: "col_a", orgId: "org_a", sourceType: "generated", githubRepo: null, githubPath: null, commitSha: null, externalUrl: null, attestedRights: 0, seed: "s", createdAt: NOW, deletedAt: null },
  ]);
}

beforeAll(async () => {
  const f = await createFileDb();
  db = f.db;
  url = f.url;
  cleanup = f.cleanup;
  await seed();
});
afterAll(async () => cleanup());

describe("list endpoints", () => {
  it("lists own keys without hashes; 401 anonymous", async () => {
    const res = await listKeys(ctx("/api/api-keys", K.admin));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { api_keys: Array<Record<string, unknown>> };
    expect(data.api_keys.map((k) => k.id)).toContain("k_admin");
    expect(data.api_keys.map((k) => k.id)).not.toContain("k_org");
    for (const k of data.api_keys) expect(k).not.toHaveProperty("key_hash");
    expect((await listKeys(ctx("/api/api-keys", null))).status).toBe(401);
  });

  it("scopes collections to the org; rejects outsiders", async () => {
    const res = await listCollections(ctx("/api/collections?org_id=org_a", K.viewer));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { collections: Array<{ id: string; avatar_count: number }> };
    expect(data.collections).toHaveLength(1);
    expect(data.collections[0]?.avatar_count).toBe(1);
    expect((await listCollections(ctx("/api/collections?org_id=org_a", K.stranger))).status).toBe(403);
    expect((await listCollections(ctx("/api/collections", K.viewer))).status).toBe(400);
  });

  it("forbids cross-org rotation rules, allows same-org", async () => {
    const bad = await createRule(
      ctx(
        "/api/rotation-rules",
        K.orgA,
        json({ target_id: "org_b", target_type: "organization", priority: 0, rule: { type: "composite", priority: "first_match", rules: [{ when: "random", avatar_from: "collection:col_a" }] } }),
      ),
    );
    expect(bad.status).toBe(403);
    const good = await createRule(
      ctx(
        "/api/rotation-rules",
        K.orgA,
        json({ target_id: "av_a", target_type: "avatar", priority: 0, rule: { type: "composite", priority: "first_match", rules: [{ when: "random", avatar_from: "collection:col_a" }] } }),
      ),
    );
    expect(good.status).toBe(201);
  });
});

describe("team governance", () => {
  it("lists members with emails", async () => {
    const res = await teamGet(ctx("/api/team?org_id=org_a", K.viewer));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { members: Array<{ email: string; role: string }> };
    expect(data.members.map((m) => m.email).sort()).toEqual(["admin@a.dev", "owner@a.dev", "viewer@a.dev"]);
  });

  it("viewer cannot change roles", async () => {
    const res = await teamPut(
      ctx("/api/team", K.viewer, json({ org_id: "org_a", user_id: "u_admin", role: "viewer" })),
    );
    expect(res.status).toBe(403);
  });

  it("admin cannot touch owners; owner can demote admins", async () => {
    const res = await teamPut(
      ctx("/api/team", K.admin, json({ org_id: "org_a", user_id: "u_owner", role: "viewer" })),
    );
    expect(res.status).toBe(403);
    const ok = await teamPut(
      ctx("/api/team", K.orgA, json({ org_id: "org_a", user_id: "u_admin", role: "developer" })),
    );
    expect(ok.status).toBe(200);
  });

  it("protects the last owner, manages membership lifecycle", async () => {
    expect(
      (await teamDelete(ctx("/api/team?org_id=org_a&user_id=u_owner", K.orgA), )).status,
    ).toBe(400);
    const add = await teamPost(
      ctx("/api/team", K.orgA, json({ org_id: "org_a", email: "stranger@x.dev", role: "developer" })),
    );
    expect(add.status).toBe(201);
    const dup = await teamPost(
      ctx("/api/team", K.orgA, json({ org_id: "org_a", email: "stranger@x.dev", role: "viewer" })),
    );
    expect(dup.status).toBe(409);
    const unknown = await teamPost(
      ctx("/api/team", K.orgA, json({ org_id: "org_a", email: "ghost@x.dev", role: "viewer" })),
    );
    expect(unknown.status).toBe(404);
    const rm = await teamDelete(ctx("/api/team?org_id=org_a&user_id=u_stranger", K.orgA));
    expect(rm.status).toBe(200);
  });
});

describe("analytics rollup loop", () => {
  it("rolls up raw rows and serves them from the dashboard endpoints", async () => {
    const threeHoursAgo = NOW - 3 * 3600;
    await db.insert(usageLogs).values([
      { id: "r1", apiKeyId: "k_org", avatarId: "av_a", region: "US", cacheHit: 1, responseMs: 10, statusCode: 200, createdAt: threeHoursAgo },
      { id: "r2", apiKeyId: "k_org", avatarId: "av_a", region: "US", cacheHit: 0, responseMs: 20, statusCode: 200, createdAt: threeHoursAgo + 5 },
    ]);
    const rolled = await rollupPost(ctx("/api/analytics/rollup", K.orgA, json({})));
    expect(rolled.status).toBe(200);
    const summary = await analyticsGet(ctx("/api/analytics?metric=summary&days=7", K.orgA));
    const s = (await summary.json()) as { total_requests: number };
    expect(s.total_requests).toBeGreaterThanOrEqual(2);
    const reqs = await analyticsGet(ctx("/api/analytics?metric=requests&days=7", K.orgA));
    const r = (await reqs.json()) as { buckets: Array<{ n: number }> };
    expect(r.buckets.reduce((a, b) => a + b.n, 0)).toBeGreaterThanOrEqual(2);
  });
});
