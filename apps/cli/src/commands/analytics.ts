import type { ParsedArgs } from "../args.js";
import { strFlag } from "../args.js";
import type { Ctx } from "./context.js";
import { needKey } from "./context.js";

/**
 * nicebear analytics [--metric summary|requests|top-avatars|top-collections|geo|errors] [--days N]
 * nicebear analytics rollup
 */
export async function analytics(args: ParsedArgs, ctx: Ctx): Promise<unknown> {
  needKey(ctx);
  if (args.sub === "rollup") return ctx.client.rollup();
  const metric = args.sub && args.sub !== "summary" ? args.sub : (strFlag(args.flags, "metric", "m") ?? "summary");
  const days = Number(strFlag(args.flags, "days", "d") ?? 30);
  return ctx.client.analytics(metric, days);
}
