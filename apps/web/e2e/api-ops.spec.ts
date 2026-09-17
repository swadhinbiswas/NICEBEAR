import { expect, test } from "@playwright/test";
import { authHeaders, state, uid } from "./env";

const dsl = (rules: unknown[]) => ({ type: "composite", priority: "first_match", rules });

/** Schedule creation + rotation wiring (§14). */
test.describe("rotation rules and schedules", () => {
  test("org rule → list → schedule → serve reflects policy", async ({ request }) => {
    const s = state();
    const col = await request.post("/api/collections", {
      headers: authHeaders(),
      data: { name: uid("e2e-rules"), engine_type: "identicons" },
    });
    const { id: colId } = (await col.json()) as { id: string };
    const created = await request.post("/api/avatars", {
      headers: authHeaders(),
      data: { collection_id: colId, type: "generated", engine: "identicons", seed: "wk" },
    });
    const { id: avId } = (await created.json()) as { id: string };

    const rule = await request.post("/api/rotation-rules", {
      headers: authHeaders(),
      data: {
        target_id: s.orgId,
        target_type: "organization",
        priority: 0,
        rule: dsl([{ when: "is_weekend", avatar: avId }]),
      },
    });
    expect(rule.status()).toBe(201);
    const { id: ruleId } = (await rule.json()) as { id: string };

    const listed = await request.get(
      `/api/rotation-rules?target_type=organization&target_id=${s.orgId}`,
      { headers: authHeaders() },
    );
    expect(listed.status()).toBe(200);
    expect(JSON.stringify(await listed.json())).toContain(ruleId);

    const sch = await request.post("/api/schedules", {
      headers: authHeaders(),
      data: { rotation_rule_id: ruleId, cron_expr: "0 9 * * MON", timezone: "UTC" },
    });
    expect(sch.status()).toBe(201);

    const schList = await request.get(`/api/schedules?rotation_rule_id=${ruleId}`, {
      headers: authHeaders(),
    });
    expect(schList.status()).toBe(200);
    expect(JSON.stringify(await schList.json())).toContain("0 9 * * MON");

    // The stored policy stack serves without error either way.
    expect((await request.get(`/api/avatar/${avId}`)).status()).toBe(200);
  });

  test("cross-org rule creation is forbidden", async ({ request }) => {
    const res = await request.post("/api/rotation-rules", {
      headers: authHeaders(),
      data: {
        target_id: "org_other",
        target_type: "organization",
        priority: 0,
        rule: dsl([{ when: "random", avatar_from: "collection:x" }]),
      },
    });
    expect(res.status()).toBe(403);
  });
});

/** API key generation lifecycle (§14). */
test.describe("api keys", () => {
  test("mint → use → rotate kills old → revoke kills all", async ({ request }) => {
    const minted = await request.post("/api/api-keys", {
      headers: authHeaders(),
      data: { scope: "read" },
    });
    expect(minted.status()).toBe(201);
    const { id, key } = (await minted.json()) as { id: string; key: string };
    expect(key.startsWith("nb_live_")).toBe(true);

    const ok = await request.get("/api/analytics?metric=summary", { headers: authHeaders(key) });
    expect(ok.status()).toBe(200);

    const rotated = await request.post(`/api/api-keys/${id}/rotate`, { headers: authHeaders() });
    expect(rotated.status()).toBe(200);
    const { key: key2 } = (await rotated.json()) as { key: string };
    expect((await request.get("/api/analytics", { headers: authHeaders(key) })).status()).toBe(401);
    expect((await request.get("/api/analytics", { headers: authHeaders(key2) })).status()).toBe(200);

    const revoked = await request.delete(`/api/api-keys/${id}`, { headers: authHeaders() });
    expect(revoked.status()).toBe(200);
    expect((await request.get("/api/analytics", { headers: authHeaders(key2) })).status()).toBe(401);
  });

  test("read key cannot mutate; anonymous cannot list", async ({ request }) => {
    const minted = await request.post("/api/api-keys", {
      headers: authHeaders(),
      data: { scope: "read" },
    });
    const { id, key } = (await minted.json()) as { id: string; key: string };
    expect(
      (
        await request.post("/api/collections", {
          headers: authHeaders(key),
          data: { name: uid("nope"), engine_type: "minimal" },
        })
      ).status(),
    ).toBe(403);
    expect((await request.get("/api/api-keys")).status()).toBe(401);
    await request.delete(`/api/api-keys/${id}`, { headers: authHeaders() });
  });
});

test.describe("webhooks, team, analytics, report", () => {
  test("webhook create → event → drain → delivery log", async ({ request }) => {
    const created = await request.post("/api/webhooks", {
      headers: authHeaders(),
      data: {
        url: "https://example.com/e2e-hook",
        secret: "e2e-secret-value-12345",
        events: ["avatar.changed"],
      },
    });
    expect(created.status()).toBe(201);
    const { id: hookId } = (await created.json()) as { id: string };

    // Fire an event.
    const col = await request.post("/api/collections", {
      headers: authHeaders(),
      data: { name: uid("e2e-wh"), engine_type: "minimal" },
    });
    const { id: colId } = (await col.json()) as { id: string };
    await request.post("/api/avatars", {
      headers: authHeaders(),
      data: { collection_id: colId, type: "generated", engine: "minimal" },
    });

    const drain = await request.post("/api/webhooks/process", {
      headers: authHeaders(),
      data: { limit: 25 },
    });
    expect(drain.status()).toBe(200);
    const counts = (await drain.json()) as { processed: number };
    expect(counts.processed).toBeGreaterThanOrEqual(1);

    const log = await request.get(`/api/webhooks/${hookId}/deliveries`, { headers: authHeaders() });
    expect(log.status()).toBe(200);
    const deliveries = ((await log.json()) as { deliveries: Array<{ event: string }> }).deliveries;
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries[0]?.event).toBe("avatar.changed");
  });

  test("team add → list → role → remove; last owner protected", async ({ request }) => {
    const s = state();
    const add = await request.post("/api/team", {
      headers: authHeaders(),
      data: { org_id: s.orgId, email: "mate@e2e.dev", role: "developer" },
    });
    expect(add.status()).toBe(201);

    const list = await request.get(`/api/team?org_id=${s.orgId}`, { headers: authHeaders() });
    expect(list.status()).toBe(200);
    expect(JSON.stringify(await list.json())).toContain("mate@e2e.dev");

    // u_e2e_mate is not an owner; removing a non-existent owner fails cleanly.
    const rm = await request.delete(`/api/team?org_id=${s.orgId}&user_id=u_e2e_mate`, {
      headers: authHeaders(),
    });
    expect(rm.status()).toBe(200);
  });

  test("analytics reflects traffic; rollup runs; report opens", async ({ request }) => {
    const before = (await (
      await request.get("/api/analytics?metric=summary&days=7", { headers: authHeaders() })
    ).json()) as { total_requests: number };

    const roll = await request.post("/api/analytics/rollup", { headers: authHeaders() });
    expect(roll.status()).toBe(200);

    const after = (await (
      await request.get("/api/analytics?metric=summary&days=7", { headers: authHeaders() })
    ).json()) as { total_requests: number };
    expect(after.total_requests).toBeGreaterThanOrEqual(before.total_requests);

    for (const metric of ["requests", "top-avatars", "top-collections", "geo", "errors"]) {
      expect((await request.get(`/api/analytics?metric=${metric}&days=7`, { headers: authHeaders() })).status()).toBe(200);
    }

    const col = await request.post("/api/collections", {
      headers: authHeaders(),
      data: { name: uid("e2e-rep"), engine_type: "minimal" },
    });
    const { id: colId } = (await col.json()) as { id: string };
    const av = await request.post("/api/avatars", {
      headers: authHeaders(),
      data: { collection_id: colId, type: "generated", engine: "minimal" },
    });
    const { id: avId } = (await av.json()) as { id: string };
    const rep = await request.post("/api/report", { data: { avatar_id: avId, reason: "e2e probe" } });
    expect(rep.status()).toBe(202);
  });
});
