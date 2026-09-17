import type { APIRoute } from "astro";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ApiKeyCreateSchema } from "@nicebear/shared-types";
import { audit, enqueueWebhooks } from "../../../lib/analytics/log";
import { authedRoute } from "../../../lib/api/authed";
import { mintApiKey } from "../../../lib/auth/keys";
import { apiKeys } from "../../../lib/db/schema";
import { newId } from "../../../lib/ids";

const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * POST /api/api-keys — mint a sub-key inheriting the caller's owner.
 * The plaintext is returned ONCE; only the sha256 hash is stored.
 */
export const POST: APIRoute = authedRoute("admin", async (ctx, req) => {
  const { db, auth, env, waitUntil, account } = ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = ApiKeyCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const { plaintext, hash } = await mintApiKey();
  const id = newId("key");
  await db.insert(apiKeys).values({
    id,
    ownerId: auth.ownerId,
    ownerType: auth.ownerType,
    keyHash: hash,
    scope: parsed.data.scope,
    rateLimitPerMin: parsed.data.rate_limit_per_min,
    monthlyQuota: parsed.data.monthly_quota ?? null,
    expiresAt: parsed.data.expires_at ?? null,
    lastUsedAt: null,
    createdAt: nowSec(),
    revokedAt: null,
  });
  account();
  const orgId = auth.ownerType === "organization" ? auth.ownerId : "";
  waitUntil(audit(db, { orgId, actorId: auth.keyId, action: "api_key.create", target: id }));
  if (orgId) {
    waitUntil(
      enqueueWebhooks(db, env, { event: "api_key.created", orgId, payload: { api_key_id: id } }),
    );
  }
  return Response.json({ id, key: plaintext, scope: parsed.data.scope }, { status: 201 });
});

/** GET /api/api-keys — list own keys (metadata only; hashes never leave the DB). */
export const GET: APIRoute = authedRoute("read", async ({ db, auth, account }) => {
  const rows = await db
    .select({
      id: apiKeys.id,
      scope: apiKeys.scope,
      rate_limit_per_min: apiKeys.rateLimitPerMin,
      monthly_quota: apiKeys.monthlyQuota,
      expires_at: apiKeys.expiresAt,
      last_used_at: apiKeys.lastUsedAt,
      created_at: apiKeys.createdAt,
      revoked_at: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.ownerId, auth.ownerId), eq(apiKeys.ownerType, auth.ownerType as never), isNull(apiKeys.revokedAt)),
    )
    .orderBy(desc(apiKeys.createdAt));
  account();
  return Response.json({ api_keys: rows });
});
