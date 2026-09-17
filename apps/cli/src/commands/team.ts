import type { ParsedArgs } from "../args.js";
import { strFlag } from "../args.js";
import type { Ctx } from "./context.js";
import { needKey } from "./context.js";

/**
 * nicebear team list [--org ID]
 * nicebear team add --email E --role R [--org ID]
 * nicebear team role --user U --role R [--org ID]
 * nicebear team remove --user U [--org ID]
 * nicebear orgs
 */
export async function team(args: ParsedArgs, ctx: Ctx): Promise<unknown> {
  needKey(ctx);
  const org = strFlag(args.flags, "org", "orgId") ?? ctx.orgId;
  switch (args.sub) {
    case "list":
      return ctx.client.team(org);
    case "add": {
      const email = strFlag(args.flags, "email", "e");
      const role = strFlag(args.flags, "role", "r") ?? "viewer";
      if (!email || !org) throw new Error("usage: nicebear team add --email <email> --role <role> [--org ID]");
      return ctx.client.teamAdd(org, email, role);
    }
    case "role": {
      const user = strFlag(args.flags, "user", "u");
      const role = strFlag(args.flags, "role", "r");
      if (!user || !role || !org) throw new Error("usage: nicebear team role --user <id> --role <role> [--org ID]");
      return ctx.client.teamRole(org, user, role);
    }
    case "remove": {
      const user = strFlag(args.flags, "user", "u");
      if (!user || !org) throw new Error("usage: nicebear team remove --user <id> [--org ID]");
      return ctx.client.teamRemove(org, user);
    }
    default:
      throw new Error("usage: nicebear team <list|add|role|remove> ...");
  }
}

/** nicebear orgs — orgs the caller belongs to. */
export async function orgs(_args: ParsedArgs, ctx: Ctx): Promise<unknown> {
  needKey(ctx);
  return ctx.client.myOrgs();
}
