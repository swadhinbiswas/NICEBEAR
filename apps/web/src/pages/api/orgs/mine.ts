import type { APIRoute } from "astro";
import { and, eq, isNull } from "drizzle-orm";
import { authedRoute } from "../../../lib/api/authed";
import { memberships, organizations } from "../../../lib/db/schema";

/** GET /api/orgs/mine — orgs the caller belongs to (dashboard org picker). */
export const GET: APIRoute = authedRoute("read", async ({ db, auth, account }) => {
  if (auth.ownerType === "organization") {
    const rows = await db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(and(eq(organizations.id, auth.ownerId), isNull(organizations.deletedAt)))
      .limit(1);
    account();
    return Response.json({ orgs: rows });
  }
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, auth.ownerId), isNull(organizations.deletedAt)));
  account();
  return Response.json({ orgs: rows });
});
