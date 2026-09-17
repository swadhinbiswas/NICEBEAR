import type { APIRoute } from "astro";
import { authedRoute } from "../../../lib/api/authed";

/** GET /api/api-keys/self — whoami for the calling key (dashboard bootstrap). */
export const GET: APIRoute = authedRoute("read", async ({ auth, account }) => {
  account();
  return Response.json({
    key_id: auth.keyId,
    owner_id: auth.ownerId,
    owner_type: auth.ownerType,
    scope: auth.scope,
    rate_limit_per_min: auth.rateLimitPerMin,
    monthly_quota: auth.monthlyQuota,
  });
});
