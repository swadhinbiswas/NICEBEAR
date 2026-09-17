import type { APIRoute } from "astro";
import { handleAvatarRequest } from "../../../../lib/api/pipeline";

/** GET /api/avatar/:id/refresh — no-cache, new resolution every call. */
export const GET: APIRoute = async ({ params, url, request, locals }) => {
  const res = await handleAvatarRequest({
    request,
    url,
    avatarId: params.id ?? "",
    locals,
    noCache: true,
  });
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, headers });
};
