import { expect, test } from "@playwright/test";
import { authHeaders, state, uid } from "./env";

/**
 * Upload flow (§14): collection → avatar → serve in every variant.
 * Each test mints its own resources (parallel-safe by unique ids).
 */
test.describe("avatar lifecycle", () => {
  test("collection create → generated avatar → serve all variants", async ({ request }) => {
    const s = state();
    const name = uid("e2e-team");

    const col = await request.post("/api/collections", {
      headers: authHeaders(),
      data: { name, engine_type: "pixel-art" },
    });
    expect(col.status()).toBe(201);
    const { id: colId } = (await col.json()) as { id: string };

    const created = await request.post("/api/avatars", {
      headers: authHeaders(),
      data: { collection_id: colId, type: "generated", engine: "pixel-art", seed: "e2e" },
    });
    expect(created.status()).toBe(201);
    const { id: avId } = (await created.json()) as { id: string };

    for (const path of ["", "/daily", "/weekly", "/monthly", "/random", "/refresh"]) {
      const res = await request.get(`/api/avatar/${avId}${path}?seed=e2e`);
      expect(res.status(), path || "/").toBe(200);
      expect(res.headers()["content-type"]).toContain("image/svg+xml");
    }

    const custom = await request.post(`/api/avatar/${avId}/custom`, {
      headers: { "content-type": "application/json" },
      data: { every: "3 days" },
    });
    expect(custom.status()).toBe(200);

    const meta = await request.get(`/api/avatars/${avId}`, { headers: authHeaders() });
    expect(meta.status()).toBe(200);
    expect(((await meta.json()) as { source_type: string }).source_type).toBe("generated");

    const del = await request.delete(`/api/avatars/${avId}`, { headers: authHeaders() });
    expect(del.status()).toBe(200);
    expect((await request.get(`/api/avatar/${avId}`)).status()).toBe(404);
    void s;
  });

  test("content policy enforced: attestation + validation errors", async ({ request }) => {
    const bad = await request.post("/api/avatars", {
      headers: authHeaders(),
      data: { type: "external_url", source_url: "https://example.com/a.png", attest_rights: false },
    });
    expect(bad.status()).toBe(400);
    expect(JSON.stringify(await bad.json())).toContain("attest_rights");

    const evil = await request.post("/api/avatars", {
      headers: authHeaders(),
      data: { type: "external_url", source_url: "http://169.254.169.254/x.png", attest_rights: true },
    });
    expect(evil.status()).toBe(400);

    const unknown = await request.post("/api/avatars", {
      headers: authHeaders(),
      data: { type: "bulk_import_from_platform", url: "https://x" },
    });
    expect(unknown.status()).toBe(400);

    const badCustom = await request.post("/api/avatar/av_nope/custom", {
      headers: { "content-type": "application/json" },
      data: { every: "sometimes" },
    });
    expect(badCustom.status()).toBe(400);
  });

  test("rollback without history 404s; missing avatar 404s", async ({ request }) => {
    const col = await request.post("/api/collections", {
      headers: authHeaders(),
      data: { name: uid("e2e-rb"), engine_type: "geometric" },
    });
    const { id: colId } = (await col.json()) as { id: string };
    const created = await request.post("/api/avatars", {
      headers: authHeaders(),
      data: { collection_id: colId, type: "generated", engine: "geometric" },
    });
    const { id: avId } = (await created.json()) as { id: string };

    const rb = await request.post(`/api/avatars/${avId}/rollback`, {
      headers: authHeaders(),
      data: { version: 2 },
    });
    expect(rb.status()).toBe(404);
    expect((await request.get("/api/avatars/av_missing", { headers: authHeaders() })).status()).toBe(404);
  });
});
