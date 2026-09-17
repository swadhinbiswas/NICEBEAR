import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "../../../../lib/analytics/log";
import { authedRoute, requireOrgRole } from "../../../../lib/api/authed";
import { loadAvatar, loadCollection } from "../../../../lib/api/avatars";
import { purgeAvatar } from "../../../../lib/api/pipeline";
import { avatars } from "../../../../lib/db/schema";

const Body = z.object({ avatar_id: z.string().min(1).max(128) });

/** POST /api/collections/:id/avatars — attach an avatar to a collection. */
export const POST: APIRoute = authedRoute("admin", async (ctx, req, { params }) => {
  const { db, auth, env, waitUntil, account } = ctx;
  const id = params.id ?? "";
  const collection = await loadCollection(db, id);
  if (!collection) return Response.json({ error: "collection not found" }, { status: 404 });
  await requireOrgRole(db, auth, collection.orgId, "developer");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const avatar = await loadAvatar(db, parsed.data.avatar_id);
  if (!avatar) return Response.json({ error: "avatar not found" }, { status: 404 });
  if (avatar.orgId !== collection.orgId) {
    return Response.json({ error: "avatar belongs to a different organization" }, { status: 400 });
  }
  await db.update(avatars).set({ collectionId: id }).where(eq(avatars.id, avatar.id));
  // Membership changed → both the avatar and the collection's rotation
  // outcomes may change. Purge the avatar's own decision key.
  await purgeAvatar(env, avatar.id);
  account();
  waitUntil(
    audit(db, { orgId: collection.orgId, actorId: auth.keyId, action: "collection.attach", target: avatar.id, metadata: { collection_id: id } }),
  );
  return Response.json({ collection_id: id, avatar_id: avatar.id });
});
