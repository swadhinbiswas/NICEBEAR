import { createInterface } from "node:readline";
import { DEFAULT_BASE_URL, NiceBear } from "@nicebear/sdk-js";
import type { ParsedArgs } from "../args.js";
import { boolFlag, strFlag } from "../args.js";
import { loadProjectConfig, saveCredentials, clearCredentials, saveProjectConfig } from "../store.js";
import { needKey, type Ctx } from "./context.js";

async function promptHidden(question: string): Promise<string> {
  // No echo control without native deps; warn and read visibly. Prefer
  // --api-key or NICEBEAR_API_KEY in scripts.
  console.error("warning: input will be visible — prefer --api-key or NICEBEAR_API_KEY");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise<string>((resolve) => rl.question(question, resolve)).then((s) => s.trim());
  } finally {
    rl.close();
  }
}

/** nicebear login [--api-key KEY] [--org ID] [--base-url URL] */
export async function login(
  args: ParsedArgs,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<unknown> {
  const apiKey =
    strFlag(args.flags, "api-key", "apiKey", "k") ??
    process.env.NICEBEAR_API_KEY ??
    (process.stdin.isTTY ? await promptHidden("API key (nb_live_...): ") : undefined);
  if (!apiKey) throw new Error("no API key given — use --api-key or NICEBEAR_API_KEY");
  const baseUrl = strFlag(args.flags, "base-url", "baseUrl") ?? process.env.NICEBEAR_BASE_URL ?? DEFAULT_BASE_URL;
  const probe = new NiceBear({ baseUrl, apiKey, fetchImpl: opts.fetchImpl });
  const me = (await probe.whoami()) as { owner_id: string; owner_type: string; scope: string };
  const orgId = strFlag(args.flags, "org", "orgId") ?? (me.owner_type === "organization" ? me.owner_id : undefined);
  saveCredentials({ baseUrl, apiKey, orgId });
  return { ok: true, owner_id: me.owner_id, owner_type: me.owner_type, scope: me.scope, org_id: orgId ?? null };
}

/** nicebear logout */
export async function logout(): Promise<unknown> {
  return { ok: true, cleared: clearCredentials() };
}

/** nicebear whoami */
export async function whoami(_args: ParsedArgs, ctx: Ctx): Promise<unknown> {
  needKey(ctx);
  return ctx.client.whoami();
}

/** nicebear init [--base-url URL] [--org ID] [--engine NAME] [--force] */
export async function init(args: ParsedArgs, opts: { cwd?: string } = {}): Promise<unknown> {
  const cwd = opts.cwd ?? process.cwd();
  if (loadProjectConfig(cwd) && !boolFlag(args.flags, "force", "f")) {
    throw new Error("nicebear.config.json already exists — use --force to overwrite");
  }
  const path = saveProjectConfig(
    {
      ...(strFlag(args.flags, "base-url", "baseUrl") ? { baseUrl: strFlag(args.flags, "base-url", "baseUrl")! } : {}),
      ...(strFlag(args.flags, "org", "orgId") ? { orgId: strFlag(args.flags, "org", "orgId")! } : {}),
      ...(strFlag(args.flags, "engine") ? { defaultEngine: strFlag(args.flags, "engine")! } : {}),
    },
    cwd,
  );
  return { ok: true, path };
}
