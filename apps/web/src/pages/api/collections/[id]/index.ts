import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { authedRoute, requireOrgRole } from "../../../../lib/api/authed";
import { loadCollection, loadCollectionMembers } from "../../../../lib/api/avatars";
import { avatars } from "../../../../lib/db/schema";

/** GET /api/collections/:id — metadata + member avatar ids. */
export const GET: APIRoute = authedRoute("read", async ({ db, auth, account }, _req, { params }) => {
  const id = params.id ?? "";
  const collection = await loadCollection(db, id);
  if (!collection) return Response.json({ error: "collection not found" }, { status: 404 });
  await requireOrgRole(db, auth, collection.orgId, "viewer");
  const members = await loadCollectionMembers(db, id);
  account();
  return Response.json({
    id: collection.id,
    org_id: collection.orgId,
    name: collection.name,
    engine_type: collection.engineType,
    avatars: members,
    created_at: collection.createdAt,
  });
});
