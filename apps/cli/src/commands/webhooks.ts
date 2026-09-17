import type { ParsedArgs } from "../args.js";
import { strFlag } from "../args.js";
import type { Ctx } from "./context.js";
import { needKey } from "./context.js";

/**
 * nicebear webhook create --url URL --secret S --events a,b [--org ID]
 * nicebear webhook list [--org ID]
 * nicebear webhook deliveries <id> [--limit N]
 * nicebear webhook process [--limit N]
 */
export async function webhooks(args: ParsedArgs, ctx: Ctx): Promise<unknown> {
  needKey(ctx);
  const org = strFlag(args.flags, "org", "orgId") ?? ctx.orgId;
  switch (args.sub) {
    case "create": {
      const url = strFlag(args.flags, "url", "u");
      const secret = strFlag(args.flags, "secret", "s");
      const events = strFlag(args.flags, "events", "e");
      if (!url || !secret || !events) {
        throw new Error("usage: nicebear webhook create --url <url> --secret <16+ chars> --events <a,b> [--org ID]");
      }
      return ctx.client.createWebhook(url, secret, events.split(",").map((s) => s.trim()).filter(Boolean), org);
    }
    case "list":
      return ctx.client.listWebhooks(org);
    case "deliveries": {
      const id = args.positionals[0];
      if (!id) throw new Error("usage: nicebear webhook deliveries <id> [--limit N]");
      return ctx.client.deliveries(id, Number(strFlag(args.flags, "limit", "l") ?? 25));
    }
    case "process":
      return ctx.client.processWebhooks(Number(strFlag(args.flags, "limit", "l") ?? 25));
    default:
      throw new Error("usage: nicebear webhook <create|list|deliveries|process> ...");
  }
}
