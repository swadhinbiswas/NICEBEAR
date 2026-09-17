import type { ParsedArgs } from "../args.js";
import { strFlag } from "../args.js";
import type { Ctx } from "./context.js";
import { needKey } from "./context.js";

/**
 * nicebear rule create --target <type:id> --when <pattern> --avatar <id> [--tz TZ] [--priority N]
 * nicebear rule create --target <type:id> --when <pattern> --from-collection <id> [--seed-by request|day|week]
 * nicebear rule list --target <type:id>
 * nicebear rule update <id> [--priority N]
 * nicebear schedule create --rule <rule-id> [--cron EXPR] [--tz TZ]
 * nicebear schedule list --rule <rule-id>
 *
 * Target format: `avatar:<id>`, `collection:<id>`, or `organization:<id>`.
 */
export async function rules(args: ParsedArgs, ctx: Ctx): Promise<unknown> {
  needKey(ctx);
  switch (args.sub) {
    case "create": {
      const target = strFlag(args.flags, "target", "t");
      const when = strFlag(args.flags, "when", "w");
      if (!target || !when) throw new Error("usage: nicebear rule create --target <type:id> --when <pattern> (--avatar <id> | --from-collection <id>)");
      const [targetType, ...rest] = target.split(":");
      const targetId = rest.join(":");
      if (!targetType || !targetId) throw new Error("--target must look like avatar:<id>, collection:<id>, or organization:<id>");
      const avatar = strFlag(args.flags, "avatar", "a");
      const fromCollection = strFlag(args.flags, "from-collection", "fromCollection", "f");
      if (!avatar && !fromCollection) throw new Error("one of --avatar or --from-collection is required");
      const item: Record<string, unknown> = { when };
      if (avatar) item.avatar = avatar;
      else item.avatar_from = `collection:${fromCollection}`;
      const tz = strFlag(args.flags, "tz");
      if (tz) item.tz = tz;
      const seedBy = strFlag(args.flags, "seed-by", "seedBy");
      if (seedBy) item.seed_by = seedBy;
      const priority = Number(strFlag(args.flags, "priority", "p") ?? 0);
      return ctx.client.createRule(targetId, targetType, {
        type: "composite",
        priority: "first_match",
        rules: [item],
      }, priority);
    }
    case "list": {
      const target = strFlag(args.flags, "target", "t");
      if (!target) throw new Error("usage: nicebear rule list --target <type:id>");
      const [targetType, ...rest] = target.split(":");
      return ctx.client.listRules(rest.join(":"), targetType ?? "");
    }
    case "update": {
      const id = args.positionals[0];
      if (!id) throw new Error("usage: nicebear rule update <id> [--priority N]");
      const priority = strFlag(args.flags, "priority", "p");
      if (priority === undefined) throw new Error("nothing to update — pass --priority N");
      return ctx.client.updateRule(id, { priority: Number(priority) });
    }
    default:
      throw new Error("usage: nicebear rule <create|list|update> ...");
  }
}

/** nicebear schedule ... (see module docstring). */
export async function schedules(args: ParsedArgs, ctx: Ctx): Promise<unknown> {
  needKey(ctx);
  switch (args.sub) {
    case "create": {
      const ruleId = strFlag(args.flags, "rule", "r");
      if (!ruleId) throw new Error("usage: nicebear schedule create --rule <rule-id> [--cron EXPR] [--tz TZ]");
      return ctx.client.createSchedule(ruleId, strFlag(args.flags, "cron", "c"), strFlag(args.flags, "tz", "timezone") ?? "UTC");
    }
    case "list": {
      const ruleId = strFlag(args.flags, "rule", "r");
      if (!ruleId) throw new Error("usage: nicebear schedule list --rule <rule-id>");
      return ctx.client.listSchedules(ruleId);
    }
    default:
      throw new Error("usage: nicebear schedule <create|list> ...");
  }
}
