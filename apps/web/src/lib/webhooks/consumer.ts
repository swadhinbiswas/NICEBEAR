import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { webhookDeliveries, webhooks } from "../db/schema";
import type { AppEnv } from "../runtime/env";
import { deliverOnce } from "./deliver";

export const MAX_ATTEMPTS = 5;

export interface DeliveryMessage {
  deliveryId: string;
}

/**
 * Exponential backoff after a failed attempt (attempt = just-failed try, 1-based):
 * 60s, 2m, 4m, 8m — then the 5th try is final. Capped at 30m.
 */
export function backoffDelaySec(failedAttempt: number): number {
  return Math.min(1800, 60 * 2 ** Math.max(0, failedAttempt - 1));
}

export type DeliveryOutcome = "success" | "retry" | "failed" | "skipped";

/**
 * Process one delivery: exactly the logic a Cloudflare Queue consumer batch
 * calls (§8). Terminal states are written to webhook_deliveries so
 * GET /:id/deliveries stays truthful; retries re-enter the queue with delay.
 */
export async function processDelivery(
  db: Database,
  env: AppEnv,
  fetchImpl: typeof fetch,
  deliveryId: string,
): Promise<DeliveryOutcome> {
  const dRows = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);
  const delivery = dRows[0];
  if (!delivery || delivery.status !== "pending") return "skipped";

  const wRows = await db.select().from(webhooks).where(eq(webhooks.id, delivery.webhookId)).limit(1);
  const hook = wRows[0];
  const subscribed = (() => {
    if (!hook || hook.deletedAt) return false;
    try {
      return (JSON.parse(hook.events) as string[]).includes(delivery.event);
    } catch {
      return false;
    }
  })();
  if (!subscribed) {
    await db
      .update(webhookDeliveries)
      .set({ status: "failed", deliveredAt: Math.floor(Date.now() / 1000) })
      .where(eq(webhookDeliveries.id, deliveryId));
    return "failed";
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = delivery.payload ? (JSON.parse(delivery.payload) as Record<string, unknown>) : {};
  } catch {
    payload = {};
  }
  const result = await deliverOnce(fetchImpl, {
    url: hook.url,
    secret: hook.secret,
    event: delivery.event,
    deliveryId,
    payload,
  });

  const now = Math.floor(Date.now() / 1000);
  if (result.ok) {
    await db
      .update(webhookDeliveries)
      .set({ status: "success", responseCode: result.status, deliveredAt: now })
      .where(eq(webhookDeliveries.id, deliveryId));
    return "success";
  }

  const attempt = delivery.attempt ?? 1;
  if (attempt >= MAX_ATTEMPTS) {
    await db
      .update(webhookDeliveries)
      .set({ status: "failed", responseCode: result.status || null, deliveredAt: now })
      .where(eq(webhookDeliveries.id, deliveryId));
    return "failed";
  }
  await db
    .update(webhookDeliveries)
    .set({ attempt: attempt + 1, responseCode: result.status || null })
    .where(eq(webhookDeliveries.id, deliveryId));
  await env.WEBHOOK_QUEUE?.send({ deliveryId }, { delaySeconds: backoffDelaySec(attempt) }).catch(
    () => undefined,
  );
  return "retry";
}

/** Queue batch entrypoint — sequential, batch-size capped by the consumer. */
export async function handleQueueBatch(
  db: Database,
  env: AppEnv,
  messages: DeliveryMessage[],
  fetchImpl: typeof fetch = fetch,
): Promise<Record<DeliveryOutcome, number>> {
  const counts: Record<DeliveryOutcome, number> = { success: 0, retry: 0, failed: 0, skipped: 0 };
  for (const m of messages) {
    try {
      counts[await processDelivery(db, env, fetchImpl, m.deliveryId)]++;
    } catch {
      counts.skipped++;
    }
  }
  return counts;
}

/** Oldest pending deliveries first — used by the self-host drain route. */
export async function pendingDeliveries(db: Database, limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, "pending")))
    .orderBy(asc(webhookDeliveries.createdAt))
    .limit(Math.min(100, Math.max(1, limit)));
  return rows.map((r) => r.id);
}
