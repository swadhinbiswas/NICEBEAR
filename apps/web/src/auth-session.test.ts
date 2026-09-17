import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireAuth, requireOrgRole } from "./lib/api/authed";
import { getAuth, provisionUser } from "./lib/auth/server";
import type { AppEnv } from "./lib/runtime/env";
import { authUser, memberships, organizations, users } from "./lib/db/schema";
import { createFileDb, type TestDatabase } from "./lib/test/db";

let db: TestDatabase;
let env: AppEnv;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  // File-backed DB: the auth module opens its own handle via getDb, so the
  // test and the module must share a URL (in-memory would be per-connection).
  const f = await createFileDb();
  db = f.db;
  env = { TURSO_DATABASE_URL: f.url, NODE_ENV: "test" };
  cleanup = f.cleanup;
});

afterAll(async () => cleanup());

function sessionCookie(setCookie: string | null): string {
  const m = /better-auth\.session_token=([^;]+)/.exec(setCookie ?? "");
  if (!m) throw new Error("no session cookie in response");
  return `better-auth.session_token=${m[1]}`;
}

describe("better-auth sessions", () => {
  it("signup provisions domain user + personal org", async () => {
    const auth = getAuth(env);
    const email = `qa-${Date.now()}@e2e.dev`;
    const res = (await auth.api.signUpEmail({ body: { name: "QA", email, password: "password123" } })) as {
      user: { id: string };
    };
    const userRows = await db.select().from(users).where(eq(users.id, res.user.id));
    expect(userRows).toHaveLength(1);
    expect(userRows[0]?.email).toBe(email);
    const mems = await db.select().from(memberships).where(eq(memberships.userId, res.user.id));
    expect(mems).toHaveLength(1);
    expect(mems[0]?.role).toBe("owner");
    const orgs = await db.select().from(organizations).where(eq(organizations.id, mems[0]!.orgId));
    expect(orgs).toHaveLength(1);
    const authRows = await db.select().from(authUser).where(eq(authUser.id, res.user.id));
    expect(authRows).toHaveLength(1);
  });

  it("rejects duplicate signup and wrong passwords", async () => {
    const auth = getAuth(env);
    const email = `dup-${Date.now()}@e2e.dev`;
    await auth.api.signUpEmail({ body: { name: "D", email, password: "password123" } });
    await expect(
      auth.api.signUpEmail({ body: { name: "D", email, password: "password123" } }),
    ).rejects.toThrow();
    await expect(
      auth.api.signInEmail({ body: { email, password: "wrongpass1" } }),
    ).rejects.toThrow();
  });

  it("signin issues a session cookie that authenticates API routes", async () => {
    const auth = getAuth(env);
    const email = `sess-${Date.now()}@e2e.dev`;
    const signed = (await auth.api.signUpEmail({ body: { name: "S", email, password: "password123" } })) as {
      user: { id: string };
    };
    const login = (await auth.api.signInEmail({
      body: { email, password: "password123" },
      headers: new Headers(),
      asResponse: true,
    })) as unknown as Response;
    const cookie = sessionCookie(login.headers.get("set-cookie"));

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.id).toBe(signed.user.id);

    // Session (no bearer) passes requireAuth as the user, gated by memberships.
    const ctx = await requireAuth(
      new Request("http://test/api/collections", { headers: { cookie } }),
      { runtime: { env: { TURSO_DATABASE_URL: (env as { TURSO_DATABASE_URL: string }).TURSO_DATABASE_URL } } },
      "admin",
    );
    expect(ctx.auth.ownerType).toBe("user");
    expect(ctx.auth.ownerId).toBe(signed.user.id);
    const mems = await db.select().from(memberships).where(eq(memberships.userId, signed.user.id));
    await expect(requireOrgRole(ctx.db, ctx.auth, mems[0]!.orgId, "developer")).resolves.toBe(
      mems[0]!.orgId,
    );
  });

  it("present-but-invalid bearer fails closed (no session downgrade)", async () => {
    const locals = { runtime: { env: { TURSO_DATABASE_URL: (env as { TURSO_DATABASE_URL: string }).TURSO_DATABASE_URL } } };
    await expect(
      requireAuth(new Request("http://test/api/collections"), locals, "read"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("sign-out invalidates the session", async () => {
    const auth = getAuth(env);
    const email = `bye-${Date.now()}@e2e.dev`;
    await auth.api.signUpEmail({ body: { name: "B", email, password: "password123" } });
    const login = (await auth.api.signInEmail({
      body: { email, password: "password123" },
      headers: new Headers(),
      asResponse: true,
    })) as unknown as Response;
    const cookie = sessionCookie(login.headers.get("set-cookie"));
    await auth.api.signOut({ headers: new Headers({ cookie }) });
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });

  it("provisionUser is idempotent", async () => {
    const first = await provisionUser(db, { id: "u_prov", email: "prov@e2e.dev", name: "P" });
    const second = await provisionUser(db, { id: "u_prov", email: "prov@e2e.dev", name: "P" });
    expect(second.orgId).toBe(first.orgId);
    const mems = await db.select().from(memberships).where(eq(memberships.userId, "u_prov"));
    expect(mems).toHaveLength(1);
  });
});
