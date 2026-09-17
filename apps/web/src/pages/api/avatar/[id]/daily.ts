import type { APIRoute } from "astro";
import { handleAvatarRequest } from "../../../../lib/api/pipeline";

/** GET /api/avatar/:id/daily */
export const GET: APIRoute = async ({ params, url, request, locals }) => {
  return handleAvatarRequest({
    request,
    url,
    avatarId: params.id ?? "",
    locals,
    preset: "daily",
  });
};
