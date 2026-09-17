import type { APIRoute } from "astro";
import { CustomRotationBodySchema } from "@nicebear/shared-types";
import { handleAvatarRequest } from "../../../../lib/api/pipeline";
import { buildCustomRule } from "../../../../lib/rotation/wrappers";

/** POST /api/avatar/:id/custom — { every: "3 days" } | { cron: "0 0 * * *" } */
export const POST: APIRoute = async ({ params, url, request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = CustomRotationBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  let rule;
  try {
    // __self__ = this avatar's collection (substituted in the pipeline).
    rule = buildCustomRule("__self__", parsed.data);
  } catch {
    return Response.json({ error: "invalid custom schedule" }, { status: 400 });
  }
  return handleAvatarRequest({
    request,
    url,
    avatarId: params.id ?? "",
    locals,
    rule,
  });
};
