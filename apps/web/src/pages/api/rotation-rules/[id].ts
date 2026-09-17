import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { RotationDslSchema } from "@nicebear/shared-types";
import { z } from "zod";
import { audit } from "../../../lib/analytics/log";
import { authedRoute } from "../../../lib/api/authed";
import { purgeRuleTarget } from "../../../lib/api/pipeline";
import { requireTargetRole } from "../../../lib/api/targets";
import { rotationRules } from "../../../lib/db/schema";

const Body = z.object({
  rule: RotationDslSchema.optional(),
  priority: z.number().int().optional(),
});

/** PUT /api/rotation-rules/:id — update DSL/priority + purge affected decisions. */
export const PUT: APIRoute = authedRoute("admin", async (ctx, req, { params }) => {
  const { db, auth, env, waitUntil, account } = ctx;
  const id = params.id ?? "";
  const rows = await db.select().from(rotationRules).where(eq(rotationRules.id, id)).limit(1);
  const existing = rows[0];
  if (!existing) return Response.json({ error: "rotation rule not found" }, { status: 404 });
  const orgId = await requireTargetRole(db, auth, existing.targetType, existing.targetId, "developer");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  await db
    .update(rotationRules)
    .set({
      ruleJson: parsed.data.rule ? JSON.stringify(parsed.data.rule) : existing.ruleJson,
      priority: parsed.data.priority ?? existing.priority,
    })
    .where(eq(rotationRules.id, id));
  await purgeRuleTarget(env, db, existing.targetType, existing.targetId);
  account();
  waitUntil(
    audit(db, {
      orgId,
      actorId: auth.keyId,
      action: "rotation_rule.update",
      target: id,
    }),
  );
  return Response.json({ id });
});
