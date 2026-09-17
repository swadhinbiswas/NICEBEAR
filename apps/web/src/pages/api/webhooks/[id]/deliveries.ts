import type { APIRoute } from "astro";
import { desc, eq } from "drizzle-orm";
import { authedRoute, requireOrgRole } from "../../../../lib/api/authed";
import { webhookDeliveries, webhooks } from "../../../../lib/db/schema";

/** GET /api/webhooks/:id/deliveries — recent delivery log (read scope). */
export const GET: APIRoute = authedRoute("read", async ({ db, auth, account }, _req, { params, url }) => {
  const id = params.id ?? "";
  const rows = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
  const hook = rows[0];
  if (!hook || hook.deletedAt) return Response.json({ error: "webhook not found" }, { status: 404 });
  await requireOrgRole(db, auth, hook.orgId, "viewer");

  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25) || 25));
  const deliveries = await db
    .select({
      id: webhookDeliveries.id,
      event: webhookDeliveries.event,
      status: webhookDeliveries.status,
      attempt: webhookDeliveries.attempt,
      response_code: webhookDeliveries.responseCode,
      delivered_at: webhookDeliveries.deliveredAt,
      created_at: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, id))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
  account();
  return Response.json({ webhook_id: id, deliveries });
});
