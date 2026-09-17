import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { ScheduleCreateSchema } from "@nicebear/shared-types";
import { audit } from "../../../lib/analytics/log";
import { authedRoute } from "../../../lib/api/authed";
import { purgeRuleTarget } from "../../../lib/api/pipeline";
import { requireTargetRole } from "../../../lib/api/targets";
import { rotationRules, schedules } from "../../../lib/db/schema";
import { newId } from "../../../lib/ids";

const nowSec = () => Math.floor(Date.now() / 1000);

/** POST /api/schedules — attach a cron schedule to a rotation rule. */
export const POST: APIRoute = authedRoute("admin", async (ctx, req) => {
  const { db, auth, env, waitUntil, account } = ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = ScheduleCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const ruleRows = await db
    .select()
    .from(rotationRules)
    .where(eq(rotationRules.id, parsed.data.rotation_rule_id))
    .limit(1);
  const rule = ruleRows[0];
  if (!rule) return Response.json({ error: "rotation rule not found" }, { status: 404 });
  const orgId = await requireTargetRole(db, auth, rule.targetType, rule.targetId, "developer");

  const id = newId("sch");
  await db.insert(schedules).values({
    id,
    rotationRuleId: rule.id,
    cronExpr: parsed.data.cron_expr ?? null,
    timezone: parsed.data.timezone,
    createdAt: nowSec(),
  });
  await purgeRuleTarget(env, db, rule.targetType, rule.targetId);
  account();
  waitUntil(
    audit(db, {
      orgId,
      actorId: auth.keyId,
      action: "schedule.create",
      target: id,
    }),
  );
  return Response.json({ id }, { status: 201 });
});

/** GET /api/schedules?rotation_rule_id= — list schedules for a rule. */
export const GET: APIRoute = authedRoute("read", async ({ db, auth, account }, _req, { url }) => {
  const ruleId = url.searchParams.get("rotation_rule_id") ?? "";
  if (!ruleId) return Response.json({ error: "?rotation_rule_id= is required" }, { status: 400 });
  const ruleRows = await db.select().from(rotationRules).where(eq(rotationRules.id, ruleId)).limit(1);
  const rule = ruleRows[0];
  if (!rule) return Response.json({ error: "rotation rule not found" }, { status: 404 });
  await requireTargetRole(db, auth, rule.targetType, rule.targetId, "viewer");
  const rows = await db
    .select({
      id: schedules.id,
      rotation_rule_id: schedules.rotationRuleId,
      cron_expr: schedules.cronExpr,
      timezone: schedules.timezone,
      created_at: schedules.createdAt,
    })
    .from(schedules)
    .where(eq(schedules.rotationRuleId, ruleId));
  account();
  return Response.json({ schedules: rows });
});
