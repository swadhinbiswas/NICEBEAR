import { expect, request as baseRequest, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { authHeaders, state, uid } from "./env";

/**
 * API contract tests (§14): every operation in packages/openapi/spec.yaml is
 * exercised against the live app and must return a DOCUMENTED status —
 * never 404 (missing route) or 500 (unhandled). The coverage self-check at
 * the bottom fails if the spec gains an operation without a case here.
 */

interface Fx {
  colId: string;
  avId: string;
  ruleId: string;
  schId: string;
  hookId: string;
  keyId: string;
}
let fx: Fx;

test.beforeAll(async () => {
  // Manual context: hook-safe (the `request` fixture is test-scoped).
  const request = await baseRequest.newContext({ baseURL: state().baseURL });
  const col = await request.post("/api/collections", {
    headers: authHeaders(),
    data: { name: uid("contract"), engine_type: "minimal" },
  });
  expect(col.status()).toBe(201);
  const colId = ((await col.json()) as { id: string }).id;

  const mkAvatar = async () => {
    const r = await request.post("/api/avatars", {
      headers: authHeaders(),
      data: { collection_id: colId, type: "generated", engine: "minimal" },
    });
    expect(r.status()).toBe(201);
    return ((await r.json()) as { id: string }).id;
  };
  const avId = await mkAvatar();
  const delId = await mkAvatar();

  const rule = await request.post("/api/rotation-rules", {
    headers: authHeaders(),
    data: {
      target_id: avId,
      target_type: "avatar",
      priority: 1,
      rule: { type: "composite", priority: "first_match", rules: [{ when: "every:1d", avatar_from: `collection:${colId}` }] },
    },
  });
  expect(rule.status()).toBe(201);
  const ruleId = ((await rule.json()) as { id: string }).id;

  const sch = await request.post("/api/schedules", {
    headers: authHeaders(),
    data: { rotation_rule_id: ruleId, cron_expr: "0 8 * * *", timezone: "UTC" },
  });
  expect(sch.status()).toBe(201);
  const schId = ((await sch.json()) as { id: string }).id;

  const hook = await request.post("/api/webhooks", {
    headers: authHeaders(),
    data: { url: "https://example.com/contract", secret: "contract-secret-12345", events: ["avatar.changed"] },
  });
  expect(hook.status()).toBe(201);
  const hookId = ((await hook.json()) as { id: string }).id;

  const key = await request.post("/api/api-keys", {
    headers: authHeaders(),
    data: { scope: "read" },
  });
  expect(key.status()).toBe(201);
  const keyId = ((await key.json()) as { id: string }).id;

  fx = { colId, avId, ruleId, schId, hookId, keyId };
  await request.dispose();
});

interface Case {
  covers: string;
  run: (r: APIRequestContext) => Promise<APIResponse>;
  expect: number[];
  contentType?: RegExp;
}

const J = { "content-type": "application/json" };
const H = () => authHeaders();

const cases: Case[] = [
  { covers: "GET /api/avatar/{id}", run: (r) => r.get(`/api/avatar/${fx.avId}`), expect: [200], contentType: /image/ },
  { covers: "GET /api/engines", run: (r) => r.get(`/api/engines`), expect: [200] },
  { covers: "GET /api/avatar/{id}/random", run: (r) => r.get(`/api/avatar/${fx.avId}/random`), expect: [200] },
  { covers: "GET /api/avatar/{id}/refresh", run: (r) => r.get(`/api/avatar/${fx.avId}/refresh`), expect: [200] },
  { covers: "GET /api/avatar/{id}/daily", run: (r) => r.get(`/api/avatar/${fx.avId}/daily`), expect: [200] },
  { covers: "GET /api/avatar/{id}/weekly", run: (r) => r.get(`/api/avatar/${fx.avId}/weekly`), expect: [200] },
  { covers: "GET /api/avatar/{id}/monthly", run: (r) => r.get(`/api/avatar/${fx.avId}/monthly`), expect: [200] },
  { covers: "POST /api/avatar/{id}/custom", run: (r) => r.post(`/api/avatar/${fx.avId}/custom`, { headers: J, data: { cron: "0 0 * * *" } }), expect: [200] },
  { covers: "POST /api/avatars", run: (r) => r.post("/api/avatars", { headers: { ...H(), ...J }, data: { collection_id: fx.colId, type: "generated", engine: "minimal" } }), expect: [201] },
  { covers: "GET /api/avatars/{id}", run: (r) => r.get(`/api/avatars/${fx.avId}`, { headers: H() }), expect: [200] },
  { covers: "DELETE /api/avatars/{id}", run: async (r) => {
      const mk = await r.post("/api/avatars", { headers: { ...H(), ...J }, data: { collection_id: fx.colId, type: "generated", engine: "minimal" } });
      const { id } = (await mk.json()) as { id: string };
      const del = await r.delete(`/api/avatars/${id}`, { headers: H() });
      const gone = await r.get(`/api/avatars/${id}`, { headers: H() });
      expect(gone.status()).toBe(404);
      return del;
    }, expect: [200] },
  { covers: "POST /api/avatars/{id}/rollback", run: (r) => r.post(`/api/avatars/${fx.avId}/rollback`, { headers: { ...H(), ...J }, data: { version: 9 } }), expect: [404] },
  { covers: "POST /api/collections", run: (r) => r.post("/api/collections", { headers: { ...H(), ...J }, data: { name: uid("c"), engine_type: "minimal" } }), expect: [201] },
  { covers: "GET /api/collections", run: (r) => r.get("/api/collections", { headers: H() }), expect: [200] },
  { covers: "GET /api/collections/{id}", run: (r) => r.get(`/api/collections/${fx.colId}`, { headers: H() }), expect: [200] },
  { covers: "POST /api/collections/{id}/avatars", run: (r) => r.post(`/api/collections/${fx.colId}/avatars`, { headers: { ...H(), ...J }, data: { avatar_id: fx.avId } }), expect: [200] },
  { covers: "POST /api/rotation-rules", run: (r) => r.post("/api/rotation-rules", { headers: { ...H(), ...J }, data: { target_id: fx.avId, target_type: "avatar", priority: 2, rule: { type: "composite", priority: "first_match", rules: [{ when: "weekday:mon", avatar: fx.avId }] } } }), expect: [201] },
  { covers: "GET /api/rotation-rules", run: (r) => r.get(`/api/rotation-rules?target_type=avatar&target_id=${fx.avId}`, { headers: H() }), expect: [200] },
  { covers: "PUT /api/rotation-rules/{id}", run: (r) => r.put(`/api/rotation-rules/${fx.ruleId}`, { headers: { ...H(), ...J }, data: { priority: 7 } }), expect: [200] },
  { covers: "POST /api/schedules", run: (r) => r.post("/api/schedules", { headers: { ...H(), ...J }, data: { rotation_rule_id: fx.ruleId, timezone: "UTC" } }), expect: [201] },
  { covers: "GET /api/schedules", run: (r) => r.get(`/api/schedules?rotation_rule_id=${fx.ruleId}`, { headers: H() }), expect: [200] },
  { covers: "POST /api/api-keys", run: (r) => r.post("/api/api-keys", { headers: { ...H(), ...J }, data: { scope: "read" } }), expect: [201] },
  { covers: "GET /api/api-keys", run: (r) => r.get("/api/api-keys", { headers: H() }), expect: [200] },
  { covers: "GET /api/api-keys/self", run: (r) => r.get("/api/api-keys/self", { headers: H() }), expect: [200], },
  { covers: "GET /api/orgs/mine", run: (r) => r.get("/api/orgs/mine", { headers: H() }), expect: [200] },
  { covers: "DELETE /api/api-keys/{id}", run: (r) => r.delete(`/api/api-keys/${fx.keyId}`, { headers: H() }), expect: [200] },
  { covers: "POST /api/api-keys/{id}/rotate", run: async (r) => {
      const mk = await r.post("/api/api-keys", { headers: { ...H(), ...J }, data: { scope: "read" } });
      const { id } = (await mk.json()) as { id: string };
      const rot = await r.post(`/api/api-keys/${id}/rotate`, { headers: H() });
      await r.delete(`/api/api-keys/${id}`, { headers: H() });
      return rot;
    }, expect: [200] },
  { covers: "POST /api/webhooks", run: (r) => r.post("/api/webhooks", { headers: { ...H(), ...J }, data: { url: "https://example.com/contract-2", secret: "contract-secret-12345", events: ["quota.reached"] } }), expect: [201] },
  { covers: "GET /api/webhooks", run: (r) => r.get("/api/webhooks", { headers: H() }), expect: [200] },
  { covers: "GET /api/webhooks/{id}/deliveries", run: (r) => r.get(`/api/webhooks/${fx.hookId}/deliveries`, { headers: H() }), expect: [200] },
  { covers: "POST /api/webhooks/process", run: (r) => r.post("/api/webhooks/process", { headers: { ...H(), ...J }, data: {} }), expect: [200] },
  { covers: "GET /api/analytics", run: (r) => r.get("/api/analytics?metric=summary&days=7", { headers: H() }), expect: [200], contentType: /json/ },
  { covers: "POST /api/analytics/rollup", run: (r) => r.post("/api/analytics/rollup", { headers: H() }), expect: [200] },
  { covers: "POST /api/report", run: (r) => r.post("/api/report", { headers: J, data: { avatar_id: fx.avId, reason: "contract probe" } }), expect: [202] },
  { covers: "GET /api/team", run: (r) => r.get(`/api/team?org_id=${state().orgId}`, { headers: H() }), expect: [200] },
  { covers: "POST /api/team", run: (r) => r.post("/api/team", { headers: { ...H(), ...J }, data: { org_id: state().orgId, email: "mate@e2e.dev", role: "viewer" } }), expect: [201, 409] },
  { covers: "PUT /api/team", run: (r) => r.put("/api/team", { headers: { ...H(), ...J }, data: { org_id: state().orgId, user_id: "u_e2e_mate", role: "developer" } }), expect: [200, 404] },
  { covers: "DELETE /api/team", run: (r) => r.delete(`/api/team?org_id=${state().orgId}&user_id=u_e2e_mate`, { headers: H() }), expect: [200, 404] },
];

for (const c of cases) {
  test(`contract ${c.covers} → ${c.expect.join("/")}`, async ({ request }) => {
    const res = await c.run(request);
    expect(c.expect, c.covers).toContain(res.status());
    expect(res.status(), `${c.covers} (never 500)`).not.toBe(500);
    if (c.contentType) {
      expect(res.headers()["content-type"], c.covers).toMatch(c.contentType);
    }
  });
}

test("spec coverage: every documented operation has a case", () => {
  const specPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "openapi", "spec.yaml");
  const spec = parse(readFileSync(specPath, "utf8")) as { paths: Record<string, Record<string, unknown>> };
  const documented = new Set<string>();
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const method of Object.keys(ops)) {
      if (["get", "post", "put", "delete", "patch"].includes(method)) {
        documented.add(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  const covered = new Set(cases.map((c) => c.covers));
  const missing = [...documented].filter((op) => !covered.has(op));
  const stale = [...covered].filter((op) => !documented.has(op));
  expect({ missing, stale }).toEqual({ missing: [], stale: [] });
});
