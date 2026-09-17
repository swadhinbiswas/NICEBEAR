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

  test("formats: png raster, gif animation, engine catalog", async ({ request }) => {
    const col = await request.post("/api/collections", {
      headers: authHeaders(),
      data: { name: uid("e2e-fmt"), engine_type: "bauhaus" },
    });
    const { id: colId } = (await col.json()) as { id: string };
    const created = await request.post("/api/avatars", {
      headers: authHeaders(),
      data: { collection_id: colId, type: "generated", engine: "bauhaus" },
    });
    const { id: avId } = (await created.json()) as { id: string };

    const png = await request.get(`/api/avatar/${avId}?format=png&w=64`);
    expect(png.status()).toBe(200);
    expect(png.headers()["content-type"]).toBe("image/png");
    expect(Buffer.from(await png.body()).subarray(0, 4).toString("hex")).toBe("89504e47");

    const badFormat = await request.get(`/api/avatar/${avId}?format=bmp`);
    expect(badFormat.status()).toBe(400);

    const gifOnStatic = await request.get(`/api/avatar/${avId}?format=gif`);
    expect(gifOnStatic.status()).toBe(400);

    // Animated collection defaults to gif without an explicit format.
    const acol = await request.post("/api/collections", {
      headers: authHeaders(),
      data: { name: uid("e2e-anim"), engine_type: "blink" },
    });
    const { id: acolId } = (await acol.json()) as { id: string };
    const acreated = await request.post("/api/avatars", {
      headers: authHeaders(),
      data: { collection_id: acolId, type: "generated", engine: "blink" },
    });
    const { id: aavId } = (await acreated.json()) as { id: string };
    const gif = await request.get(`/api/avatar/${aavId}`);
    expect(gif.status()).toBe(200);
    expect(gif.headers()["content-type"]).toBe("image/gif");

    const engines = await request.get("/api/engines");
    expect(engines.status()).toBe(200);
    const ids = ((await engines.json()) as { engines: Array<{ id: string }> }).engines.map((e) => e.id);
    for (const want of ["personas", "blink", "bauhaus", "mixed"]) {
      expect(ids).toContain(want);
    }
  });
});
