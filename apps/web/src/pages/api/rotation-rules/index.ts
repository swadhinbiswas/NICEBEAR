import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { RotationRuleCreateSchema } from "@nicebear/shared-types";
import { audit } from "../../../lib/analytics/log";
import { authedRoute } from "../../../lib/api/authed";
import { purgeRuleTarget } from "../../../lib/api/pipeline";
import { requireTargetRole } from "../../../lib/api/targets";
import { rotationRules } from "../../../lib/db/schema";
import { newId } from "../../../lib/ids";

const nowSec = () => Math.floor(Date.now() / 1000);

/** POST /api/rotation-rules — upsert a DSL rule + purge affected decisions. */
export const POST: APIRoute = authedRoute("admin", async (ctx, req) => {
  const { db, auth, env, waitUntil, account } = ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = RotationRuleCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const { target_id, target_type, rule, priority } = parsed.data;
  const orgId = await requireTargetRole(db, auth, target_type, target_id, "developer");
  const id = newId("rl");
  await db.insert(rotationRules).values({
    id,
    targetId: target_id,
    targetType: target_type,
    ruleJson: JSON.stringify(rule),
    priority,
    createdAt: nowSec(),
  });
  // A schedule change purges the decision key immediately (§4.4).
  await purgeRuleTarget(env, db, target_type, target_id);
  account();
  waitUntil(
    audit(db, {
      orgId,
      actorId: auth.keyId,
      action: "rotation_rule.create",
      target: id,
      metadata: { target_type, target_id },
    }),
  );
  return Response.json({ id }, { status: 201 });
});

/** GET /api/rotation-rules?target_type=&target_id= — list rules for a target. */
export const GET: APIRoute = authedRoute("read", async ({ db, auth, account }, _req, { url }) => {
  const targetType = url.searchParams.get("target_type") ?? "";
  const targetId = url.searchParams.get("target_id") ?? "";
  if (!targetType || !targetId) {
    return Response.json({ error: "?target_type= and ?target_id= are required" }, { status: 400 });
  }
  await requireTargetRole(db, auth, targetType, targetId, "viewer");
  const rows = await db
    .select({
      id: rotationRules.id,
      target_id: rotationRules.targetId,
      target_type: rotationRules.targetType,
      rule: rotationRules.ruleJson,
      priority: rotationRules.priority,
      created_at: rotationRules.createdAt,
    })
    .from(rotationRules)
    .where(and(eq(rotationRules.targetType, targetType as never), eq(rotationRules.targetId, targetId)));
  account();
  return Response.json({
    rules: rows.map((r) => ({ ...r, rule: JSON.parse(r.rule) })),
  });
});
