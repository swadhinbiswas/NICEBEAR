import { expect, test } from "@playwright/test";
import { state } from "./env";

/** Dashboard navigation + island hydration (§14). */
test.describe("dashboard", () => {
  test("key gate renders without a key", async ({ page }) => {
    await page.goto("/dashboard/api-keys");
    await expect(page.getByText("NiceBear dashboard")).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();
  });

  test("islands hydrate and load data with a stored key", async ({ browser }) => {
    const s = state();
    const context = await browser.newContext();
    await context.addInitScript(
      ({ key }) => {
        localStorage.setItem("nb_api_key", key);
      },
      { key: s.key },
    );
    const page = await context.newPage();

    await page.goto("/dashboard/api-keys");
    await expect(page.getByRole("button", { name: "Mint key" })).toBeVisible({ timeout: 15000 });

    await page.goto("/dashboard/webhooks");
    await expect(page.getByRole("button", { name: "Add webhook" })).toBeVisible({ timeout: 15000 });

    await page.goto("/dashboard/collections");
    await expect(page.getByRole("button", { name: "Create", exact: true })).toBeVisible({ timeout: 15000 });

    await page.goto("/dashboard/analytics");
    await expect(page.getByText("Requests per day")).toBeVisible({ timeout: 15000 });

    await page.goto("/dashboard/team");
    await expect(page.getByRole("button", { name: "Add member" })).toBeVisible({ timeout: 15000 });

    await context.close();
  });

  test("playground renders keyless and previews variants", async ({ page, request }) => {
    // Seed a public avatar to preview.
    const col = await request.post("/api/collections", {
      headers: { authorization: `Bearer ${state().key}` },
      data: { name: `e2e-pg-${Date.now()}`, engine_type: "geometric" },
    });
    const { id: colId } = (await col.json()) as { id: string };
    const av = await request.post("/api/avatars", {
      headers: { authorization: `Bearer ${state().key}` },
      data: { collection_id: colId, type: "generated", engine: "geometric" },
    });
    const { id: avId } = (await av.json()) as { id: string };

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Playground" })).toBeVisible();
    const idInput = page.getByPlaceholder("avatar id (av_…)");
    // Fill can race island hydration (React keeps the DOM value but drops
    // the state update); re-sync until the preview grid renders.
    await expect(async () => {
      await idInput.clear();
      await idInput.fill(avId);
      expect(await page.locator("figure").count()).toBe(5);
    }).toPass({ timeout: 25000 });
    const imgs = page.locator("figure img");
    await expect(imgs).toHaveCount(5, { timeout: 15000 });
    for (const img of await imgs.all()) {
      await expect(img).toHaveAttribute("src", new RegExp(`/api/avatar/${avId}`));
    }
  });

  test("nav links reach every dashboard page", async ({ page }) => {
    await page.goto("/dashboard");
    for (const href of [
      "/dashboard/collections",
      "/dashboard/api-keys",
      "/dashboard/webhooks",
      "/dashboard/analytics",
      "/dashboard/team",
      "/dashboard/support",
    ]) {
      const res = await page.goto(href);
      expect(res?.status(), href).toBe(200);
    }
  });

  test("support page is free-forever with an optional donate button", async ({ page }) => {
    await page.goto("/dashboard/support");
    await expect(page.getByText("NiceBear is free forever")).toBeVisible();
    // E2E env sets DONATE_URL, so the button renders and points outward.
    const donate = page.getByRole("link", { name: "Donate" });
    await expect(donate).toBeVisible();
    expect(await donate.getAttribute("href")).toBe("https://example.com/donate");
  });
});
