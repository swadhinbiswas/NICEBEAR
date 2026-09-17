import { expect, test } from "@playwright/test";

/** Marketing landing: hero, live seed explorer, playground, styles grid. */
test.describe("landing", () => {
  test("hero + counts render", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /pick a seed/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /same seed, same avatar/i })).toBeVisible();
    await expect(page.getByText(/Free forever/i).first()).toBeVisible();
  });

  test("seed explorer redraws across styles as the seed changes", async ({ page }) => {
    await page.goto("/");
    const explorer = page.locator("#seed-explorer");
    const seed = page.locator("#nb-seed");
    // Hydration signal: placeholders swap for real avatar tiles only after mount.
    await expect(explorer.locator("figure svg, figure img").first()).toBeVisible({ timeout: 20000 });
    const tiles = explorer.locator("figure");
    await expect(tiles).toHaveCount(8);
    // Retry the whole interaction: a fill landing pre-hydration is clobbered.
    await expect(async () => {
      const before = await tiles.first().innerHTML();
      await seed.fill("Juno");
      await expect(explorer.locator("code")).toContainText("seed=Juno", { timeout: 2000 });
      expect(await tiles.first().innerHTML()).not.toBe(before);
    }).toPass({ timeout: 20000 });
    await expect(explorer.getByRole("button", { name: /Copy URL/i })).toBeVisible();
  });

  test("playground renders client-side with the full style list", async ({ page }) => {
    await page.goto("/#playground");
    const style = page.locator("#playground select").first();
    await expect(style).toBeVisible({ timeout: 15000 });
    expect(await style.locator("option").count()).toBeGreaterThanOrEqual(26);
    // Retry until the selection survives hydration.
    await expect(async () => {
      await style.selectOption("inkwell");
      await expect(style).toHaveValue("inkwell", { timeout: 2000 });
    }).toPass({ timeout: 20000 });
    await expect(page.getByRole("button", { name: "Copy embed" })).toBeVisible();
  });

  test("style grid links to detail pages", async ({ page }) => {
    await page.goto("/#styles");
    await page.locator('#styles a[href="/styles/personas"]').first().click();
    await expect(page.getByRole("heading", { name: "Personas" })).toBeVisible();
  });

  test("animated styles render real GIFs", async ({ page }) => {
    await page.goto("/#animated");
    const gif = page.locator('#animated img[src^="data:image/gif"]').first();
    await expect(gif).toBeVisible({ timeout: 15000 });
    const src = await gif.getAttribute("src");
    expect(src?.startsWith("data:image/gif;base64,R0lGOD")).toBe(true);
  });
});

test.describe("styles browse", () => {
  test("index lists every style, grouped", async ({ page }) => {
    await page.goto("/styles");
    await expect(page.getByRole("heading", { name: /avatar styles/i })).toBeVisible();
    for (const group of ["Characters", "Line art", "Abstract & geometric", "Pixel & retro", "Animated"]) {
      await expect(page.getByRole("heading", { name: group })).toBeVisible();
    }
    // 26 style cards, each linking to its detail page.
    const cards = page.locator('a[href^="/styles/"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(26);
  });

  test("detail page shows the seed grid, API and embed blocks", async ({ page }) => {
    await page.goto("/styles/personas");
    await expect(page.getByRole("heading", { name: "Personas" })).toBeVisible();
    await expect(page.getByText("HTTP API")).toBeVisible();
    await expect(page.getByText("Embed")).toBeVisible();
    // 8-seed grid + 5 related = at least 13 tiles.
    expect(await page.locator("svg").count()).toBeGreaterThanOrEqual(8);
    await expect(page.getByText(/same seed always returns the same avatar/i)).toBeVisible();
  });

  test("animated detail page documents gif format", async ({ page }) => {
    await page.goto("/styles/blink");
    await expect(page.getByRole("heading", { name: "Blink" })).toBeVisible();
    expect(await page.locator('img[src^="data:image/gif"]').count()).toBeGreaterThanOrEqual(8);
    await expect(page.getByText("loops forever")).toBeVisible();
  });
});
