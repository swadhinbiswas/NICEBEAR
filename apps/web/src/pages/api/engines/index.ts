import type { APIRoute } from "astro";
import { listAnimated, listEngines } from "../../../lib/engines/registry";

/** GET /api/engines — discoverable style catalog (id + kind). Public. */
export const GET: APIRoute = async () => {
  return Response.json({
    engines: [
      ...listEngines().map((id) => ({ id, kind: "svg" as const, formats: ["svg", "png"] })),
      ...listAnimated().map((id) => ({ id, kind: "gif" as const, formats: ["gif"] })),
    ],
  });
};
