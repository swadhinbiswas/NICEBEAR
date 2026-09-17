import type { APIRoute } from "astro";
import { authedRoute } from "../../../lib/api/authed";
import { runRollups } from "../../../lib/analytics/rollup";

/**
 * POST /api/analytics/rollup — aggregate complete hour/day buckets (admin).
 * Cron target (every ~15 min). Idempotent: buckets are delete-then-inserted
 * and the cursor only advances, so overlapping runs are safe.
 */
export const POST: APIRoute = authedRoute("admin", async ({ db, account }) => {
  const result = await runRollups(db);
  account();
  return Response.json({ ok: true, ...result });
});
