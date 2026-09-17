import type { APIRoute } from "astro";
import { and, count, eq, isNull } from "drizzle-orm";
import { CollectionCreateSchema } from "@nicebear/shared-types";
import { audit, enqueueWebhooks } from "../../../lib/analytics/log";
import { authedRoute, requireOrgRole } from "../../../lib/api/authed";
import { avatars, collections } from "../../../lib/db/schema";
import { newId } from "../../../lib/ids";

const nowSec = () => Math.floor(Date.now() / 1000);

/** Resolve the target org: org-owned keys use their own org, else ?org_id=. */
function targetOrg(auth: { ownerType: string; ownerId: string }, url: URL): string | null {
  if (auth.ownerType === "organization") return auth.ownerId;
  return url.searchParams.get("org_id");
}

/** POST /api/collections */
export const POST: APIRoute = authedRoute("admin", async (ctx, req, { url }) => {
  const { db, auth, env, waitUntil, account } = ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = CollectionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const orgId = targetOrg(auth, url);
  if (!orgId) return Response.json({ error: "?org_id= is required for user keys" }, { status: 400 });
  await requireOrgRole(db, auth, orgId, "developer");

  const id = newId("col");
  await db.insert(collections).values({
    id,
    orgId,
    name: parsed.data.name,
    engineType: parsed.data.engine_type,
    createdAt: nowSec(),
    deletedAt: null,
  });
  account();
  waitUntil(audit(db, { orgId, actorId: auth.keyId, action: "collection.create", target: id }));
  waitUntil(
    enqueueWebhooks(db, env, { event: "collection.created", orgId, payload: { collection_id: id } }),
  );
  return Response.json({ id, org_id: orgId }, { status: 201 });
});

/** GET /api/collections — list collections with member counts. */
export const GET: APIRoute = authedRoute("read", async ({ db, auth, account }, _req, { url }) => {
  const orgId = targetOrg(auth, url);
  if (!orgId) return Response.json({ error: "?org_id= is required for user keys" }, { status: 400 });
  await requireOrgRole(db, auth, orgId, "viewer");
  const rows = await db
    .select({
      id: collections.id,
      name: collections.name,
      engine_type: collections.engineType,
      created_at: collections.createdAt,
    })
    .from(collections)
    .where(and(eq(collections.orgId, orgId), isNull(collections.deletedAt)));
  const withCounts = await Promise.all(
    rows.map(async (c) => {
      const n = await db
        .select({ n: count() })
        .from(avatars)
        .where(and(eq(avatars.collectionId, c.id), isNull(avatars.deletedAt)));
      return { ...c, org_id: orgId, avatar_count: n[0]?.n ?? 0 };
    }),
  );
  account();
  return Response.json({ collections: withCounts });
});
