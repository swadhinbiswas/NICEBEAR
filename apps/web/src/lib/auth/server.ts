import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  memberships,
  organizations,
  users,
} from "../db/schema";
import { newId } from "../ids";
import { getDb, type AppEnv } from "../runtime/env";

/**
 * Better Auth server (§1, §9): GitHub OAuth primary, email/password for
 * self-host. Identity lives in better-auth's own tables; our domain `users`
 * row shares the same id, provisioned on first user creation along with a
 * personal org (so signup is immediately useful, and team invites — which
 * require an existing user — become completable).
 */

const nowSec = () => Math.floor(Date.now() / 1000);

function slugify(email: string, id: string): string {
  const local = email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "user";
  return `${local.slice(0, 24)}-${id.slice(0, 6)}`;
}

/** Idempotent domain provisioning for a better-auth user id. */
export async function provisionUser(
  db: Database,
  input: { id: string; email: string; name: string | null },
): Promise<{ userId: string; orgId: string }> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, input.id)).limit(1);
  if (existing[0]) {
    const mem = await db
      .select({ orgId: memberships.orgId })
      .from(memberships)
      .where(eq(memberships.userId, input.id))
      .limit(1);
    return { userId: input.id, orgId: mem[0]?.orgId ?? "" };
  }
  await db.insert(users).values({
    id: input.id,
    email: input.email,
    name: input.name,
    githubId: null,
    avatarUrl: null,
    createdAt: nowSec(),
    deletedAt: null,
  });
  const orgId = newId("org");
  await db.insert(organizations).values({
    id: orgId,
    name: `${input.name ?? input.email}'s org`,
    slug: slugify(input.email, input.id),
    plan: "free",
    githubInstallationId: null,
    createdAt: nowSec(),
    deletedAt: null,
  });
  await db.insert(memberships).values({
    id: newId("mem"),
    orgId,
    userId: input.id,
    role: "owner",
    createdAt: nowSec(),
  });
  return { userId: input.id, orgId };
}

function resolveSecret(env: AppEnv): string {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  // Dev-only fallback: stable within a process, invalid across restarts is
  // acceptable locally — but NEVER rely on this in production.
  if ((env.NODE_ENV ?? "development") === "production") {
    throw new Error("BETTER_AUTH_SECRET is required in production");
  }
  console.warn("[nicebear] BETTER_AUTH_SECRET unset — using insecure dev fallback");
  return "nicebear-dev-only-insecure-secret-change-me";
}

let cached: { key: string; auth: NiceBearAuth } | null = null;

/** Narrow structural view of the better-auth instance (stable across versions).
 * Method args are `any` deliberately: endpoint option shapes vary by version
 * and are validated at runtime + in tests, not by our static types. */
export interface NiceBearAuth {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (opts: { headers: Headers }) => Promise<{
      user: { id: string; email: string; name: string | null };
      session: { id: string };
    } | null>;
    signUpEmail: (...args: any[]) => Promise<any>;
    signInEmail: (...args: any[]) => Promise<any>;
    signOut: (...args: any[]) => Promise<any>;
  };
}

/** Auth instance per database (cached like the DB handle). */
export function getAuth(env: AppEnv): NiceBearAuth {
  const dbKey = env.TURSO_DATABASE_URL ?? "";
  if (cached && cached.key === dbKey) return cached.auth;
  const db = getDb(env);

  const githubId = env.GITHUB_CLIENT_ID;
  const githubSecret = env.GITHUB_CLIENT_SECRET;
  const baseURL = env.BETTER_AUTH_URL ?? "http://localhost:4321";

  const auth = betterAuth({
    baseURL,
    trustedOrigins: [baseURL],
    secret: resolveSecret(env),
    database: drizzleAdapter(db as never, {
      provider: "sqlite",
      schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    ...(githubId && githubSecret
      ? { socialProviders: { github: { clientId: githubId, clientSecret: githubSecret } } }
      : {}),
    databaseHooks: {
      user: {
        create: {
          async after(user) {
            await provisionUser(db, { id: user.id, email: user.email, name: user.name ?? null }).catch(
              (e) => console.error("[nicebear] provisionUser failed", e),
            );
          },
        },
      },
      account: {
        create: {
          async after(account) {
            if (account.providerId === "github") {
              await db
                .update(users)
                .set({ githubId: account.accountId })
                .where(eq(users.id, account.userId))
                .catch(() => undefined);
            }
          },
        },
      },
    },
  });
  cached = { key: dbKey, auth };
  return auth;
}

/** Session user for a request, or null (→ fall back to API-key auth). */
export async function getSessionUser(
  auth: NiceBearAuth,
  request: Request,
): Promise<{ id: string; email: string; name: string | null } | null> {
  try {
    const data = await auth.api.getSession({ headers: request.headers });
    if (!data?.user) return null;
    return { id: data.user.id, email: data.user.email, name: data.user.name ?? null };
  } catch {
    return null;
  }
}
