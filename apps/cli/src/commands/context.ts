import { NiceBear } from "@nicebear/sdk-js";
import { resolveContext } from "../store.js";

export interface Ctx {
  client: NiceBear;
  orgId?: string;
  json: boolean;
  /** True when an API key is configured (flag/env/stored). */
  authed: boolean;
}

export interface CtxOptions {
  baseUrlFlag?: string;
  apiKeyFlag?: string;
  orgFlag?: string;
  json?: boolean;
  cwd?: string;
  fetchImpl?: typeof fetch;
}

/** Build an authenticated SDK client from flags/env/stored/project config. */
export function makeCtx(opts: CtxOptions = {}): Ctx {
  const r = resolveContext({
    baseUrlFlag: opts.baseUrlFlag,
    apiKeyFlag: opts.apiKeyFlag,
    orgFlag: opts.orgFlag,
    cwd: opts.cwd,
  });
  return {
    client: new NiceBear({ baseUrl: r.baseUrl, apiKey: r.apiKey, fetchImpl: opts.fetchImpl }),
    orgId: r.orgId,
    json: opts.json ?? false,
    authed: !!r.apiKey,
  };
}

/** Guard for commands that need a key (session auth doesn't exist for CLI). */
export function needKey(ctx: Ctx): void {
  if (!ctx.authed) {
    throw new Error(
      "not logged in — run `nicebear login --api-key nb_live_...` or set NICEBEAR_API_KEY",
    );
  }
}
