import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boolFlag, parseArgs, splitGlobals, strFlag } from "./args.js";
import { makeCtx } from "./commands/context.js";
import { login, logout, init } from "./commands/auth.js";
import { collections } from "./commands/collections.js";
import { avatars } from "./commands/avatars.js";
import { apiKeys } from "./commands/keys.js";
import { rules } from "./commands/rules.js";
import { webhooks } from "./commands/webhooks.js";
import { analytics } from "./commands/analytics.js";
import { team } from "./commands/team.js";
import { loadCredentials, loadProjectConfig } from "./store.js";

function stubFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const { status, body } = handler(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const ok = () => ({ status: 200, body: { ok: true, id: "x" } });

function ctxWith(fetchImpl?: typeof fetch, flags: Record<string, string | boolean> = {}) {
  return makeCtx({
    baseUrlFlag: "https://x.test",
    apiKeyFlag: "nb_live_test",
    orgFlag: typeof flags.org === "string" ? flags.org : undefined,
    fetchImpl,
  });
}

describe("args parser", () => {
  it("splits command/sub/flags/positionals", () => {
    const a = parseArgs(["collection", "create", "--name", "t", "--engine=px", "pos", "-j"]);
    expect(a.command).toBe("collection");
    expect(a.sub).toBe("create");
    expect(a.positionals).toEqual(["pos"]);
    expect(strFlag(a.flags, "name")).toBe("t");
    expect(strFlag(a.flags, "engine")).toBe("px");
    expect(boolFlag(a.flags, "j")).toBe(true);
  });

  it("treats lone flags as booleans, supports --no-x via string", () => {
    const a = parseArgs(["avatar", "external", "--attest-rights", "--no-mirror"]);
    expect(boolFlag(a.flags, "attest-rights")).toBe(true);
    expect(boolFlag(a.flags, "no-mirror")).toBe(true);
    expect(strFlag(a.flags, "missing")).toBeUndefined();
  });

  it("parses short flags with values (-o file) and clusters (-abc)", () => {
    const a = parseArgs(["avatar", "fetch", "av_1", "-o", "out.svg"]);
    expect(a.sub).toBe("fetch");
    expect(a.positionals).toEqual(["av_1"]);
    expect(strFlag(a.flags, "o")).toBe("out.svg");
    const b = parseArgs(["cmd", "-abc"]);
    expect(b.flags).toMatchObject({ a: true, b: true, c: true });
  });

  it("hoists global flags from anywhere in argv", () => {
    const { globals, rest } = splitGlobals([
      "--base-url", "https://x.test", "login", "--api-key", "k", "--json",
    ]);
    expect(globals).toMatchObject({ "base-url": "https://x.test", "api-key": "k", json: true });
    expect(rest).toEqual(["login"]);
    const parsed = parseArgs(rest);
    expect(parsed.command).toBe("login");
  });
});

describe("credential store (temp dir)", () => {
  let dir: string;
  let savedEnv: string | undefined;
  let savedKey: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nb-cli-"));
    savedEnv = process.env.NICEBEAR_CONFIG_DIR;
    savedKey = process.env.NICEBEAR_API_KEY;
    process.env.NICEBEAR_CONFIG_DIR = dir;
    delete process.env.NICEBEAR_API_KEY;
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.NICEBEAR_CONFIG_DIR;
    else process.env.NICEBEAR_CONFIG_DIR = savedEnv;
    if (savedKey === undefined) delete process.env.NICEBEAR_API_KEY;
    else process.env.NICEBEAR_API_KEY = savedKey;
    vi.unstubAllEnvs();
  });

  it("login verifies then stores 0600 credentials; logout clears", async () => {
    const { fetchImpl } = stubFetch((url) => {
      if (url.endsWith("/api/api-keys/self")) {
        return { status: 200, body: { owner_id: "org_1", owner_type: "organization", scope: "admin" } };
      }
      return { status: 404, body: { error: "nope" } };
    });
    const res = (await login(parseArgs(["login", "--api-key", "nb_live_x"]), { fetchImpl })) as Record<string, unknown>;
    expect(res.ok).toBe(true);
    expect(res.org_id).toBe("org_1");
    const stored = loadCredentials();
    expect(stored?.apiKey).toBe("nb_live_x");
    if (process.platform !== "win32") {
      expect(statSync(join(dir, "credentials.json")).mode & 0o777).toBe(0o600);
    }
    expect(await logout()).toEqual({ ok: true, cleared: true });
    expect(loadCredentials()).toBeNull();
  });

  it("login rejects invalid keys without storing", async () => {
    const { fetchImpl } = stubFetch(() => ({ status: 401, body: { error: "bad" } }));
    await expect(login(parseArgs(["login", "--api-key", "nb_live_bad"]), { fetchImpl })).rejects.toThrow();
    expect(loadCredentials()).toBeNull();
  });

  it("init writes project config, refuses overwrite without --force", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "nb-proj-"));
    const first = (await init(parseArgs(["init", "--org", "org_1"]), { cwd })) as Record<string, unknown>;
    expect(String(first.path)).toContain("nicebear.config.json");
    expect(loadProjectConfig(cwd)?.orgId).toBe("org_1");
    await expect(init(parseArgs(["init"]), { cwd })).rejects.toThrow(/already exists/);
    await init(parseArgs(["init", "--force"]), { cwd });
  });
});

describe("command handlers (stubbed API)", () => {
  let savedDir: string | undefined;
  let savedKey: string | undefined;

  beforeEach(() => {
    // Hermetic: never touch the real ~/.config, never pick up ambient keys.
    savedDir = process.env.NICEBEAR_CONFIG_DIR;
    savedKey = process.env.NICEBEAR_API_KEY;
    process.env.NICEBEAR_CONFIG_DIR = mkdtempSync(join(tmpdir(), "nb-cli-cmd-"));
    delete process.env.NICEBEAR_API_KEY;
  });

  afterEach(() => {
    if (savedDir === undefined) delete process.env.NICEBEAR_CONFIG_DIR;
    else process.env.NICEBEAR_CONFIG_DIR = savedDir;
    if (savedKey === undefined) delete process.env.NICEBEAR_API_KEY;
    else process.env.NICEBEAR_API_KEY = savedKey;
  });

  it("collections CRUD paths", async () => {
    const { calls, fetchImpl } = stubFetch(() => ok());
    const ctx = ctxWith(fetchImpl);
    await collections(parseArgs(["collection", "create", "--name", "t", "--engine", "px"]), ctx);
    expect(calls.at(-1)?.url).toBe("https://x.test/api/collections");
    await collections(parseArgs(["collection", "get", "col_1"]), ctx);
    expect(calls.at(-1)?.url).toBe("https://x.test/api/collections/col_1");
    await collections(parseArgs(["collection", "attach", "col_1", "av_1"]), ctx);
    expect(calls.at(-1)?.url).toBe("https://x.test/api/collections/col_1/avatars");
    await expect(collections(parseArgs(["collection", "get"]), ctx)).rejects.toThrow(/usage/);
  });

  it("avatars url/rollback/validation", async () => {
    const { calls, fetchImpl } = stubFetch(() => ok());
    const ctx = ctxWith(fetchImpl);
    expect(await avatars(parseArgs(["avatar", "url", "av_1", "--variant", "daily"]), ctx)).toBe(
      "https://x.test/api/avatar/av_1/daily",
    );
    expect(await avatars(parseArgs(["avatar", "url", "av_1", "--seed", "s"]), ctx)).toBe(
      "https://x.test/api/avatar/av_1?seed=s",
    );
    await avatars(parseArgs(["avatar", "rollback", "av_1", "--version", "2"]), ctx);
    expect(calls.at(-1)?.url).toBe("https://x.test/api/avatars/av_1/rollback");
    await expect(avatars(parseArgs(["avatar", "external", "--url", "https://x"]) , ctx)).rejects.toThrow(
      /attest-rights/,
    );
    await expect(avatars(parseArgs(["avatar", "upload", "--file", "a.png"]), ctx)).rejects.toThrow(/--repo/);
  });

  it("keys/rules/webhooks/analytics/team validation + paths", async () => {
    const { calls, fetchImpl } = stubFetch(() => ok());
    const ctx = ctxWith(fetchImpl);
    await apiKeys(parseArgs(["api-key", "rotate", "k1"]), ctx);
    expect(calls.at(-1)?.url).toBe("https://x.test/api/api-keys/k1/rotate");
    await expect(apiKeys(parseArgs(["api-key", "create", "--limit", "0"]), ctx)).rejects.toThrow(/positive/);

    await rules(
      parseArgs(["rule", "create", "--target", "avatar:av_1", "--when", "weekday:mon", "--avatar", "av_2"]),
      ctx,
    );
    expect(calls.at(-1)?.url).toBe("https://x.test/api/rotation-rules");
    await expect(
      rules(parseArgs(["rule", "create", "--target", "nope", "--when", "random"]), ctx),
    ).rejects.toThrow(/--target must look like|--avatar or --from-collection/);

    await webhooks(parseArgs(["webhook", "deliveries", "wh_1", "--limit", "5"]), ctx);
    expect(calls.at(-1)?.url).toBe("https://x.test/api/webhooks/wh_1/deliveries?limit=5");

    await analytics(parseArgs(["analytics", "top-avatars", "--days", "7"]), ctx);
    expect(calls.at(-1)?.url).toBe("https://x.test/api/analytics?metric=top-avatars&days=7");

    await team(parseArgs(["team", "remove", "--user", "u_1", "--org", "org_9"]), ctx);
    expect(calls.at(-1)?.url).toBe("https://x.test/api/team?org_id=org_9&user_id=u_1");
    await expect(team(parseArgs(["team", "add", "--email", "a@b.c"]), ctx)).rejects.toThrow(/--org/);
  });

  it("requires login for authed commands", async () => {
    const ctx = makeCtx({ baseUrlFlag: "https://x.test" });
    await expect(collections(parseArgs(["collection", "list"]), ctx)).rejects.toThrow(/not logged in/);
  });
});
