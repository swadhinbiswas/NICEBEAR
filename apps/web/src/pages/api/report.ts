import type { APIRoute } from "astro";
import { ContentReportSchema } from "@nicebear/shared-types";
import { enqueueWebhooks, openContentReport } from "../../lib/analytics/log";
import { loadAvatar } from "../../lib/api/avatars";
import { getDb, getEnv, getWaitUntil } from "../../lib/runtime/env";

/**
 * POST /api/report — rights/abuse intake. Public (reporters have no keys);
 * light per-IP rate limiting inherited from the edge — a dedicated abuse
 * limiter lands with the moderation slice.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = ContentReportSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid report", issues: parsed.error.issues }, { status: 400 });
  }
  const env = getEnv(locals);
  let db;
  try {
    db = getDb(env);
  } catch {
    return Response.json({ error: "database not configured", code: "unconfigured" }, { status: 503 });
  }
  const avatar = await loadAvatar(db, parsed.data.avatar_id);
  if (!avatar) return Response.json({ error: "avatar not found" }, { status: 404 });

  const reportId = await openContentReport(db, {
    avatarId: avatar.id,
    reporterContact: parsed.data.reporter_contact,
    reason: parsed.data.reason,
  });
  getWaitUntil(locals)(
    enqueueWebhooks(db, env, {
      event: "content_report.opened",
      orgId: avatar.orgId,
      payload: { report_id: reportId, avatar_id: avatar.id },
    }),
  );
  return Response.json({ ok: true, status: "open", report_id: reportId }, { status: 202 });
};
