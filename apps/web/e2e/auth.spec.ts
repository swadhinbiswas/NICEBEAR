import { expect, request as baseRequest, test } from "@playwright/test";
import { state, uid } from "./env";

/** Session auth: signup → cookie → API + dashboard, team invite loop, logout. */
test.describe("auth sessions", () => {
  test("signup provisions identity; session authenticates API; logout kills it", async ({ request }) => {
    const email = `${uid("sess")}@t.dev`;
    const signup = await request.post("/api/auth/sign-up/email", {
      data: { name: "Sess", email, password: "password123" },
    });
    expect(signup.status()).toBe(200);

    const me = await request.get("/api/auth/get-session");
    expect(me.status()).toBe(200);
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe(email);

    // Session (no bearer) reaches authed routes as the user.
    const who = await request.get("/api/api-keys/self");
    expect(who.status()).toBe(200);
    const whoJson = (await who.json()) as { owner_type: string; scope: string };
    expect(whoJson.owner_type).toBe("user");
    expect(whoJson.scope).toBe("admin");

    // better-auth 1.7 requires an Origin header on state-changing calls
    // (browsers send it automatically; raw API clients must set it).
    const out = await request.post("/api/auth/sign-out", {
      headers: { "content-type": "application/json", origin: state().baseURL },
      data: {},
    });
    expect(out.status()).toBe(200);
    // better-auth answers 200 + null body for dead sessions (not 401).
    expect(await (await request.get("/api/auth/get-session")).json()).toBeNull();
  });

  test("full team invite loop between two signed-up users", async () => {
    const s = state();
    const ctxA = await baseRequest.newContext({ baseURL: s.baseURL });
    const ctxB = await baseRequest.newContext({ baseURL: s.baseURL });
    try {
      const emailA = `${uid("owner-a")}@t.dev`;
      const emailB = `${uid("member-b")}@t.dev`;
      expect((await ctxA.post("/api/auth/sign-up/email", { data: { name: "OwnerA", email: emailA, password: "password123" } })).status()).toBe(200);
      expect((await ctxB.post("/api/auth/sign-up/email", { data: { name: "MemberB", email: emailB, password: "password123" } })).status()).toBe(200);

      // A's personal org (auto-created at signup).
      const mineA = (await (await ctxA.get("/api/orgs/mine")).json()) as { orgs: Array<{ id: string }> };
      expect(mineA.orgs).toHaveLength(1);
      const orgA = mineA.orgs[0]!.id;

      // B cannot see A's org yet.
      const mineB = (await (await ctxB.get("/api/orgs/mine")).json()) as { orgs: Array<{ id: string }> };
      expect(mineB.orgs.map((o) => o.id)).not.toContain(orgA);

      // A invites B as developer.
      const invite = await ctxA.post("/api/team", { data: { org_id: orgA, email: emailB, role: "developer" } });
      expect(invite.status()).toBe(201);

      // B now sees the org + membership; can create collections, cannot manage roles.
      const mineB2 = (await (await ctxB.get("/api/team?org_id=" + orgA)).json()) as { members: Array<{ email: string }> };
      expect(mineB2.members.map((m) => m.email)).toContain(emailB);
      const create = await ctxB.post(`/api/collections?org_id=${orgA}`, { data: { name: uid("b-col"), engine_type: "minimal" } });
      expect(create.status()).toBe(201);
      const forbidden = await ctxB.put("/api/team", { data: { org_id: orgA, user_id: "u_x", role: "viewer" } });
      expect([403, 404]).toContain(forbidden.status());
    } finally {
      await ctxA.dispose();
      await ctxB.dispose();
    }
  });

  test("dashboard honors session cookie (no key gate)", async ({ browser, request }) => {
    const email = `${uid("dashsess")}@t.dev`;
    const signup = await request.post("/api/auth/sign-up/email", {
      data: { name: "Dash", email, password: "password123" },
    });
    expect(signup.status()).toBe(200);

    // Transplant the session cookie into a fresh browser context.
    const setCookie = signup.headers()["set-cookie"] ?? "";
    const m = /better-auth\.session_token=([^;]+)/.exec(setCookie);
    expect(m, "signup sets session cookie").not.toBeNull();
    const context = await browser.newContext();
    await context.addCookies([
      { name: "better-auth.session_token", value: m![1]!, domain: "127.0.0.1", path: "/" },
    ]);
    const page = await context.newPage();
    await page.goto("/dashboard/api-keys");
    await expect(page.getByRole("button", { name: "Mint key" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(`connected as ${email}`)).toBeVisible();
    await context.close();
  });

  test("login page: no GitHub button without OAuth, email signup works", async ({ page }) => {
    // Generous budget: first browser hit compiles the island bundle in dev.
    test.setTimeout(120_000);
    await page.goto("/login");
    await expect(page.getByText("Sign in to NiceBear")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with GitHub" })).toHaveCount(0);
    // Clicks/fills can land pre-hydration (React keeps the DOM value but drops
    // the state update, so validation silently fails). Two guards make this
    // deterministic: the submit stays disabled until mount (proof of
    // hydration), and every attempt uses a fresh email so a retry can never
    // poison itself with "already exists" 400s.
    const emailInput = page.getByPlaceholder("Email");
    const passInput = page.getByPlaceholder("Password (8+ chars)");
    const submitBtn = page.getByRole("button", { name: "Create account" });
    await expect(async () => {
      if (!page.url().includes("/login")) return;
      const attemptEmail = `${uid("webup")}-${Date.now()}@t.dev`;
      // Prove hydration first (submits stay disabled until mount); every
      // interaction after this point syncs with React state.
      await expect(page.locator("form").getByRole("button", { name: "Sign in", exact: true })).toBeEnabled({
        timeout: 30000,
      });
      await page.getByRole("button", { name: "Sign up", exact: true }).click();
      await emailInput.fill(attemptEmail);
      await passInput.fill("password123");
      await submitBtn.click();
      await page.waitForURL("**/dashboard", { timeout: 45000 });
    }).toPass({ timeout: 120000 });
    await expect(page.getByRole("heading", { name: "Playground" })).toBeVisible();
  });
});
