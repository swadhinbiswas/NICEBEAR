import type { APIRoute } from "astro";
import { getAuth } from "../../../lib/auth/server";
import { getEnv } from "../../../lib/runtime/env";

/** Better Auth mount: /api/auth/sign-up/email, /sign-in/email, /sign-out,
 * /get-session, /callback/github, ... (§1). */
export const ALL: APIRoute = async ({ request, locals }) => {
  try {
    return await getAuth(getEnv(locals)).handler(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "auth misconfigured";
    const status = /not configured|required/i.test(msg) ? 503 : 500;
    return Response.json({ error: msg, code: "auth_error" }, { status });
  }
};
