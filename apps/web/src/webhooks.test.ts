import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { webhookDeliveries, webhooks } from "./lib/db/schema";
import { createTestDb } from "./lib/test/db";
import {
  backoffDelaySec,
  handleQueueBatch,
  MAX_ATTEMPTS,
  processDelivery,
} from "./lib/webhooks/consumer";
import {
  hmacSha256Hex,
  signatureHeader,
  verifySignature,
} from "./lib/webhooks/deliver";

const okFetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;
const failFetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;

async function seedHook(db: Awaited<ReturnType<typeof createTestDb>>, over = {}) {
  const hook = {
    id: "wh_1",
    orgId: "org_1",
    url: "https://example.com/hook",
    secret: "testsecret",
    events: JSON.stringify(["avatar.changed"]),
    createdAt: 1000,
    deletedAt: null,
    ...over,
  };
  await db.insert(webhooks).values(hook);
  return hook;
}

async function seedDelivery(db: Awaited<ReturnType<typeof createTestDb>>, over = {}) {
  const d = {
    id: "whd_1",
    webhookId: "wh_1",
    event: "avatar.changed",
    status: "pending" as const,
    attempt: 1,
    responseCode: null,
    deliveredAt: null,
    createdAt: 1000,
    payload: JSON.stringify({ avatar_id: "av_1" }),
    ...over,
  };
  await db.insert(webhookDeliveries).values(d);
  return d;
}

function memQueue() {
  const sent: Array<{ msg: unknown; delay?: number }> = [];
  return {
    sent,
    send: async (msg: unknown, opts?: { delaySeconds?: number }) => {
      sent.push({ msg, delay: opts?.delaySeconds });
    },
  };
}

describe("HMAC signing", () => {
  it("matches the known HMAC-SHA256 vector", async () => {
    // Standard test vector: key "key", message the famous pangram.
    expect(await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog")).toBe(
      "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    );
  });

  it("verifies round-trip and rejects tampering", async () => {
    const body = JSON.stringify({ event: "avatar.changed" });
    const header = signatureHeader(await hmacSha256Hex("s3cret", body));
    expect(await verifySignature("s3cret", body, header)).toBe(true);
    expect(await verifySignature("s3cret", `${body} `, header)).toBe(false);
    expect(await verifySignature("wrong", body, header)).toBe(false);
    expect(await verifySignature("s3cret", body, null)).toBe(false);
    expect(await verifySignature("s3cret", body, "md5=abc")).toBe(false);
  });

  it("uses exponential backoff: 60s, 2m, 4m, 8m, capped", () => {
    expect([1, 2, 3, 4].map(backoffDelaySec)).toEqual([60, 120, 240, 480]);
    expect(backoffDelaySec(99)).toBe(1800);
    expect(MAX_ATTEMPTS).toBe(5);
  });
});

describe("consumer integration (in-memory LibSQL)", () => {
  it("delivers, signs, and marks success", async () => {
    const db = await createTestDb();
    const hook = await seedHook(db);
    await seedDelivery(db);
    let seen: { headers: Headers; body: string } | null = null;
    const capture = (async (_url: unknown, init?: RequestInit) => {
      seen = { headers: new Headers(init?.headers), body: String(init?.body) };
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    expect(await processDelivery(db, { WEBHOOK_QUEUE: memQueue() }, capture, "whd_1")).toBe("success");
    const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, "whd_1"));
    expect(rows[0]?.status).toBe("success");
    expect(rows[0]?.responseCode).toBe(200);
    expect(seen!.headers.get("X-NiceBear-Event")).toBe("avatar.changed");
    expect(seen!.headers.get("X-NiceBear-Delivery")).toBe("whd_1");
    // Signature verifies against the exact bytes sent, with the stored payload.
    expect(await verifySignature(hook.secret, seen!.body, seen!.headers.get("X-NiceBear-Signature"))).toBe(true);
    expect(JSON.parse(seen!.body).payload).toEqual({ avatar_id: "av_1" });
  });

  it("retries with backoff, then fails terminally on attempt 5", async () => {
    const db = await createTestDb();
    await seedHook(db);
    await seedDelivery(db);
    const queue = memQueue();
    const env = { WEBHOOK_QUEUE: queue };
    const outcomes = [];
    for (let i = 0; i < 5; i++) outcomes.push(await processDelivery(db, env, failFetch, "whd_1"));
    expect(outcomes).toEqual(["retry", "retry", "retry", "retry", "failed"]);
    expect(queue.sent.map((s) => s.delay)).toEqual([60, 120, 240, 480]);
    const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, "whd_1"));
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.attempt).toBe(5);
    expect(rows[0]?.responseCode).toBe(500);
  });

  it("fails fast when the webhook is deleted or unsubscribed", async () => {
    const db = await createTestDb();
    await seedHook(db, { deletedAt: 2000 });
    await seedDelivery(db);
    expect(await processDelivery(db, {}, okFetch, "whd_1")).toBe("failed");
    const rows = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, "whd_1"));
    expect(rows[0]?.status).toBe("failed");
  });

  it("skips non-pending and missing deliveries", async () => {
    const db = await createTestDb();
    await seedHook(db);
    await seedDelivery(db, { status: "success" });
    expect(await processDelivery(db, {}, okFetch, "whd_1")).toBe("skipped");
    expect(await processDelivery(db, {}, okFetch, "whd_nope")).toBe("skipped");
  });

  it("processes batches with per-message outcomes", async () => {
    const db = await createTestDb();
    await seedHook(db);
    await seedDelivery(db, { id: "whd_a" });
    await seedDelivery(db, { id: "whd_b" });
    const counts = await handleQueueBatch(
      db,
      {},
      [{ deliveryId: "whd_a" }, { deliveryId: "whd_b" }, { deliveryId: "whd_nope" }],
      okFetch,
    );
    expect(counts).toEqual({ success: 2, retry: 0, failed: 0, skipped: 1 });
  });
});
