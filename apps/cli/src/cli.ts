#!/usr/bin/env node
/** NiceBear CLI — full client for the Dynamic Avatar Infrastructure API. */

import { NiceBearError } from "@nicebear/sdk-js";
import { boolFlag, parseArgs, splitGlobals, strFlag } from "./args.js";
import { login, logout, whoami, init } from "./commands/auth.js";
import { collections } from "./commands/collections.js";
import { avatars } from "./commands/avatars.js";
import { apiKeys } from "./commands/keys.js";
import { rules, schedules } from "./commands/rules.js";
import { webhooks } from "./commands/webhooks.js";
import { analytics } from "./commands/analytics.js";
import { team, orgs } from "./commands/team.js";
import { deploy } from "./commands/deploy.js";
import { makeCtx } from "./commands/context.js";
import { runCommand } from "./output.js";

const HELP = `nicebear — Dynamic Avatar Infrastructure CLI

Usage: nicebear <command> [subcommand] [options]

  login [--api-key KEY] [--org ID] [--base-url URL]   verify + store credentials
  logout                                              forget stored credentials
  whoami                                              show calling identity
  init [--base-url URL] [--org ID] [--engine E] [--force]
                                                      write nicebear.config.json
  collection <create|list|get|attach> ...             manage collections
  avatar <create|upload|external|get|delete|rollback|url|fetch> ...
                                                      manage avatars
  api-key <create|list|rotate|revoke> ...             manage API keys
  rule <create|list|update> ...                       rotation rules
  schedule <create|list> ...                          cron schedules
  webhook <create|list|deliveries|process> ...        webhooks
  analytics [--metric M] [--days N] | analytics rollup
  team <list|add|role|remove> ...  |  orgs            workspaces
  deploy [--project NAME] [--execute]                 Cloudflare deploy (dry-run by default)

Global options:
  --base-url URL   --api-key KEY   --org ID   --json   --help

Precedence: flags > NICEBEAR_API_KEY/NICEBEAR_BASE_URL env > stored credentials
> nicebear.config.json. Credentials live in the OS config dir (0600), never
in the project dir.`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    if (argv.length === 0) process.exitCode = 1;
    return;
  }

  // Global flags may appear before or after the command; hoist them first.
  const { globals, rest } = splitGlobals(argv);
  const args = parseArgs(rest);
  // Command handlers read args.flags, so merge globals back (command flags win).
  args.flags = { ...globals, ...args.flags };
  const json = boolFlag({ ...globals, ...args.flags }, "json");
  const ctx = makeCtx({
    baseUrlFlag: strFlag({ ...globals, ...args.flags }, "base-url", "baseUrl"),
    apiKeyFlag: strFlag({ ...globals, ...args.flags }, "api-key", "apiKey", "k"),
    orgFlag: strFlag({ ...globals, ...args.flags }, "org", "orgId"),
    json,
  });

  await runCommand(json, async () => {
    switch (args.command) {
      case "login":
        return login(args);
      case "logout":
        return logout();
      case "whoami":
        return whoami(args, ctx);
      case "init":
        return init(args);
      case "collection":
      case "collections":
        return collections(args, ctx);
      case "avatar":
      case "avatars":
        return avatars(args, ctx);
      case "api-key":
      case "api-keys":
        return apiKeys(args, ctx);
      case "rule":
      case "rules":
      case "rotation-rule":
        return rules(args, ctx);
      case "schedule":
      case "schedules":
        return schedules(args, ctx);
      case "webhook":
      case "webhooks":
        return webhooks(args, ctx);
      case "analytics":
        return analytics(args, ctx);
      case "team":
        return team(args, ctx);
      case "orgs":
        return orgs(args, ctx);
      case "deploy":
        return deploy(args);
      default:
        console.log(HELP);
        process.exitCode = 1;
        return null;
    }
  });
}

const GLOBAL_FLAGS = new Set(["base-url", "baseUrl", "api-key", "apiKey", "k", "org", "orgId", "json"]);

main().catch((e: unknown) => {
  if (e instanceof NiceBearError) console.error(`error: ${e.message}`);
  else console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
