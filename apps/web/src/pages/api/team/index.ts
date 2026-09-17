import type { APIRoute } from "astro";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "../../../lib/analytics/log";
import { authedRoute, requireOrgRole } from "../../../lib/api/authed";
import { can, type Role } from "../../../lib/auth/rbac";
import type { Database } from "../../../lib/db/client";
import { memberships, users } from "../../../lib/db/schema";
import { newId } from "../../../lib/ids";
import type { AuthContext } from "../../../lib/auth/authenticate";

const nowSec = () => Math.floor(Date.now() / 1000);

/** Caller's role in the org (org-owned keys act as owner). */
async function callerRole(db: Database, auth: AuthContext, orgId: string): Promise<Role | undefined> {
  if (auth.ownerType === "organization" && auth.ownerId === orgId) return "owner";
  if (auth.ownerType !== "user") return undefined;
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, auth.ownerId)))
    .limit(1);
  return rows[0]?.role as Role | undefined;
}

async function ownerCount(db: Database, orgId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "owner")));
  return rows[0]?.n ?? 0;
}

/** GET /api/team?org_id= — members with emails (viewer+). */
export const GET: APIRoute = authedRoute("read", async ({ db, auth, account }, _req, { url }) => {
  const orgId = url.searchParams.get("org_id") ?? (auth.ownerType === "organization" ? auth.ownerId : null);
  if (!orgId) return Response.json({ error: "?org_id= is required for user keys" }, { status: 400 });
  await requireOrgRole(db, auth, orgId, "viewer");
  const rows = await db
    .select({
      user_id: memberships.userId,
      role: memberships.role,
      created_at: memberships.createdAt,
      email: users.email,
      name: users.name,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId));
  account();
  return Response.json({ org_id: orgId, members: rows });
});

const AddBody = z.object({
  org_id: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "developer", "viewer"]),
});

/** POST /api/team — add an existing user by email (admin+; owner role granted via PUT by owners). */
export const POST: APIRoute = authedRoute("admin", async (ctx, req) => {
  const { db, auth, waitUntil, account } = ctx;
  const parsed = AddBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const { org_id, email, role } = parsed.data;
  const me = await callerRole(db, auth, org_id);
  if (!can(me, "admin")) return Response.json({ error: "forbidden", code: "forbidden" }, { status: 403 });

  const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = found[0];
  if (!user) return Response.json({ error: "no user with that email (they must sign in first)" }, { status: 404 });
  const existing = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, org_id), eq(memberships.userId, user.id)))
    .limit(1);
  if (existing[0]) return Response.json({ error: "user is already a member" }, { status: 409 });

  await db.insert(memberships).values({
    id: newId("mem"),
    orgId: org_id,
    userId: user.id,
    role,
    createdAt: nowSec(),
  });
  account();
  waitUntil(audit(db, { orgId: org_id, actorId: auth.keyId, action: "team.add", target: user.id, metadata: { role } }));
  return Response.json({ org_id, user_id: user.id, role }, { status: 201 });
});

const RoleBody = z.object({
  org_id: z.string().min(1),
  user_id: z.string().min(1),
  role: z.enum(["owner", "admin", "developer", "viewer"]),
});

/** PUT /api/team — change a member's role (owner-governed). */
export const PUT: APIRoute = authedRoute("admin", async (ctx, req) => {
  const { db, auth, waitUntil, account } = ctx;
  const parsed = RoleBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const { org_id, user_id, role } = parsed.data;
  const me = await callerRole(db, auth, org_id);
  if (!can(me, "admin")) return Response.json({ error: "forbidden", code: "forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, org_id), eq(memberships.userId, user_id)))
    .limit(1);
  const member = rows[0];
  if (!member) return Response.json({ error: "not a member" }, { status: 404 });

  const memberRole = member.role as Role;
  if ((memberRole === "owner" || role === "owner") && me !== "owner") {
    return Response.json({ error: "only owners can grant or revoke the owner role" }, { status: 403 });
  }
  if (memberRole === "owner" && role !== "owner" && (await ownerCount(db, org_id)) <= 1) {
    return Response.json({ error: "cannot demote the last owner" }, { status: 400 });
  }
  await db.update(memberships).set({ role }).where(eq(memberships.id, member.id));
  account();
  waitUntil(audit(db, { orgId: org_id, actorId: auth.keyId, action: "team.role", target: user_id, metadata: { role } }));
  return Response.json({ org_id, user_id, role });
});

/** DELETE /api/team?org_id=&user_id= — remove a member (last-owner protected). */
export const DELETE: APIRoute = authedRoute("admin", async (ctx, _req, { url }) => {
  const { db, auth, waitUntil, account } = ctx;
  const org_id = url.searchParams.get("org_id") ?? "";
  const user_id = url.searchParams.get("user_id") ?? "";
  if (!org_id || !user_id) return Response.json({ error: "?org_id= and ?user_id= are required" }, { status: 400 });
  const me = await callerRole(db, auth, org_id);
  if (!can(me, "admin")) return Response.json({ error: "forbidden", code: "forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, org_id), eq(memberships.userId, user_id)))
    .limit(1);
  const member = rows[0];
  if (!member) return Response.json({ error: "not a member" }, { status: 404 });
  if ((member.role as Role) === "owner") {
    if (me !== "owner") return Response.json({ error: "only owners can remove an owner" }, { status: 403 });
    if ((await ownerCount(db, org_id)) <= 1) {
      return Response.json({ error: "cannot remove the last owner" }, { status: 400 });
    }
  }
  await db.delete(memberships).where(eq(memberships.id, member.id));
  account();
  waitUntil(audit(db, { orgId: org_id, actorId: auth.keyId, action: "team.remove", target: user_id }));
  return Response.json({ org_id, user_id, removed: true });
});
