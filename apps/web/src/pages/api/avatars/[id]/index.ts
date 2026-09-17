import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { audit, enqueueWebhooks } from "../../../../lib/analytics/log";
import { authedRoute, requireOrgRole } from "../../../../lib/api/authed";
import { loadAvatar } from "../../../../lib/api/avatars";
import { purgeAvatar } from "../../../../lib/api/pipeline";
import { avatars } from "../../../../lib/db/schema";

const nowSec = () => Math.floor(Date.now() / 1000);

/** GET /api/avatars/:id — metadata (read scope is enough). */
export const GET: APIRoute = authedRoute("read", async ({ db, account }, _req, { params }) => {
  const id = params.id ?? "";
  const row = await loadAvatar(db, id);
  if (!row) return Response.json({ error: "avatar not found" }, { status: 404 });
  account();
  return Response.json({
    id: row.id,
    collection_id: row.collectionId,
    org_id: row.orgId,
    source_type: row.sourceType,
    github_repo: row.githubRepo,
    github_path: row.githubPath,
    commit_sha: row.commitSha,
    external_url: row.externalUrl,
    seed: row.seed,
    created_at: row.createdAt,
  });
});

/** DELETE /api/avatars/:id — soft delete + decision-cache purge. */
export const DELETE: APIRoute = authedRoute("admin", async (ctx, _req, { params }) => {
  const { db, auth, env, waitUntil, account } = ctx;
  const id = params.id ?? "";
  const row = await loadAvatar(db, id);
  if (!row) return Response.json({ error: "avatar not found" }, { status: 404 });
  await requireOrgRole(db, auth, row.orgId, "developer");
  await db.update(avatars).set({ deletedAt: nowSec() }).where(eq(avatars.id, id));
  await purgeAvatar(env, id);
  account();
  waitUntil(audit(db, { orgId: row.orgId, actorId: auth.keyId, action: "avatar.delete", target: id }));
  waitUntil(
    enqueueWebhooks(db, env, { event: "avatar.changed", orgId: row.orgId, payload: { avatar_id: id, deleted: true } }),
  );
  return Response.json({ id, deleted: true });
});
