import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { RollbackBodySchema } from "@nicebear/shared-types";
import { audit } from "../../../../lib/analytics/log";
import { authedRoute, requireOrgRole } from "../../../../lib/api/authed";
import { loadAvatar, loadHistory } from "../../../../lib/api/avatars";
import { purgeAvatar } from "../../../../lib/api/pipeline";
import { avatars } from "../../../../lib/db/schema";

/**
 * POST /api/avatars/:id/rollback — point the avatar row back at a prior
 * commit_sha (old content stays addressable; no git revert needed).
 */
export const POST: APIRoute = authedRoute("admin", async (ctx, req, { params }) => {
  const { db, auth, env, waitUntil, account } = ctx;
  const id = params.id ?? "";
  const row = await loadAvatar(db, id);
  if (!row) return Response.json({ error: "avatar not found" }, { status: 404 });
  await requireOrgRole(db, auth, row.orgId, "developer");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = RollbackBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const history = await loadHistory(db, id);
  const sorted = [...history].sort((a, b) => a.createdAt - b.createdAt);
  const target =
    parsed.data.version === "latest"
      ? (sorted[sorted.length - 1]?.sha ?? row.commitSha)
      : (sorted[Number(parsed.data.version) - 1]?.sha ?? null);
  if (!target) return Response.json({ error: "version not found in pointer history" }, { status: 404 });

  await db.update(avatars).set({ commitSha: target }).where(eq(avatars.id, id));
  await purgeAvatar(env, id);
  account();
  waitUntil(
    audit(db, { orgId: row.orgId, actorId: auth.keyId, action: "avatar.rollback", target: id, metadata: { sha: target } }),
  );
  return Response.json({ id, commit_sha: target });
});
