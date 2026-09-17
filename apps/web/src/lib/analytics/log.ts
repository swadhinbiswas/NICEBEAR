import type { Database } from "../db/client";
import { auditLogs, contentReports, usageLogs, webhookDeliveries, webhooks } from "../db/schema";
import { newId } from "../ids";
import type { AppEnv } from "../runtime/env";

const nowSec = () => Math.floor(Date.now() / 1000);

export interface UsageEntry {
  apiKeyId: string | null;
  avatarId: string | null;
  region: string | null;
  cacheHit: boolean;
  responseMs: number;
  statusCode: number;
}

/** Fire-and-forget usage insert — dashboard reads rollups, never raw rows (§10). */
export async function logUsage(db: Database, e: UsageEntry): Promise<void> {
  try {
    await db.insert(usageLogs).values({
      id: newId("use"),
      apiKeyId: e.apiKeyId,
      avatarId: e.avatarId,
      region: e.region,
      cacheHit: e.cacheHit ? 1 : 0,
      responseMs: e.responseMs,
      statusCode: e.statusCode,
      createdAt: nowSec(),
    });
  } catch {
    /* analytics must never fail a serve */
  }
}

export async function audit(
  db: Database,
  entry: { orgId: string; actorId: string; action: string; target?: string; metadata?: unknown },
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: newId("aud"),
      orgId: entry.orgId,
      actorId: entry.actorId,
      action: entry.action,
      target: entry.target ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      createdAt: nowSec(),
    });
  } catch {
    /* best-effort */
  }
}

export interface WebhookEvent {
  event: string;
  orgId: string;
  payload: Record<string, unknown>;
}

/**
 * Enqueue webhook delivery via Cloudflare Queue; also writes a `pending`
 * delivery row per subscribed webhook so GET /:id/deliveries is truthful even
 * before the consumer runs. No subscribed webhooks → no-op.
 */
export async function enqueueWebhooks(db: Database, env: AppEnv, e: WebhookEvent): Promise<void> {
  try {
    const { eq, and, isNull } = await import("drizzle-orm");
    const subs = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.orgId, e.orgId), isNull(webhooks.deletedAt)));
    const targets = subs.filter((w) => {
      try {
        return (JSON.parse(w.events) as string[]).includes(e.event);
      } catch {
        return false;
      }
    });
    if (targets.length === 0) return;
    for (const w of targets) {
      const deliveryId = newId("whd");
      await db
        .insert(webhookDeliveries)
        .values({
          id: deliveryId,
          webhookId: w.id,
          event: e.event,
          status: "pending",
          attempt: 1,
          responseCode: null,
          deliveredAt: null,
          createdAt: nowSec(),
          payload: JSON.stringify(e.payload),
        })
        .catch(() => undefined);
      await env.WEBHOOK_QUEUE?.send({
        deliveryId,
        event: e.event,
        url: w.url,
        secret: w.secret,
        payload: e.payload,
      }).catch(() => undefined);
    }
  } catch {
    /* best-effort */
  }
}

export async function openContentReport(
  db: Database,
  input: { avatarId: string; reporterContact?: string; reason: string },
): Promise<string> {
  const id = newId("rep");
  await db.insert(contentReports).values({
    id,
    avatarId: input.avatarId,
    reporterContact: input.reporterContact ?? null,
    reason: input.reason,
    status: "open",
    createdAt: nowSec(),
  });
  return id;
}
