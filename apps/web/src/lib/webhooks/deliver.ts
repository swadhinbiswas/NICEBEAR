/**
 * Webhook HTTP delivery (§8): canonical JSON body, HMAC-SHA256 signature,
 * 10s timeout. Pure except for the injected fetch — unit-testable.
 */

export interface WebhookPayload {
  event: string;
  deliveryId: string;
  payload: Record<string, unknown>;
  sentAt: number;
}

export function buildBody(e: WebhookPayload): string {
  return JSON.stringify({ event: e.event, delivery_id: e.deliveryId, payload: e.payload, sent_at: e.sentAt });
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function signatureHeader(hex: string): string {
  return `sha256=${hex}`;
}

/** Receiver-side verification (documented for SDK consumers). */
export async function verifySignature(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = await hmacSha256Hex(secret, body);
  const got = header.slice("sha256=".length);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export interface DeliveryResult {
  ok: boolean;
  status: number;
}

export async function deliverOnce(
  fetchImpl: typeof fetch,
  opts: { url: string; secret: string; event: string; deliveryId: string; payload: Record<string, unknown>; timeoutMs?: number },
): Promise<DeliveryResult> {
  const body = buildBody({ event: opts.event, deliveryId: opts.deliveryId, payload: opts.payload, sentAt: Math.floor(Date.now() / 1000) });
  const sig = await hmacSha256Hex(opts.secret, body);
  let res: Response;
  try {
    res = await fetchImpl(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NiceBear-Signature": signatureHeader(sig),
        "X-NiceBear-Event": opts.event,
        "X-NiceBear-Delivery": opts.deliveryId,
      },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
  } catch {
    return { ok: false, status: 0 };
  }
  return { ok: res.status >= 200 && res.status < 300, status: res.status };
}
