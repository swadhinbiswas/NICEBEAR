import type { APIRoute } from "astro";
import { z } from "zod";
import { authedRoute } from "../../../lib/api/authed";
import { handleQueueBatch, pendingDeliveries } from "../../../lib/webhooks/consumer";

const Body = z.object({ limit: z.number().int().min(1).max(100).optional() });

/**
 * POST /api/webhooks/process — drain oldest pending deliveries (admin).
 * Self-host cron target (`* * * * * curl -X POST ...`) and the local
 * equivalent of the Cloudflare Queue consumer batch. On Cloudflare, the
 * queue consumer calls handleQueueBatch directly; this route covers OSS
 * deployments without Queues.
 */
export const POST: APIRoute = authedRoute("admin", async ({ db, env, account }, req) => {
  let limit = 25;
  try {
    const parsed = Body.safeParse(await req.json());
    if (parsed.success && parsed.data.limit) limit = parsed.data.limit;
  } catch {
    /* empty body → defaults */
  }
  const ids = await pendingDeliveries(db, limit);
  const counts = await handleQueueBatch(db, env, ids.map((deliveryId) => ({ deliveryId })));
  account();
  return Response.json({ processed: ids.length, ...counts });
});
