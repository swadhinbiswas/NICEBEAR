import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { audit, enqueueWebhooks } from "../../../../lib/analytics/log";
import { authedRoute } from "../../../../lib/api/authed";
import type { Database } from "../../../../lib/db/client";
import { apiKeys } from "../../../../lib/db/schema";

const nowSec = () => Math.floor(Date.now() / 1000);

async function loadOwnedKey(db: Database, ownerId: string, id: string) {
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) return null;
  if (row.ownerId !== ownerId) return null;
  return row;
}

/** DELETE /api/api-keys/:id — revoke (hash stays for audit, key stops working). */
export const DELETE: APIRoute = authedRoute("admin", async (ctx, _req, { params }) => {
  const { db, auth, env, waitUntil, account } = ctx;
  const id = params.id ?? "";
  const row = await loadOwnedKey(db, auth.ownerId, id);
  if (!row) return Response.json({ error: "API key not found" }, { status: 404 });
  await db.update(apiKeys).set({ revokedAt: nowSec() }).where(eq(apiKeys.id, id));
  account();
  const orgId = auth.ownerType === "organization" ? auth.ownerId : "";
  waitUntil(audit(db, { orgId, actorId: auth.keyId, action: "api_key.delete", target: id }));
  if (orgId) {
    waitUntil(
      enqueueWebhooks(db, env, { event: "api_key.deleted", orgId, payload: { api_key_id: id } }),
    );
  }
  return Response.json({ id, revoked: true });
});
