import type { APIRoute } from "astro";
import { and, desc, eq, isNull } from "drizzle-orm";
import { WebhookCreateSchema } from "@nicebear/shared-types";
import { audit } from "../../../lib/analytics/log";
import { authedRoute, requireOrgRole } from "../../../lib/api/authed";
import { webhooks } from "../../../lib/db/schema";
import { newId } from "../../../lib/ids";
import { assertSafeExternalUrl } from "../../../lib/security/ssrf";

const nowSec = () => Math.floor(Date.now() / 1000);

/** POST /api/webhooks — SSRF-guarded URL, org from org-key or ?org_id=. */
export const POST: APIRoute = authedRoute("admin", async (ctx, req, { url }) => {
  const { db, auth, waitUntil, account } = ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = WebhookCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    assertSafeExternalUrl(parsed.data.url);
  } catch (e) {
    return Response.json({ error: `webhook url rejected: ${(e as Error).message}` }, { status: 400 });
  }
  const orgId =
    auth.ownerType === "organization" ? auth.ownerId : url.searchParams.get("org_id");
  if (!orgId) return Response.json({ error: "?org_id= is required for user keys" }, { status: 400 });
  await requireOrgRole(db, auth, orgId, "admin");

  const id = newId("wh");
  await db.insert(webhooks).values({
    id,
    orgId,
    url: parsed.data.url,
    secret: parsed.data.secret,
    events: JSON.stringify(parsed.data.events),
    createdAt: nowSec(),
    deletedAt: null,
  });
  account();
  waitUntil(audit(db, { orgId, actorId: auth.keyId, action: "webhook.create", target: id }));
  return Response.json({ id }, { status: 201 });
});

/** GET /api/webhooks — list webhooks for an org (secrets never returned). */
export const GET: APIRoute = authedRoute("read", async ({ db, auth, account }, _req, { url }) => {
  const orgId =
    auth.ownerType === "organization" ? auth.ownerId : url.searchParams.get("org_id");
  if (!orgId) return Response.json({ error: "?org_id= is required for user keys" }, { status: 400 });
  await requireOrgRole(db, auth, orgId, "viewer");
  const rows = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      events: webhooks.events,
      created_at: webhooks.createdAt,
    })
    .from(webhooks)
    .where(and(eq(webhooks.orgId, orgId), isNull(webhooks.deletedAt)))
    .orderBy(desc(webhooks.createdAt));
  account();
  return Response.json({
    webhooks: rows.map((w) => ({ ...w, events: JSON.parse(w.events) })),
  });
});
