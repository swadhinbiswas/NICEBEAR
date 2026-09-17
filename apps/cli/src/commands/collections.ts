import type { ParsedArgs } from "../args.js";
import { strFlag } from "../args.js";
import type { Ctx } from "./context.js";
import { needKey } from "./context.js";

/**
 * nicebear collection create --name N --engine E [--org ID]
 * nicebear collection list [--org ID]
 * nicebear collection get <id>
 * nicebear collection attach <collection-id> <avatar-id>
 */
export async function collections(args: ParsedArgs, ctx: Ctx): Promise<unknown> {
  needKey(ctx);
  const org = strFlag(args.flags, "org", "orgId") ?? ctx.orgId;
  switch (args.sub) {
    case "create": {
      const name = strFlag(args.flags, "name", "n") ?? args.positionals[0];
      if (!name) throw new Error("usage: nicebear collection create --name <name> [--engine <engine>]");
      const engine = strFlag(args.flags, "engine", "e") ?? "pixel-art";
      return ctx.client.createCollection(name, engine, org);
    }
    case "list":
      return ctx.client.listCollections(org);
    case "get": {
      const id = args.positionals[0];
      if (!id) throw new Error("usage: nicebear collection get <id>");
      return ctx.client.getCollection(id);
    }
    case "attach": {
      const [colId, avId] = args.positionals;
      if (!colId || !avId) throw new Error("usage: nicebear collection attach <collection-id> <avatar-id>");
      return ctx.client.attachAvatar(colId, avId);
    }
    default:
      throw new Error("usage: nicebear collection <create|list|get|attach> ...");
  }
}
