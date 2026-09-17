import type { ParsedArgs } from "../args.js";
import { strFlag } from "../args.js";
import type { Ctx } from "./context.js";
import { needKey } from "./context.js";

/**
 * nicebear api-key create [--scope read|admin] [--limit N]
 * nicebear api-key list
 * nicebear api-key rotate <id>
 * nicebear api-key revoke <id>
 */
export async function apiKeys(args: ParsedArgs, ctx: Ctx): Promise<unknown> {
  needKey(ctx);
  switch (args.sub) {
    case "create": {
      const scope = strFlag(args.flags, "scope", "s") ?? "read";
      const limit = Number(strFlag(args.flags, "limit", "l") ?? 60);
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
      const res = (await ctx.client.createKey(scope, limit)) as { id: string; key?: string };
      if (!ctx.json) {
        console.error("store this key now — it is shown once:");
      }
      return res;
    }
    case "list":
      return ctx.client.listKeys();
    case "rotate": {
      const id = args.positionals[0];
      if (!id) throw new Error("usage: nicebear api-key rotate <id>");
      return ctx.client.rotateKey(id);
    }
    case "revoke": {
      const id = args.positionals[0];
      if (!id) throw new Error("usage: nicebear api-key revoke <id>");
      return ctx.client.deleteKey(id);
    }
    default:
      throw new Error("usage: nicebear api-key <create|list|rotate|revoke> ...");
  }
}
