import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { audit } from "../../../../lib/analytics/log";
import { authedRoute } from "../../../../lib/api/authed";
import { mintApiKey } from "../../../../lib/auth/keys";
import { apiKeys } from "../../../../lib/db/schema";

/** POST /api/api-keys/:id/rotate — swap hash, old plaintext dies immediately. */
export const POST: APIRoute = authedRoute("admin", async (ctx, _req, { params }) => {
  const { db, auth, waitUntil, account } = ctx;
  const id = params.id ?? "";
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) return Response.json({ error: "API key not found" }, { status: 404 });
  if (row.ownerId !== auth.ownerId) return Response.json({ error: "API key not found" }, { status: 404 });

  const { plaintext, hash } = await mintApiKey();
  await db.update(apiKeys).set({ keyHash: hash }).where(eq(apiKeys.id, id));
  account();
  waitUntil(
    audit(db, {
      orgId: auth.ownerType === "organization" ? auth.ownerId : "",
      actorId: auth.keyId,
      action: "api_key.rotate",
      target: id,
    }),
  );
  return Response.json({ id, key: plaintext });
});
