import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ParsedArgs } from "../args.js";
import { boolFlag, strFlag } from "../args.js";

/**
 * nicebear deploy [--project NAME] [--execute]
 *
 * Default (safe): verifies prerequisites (wrangler installed + logged in,
 * built output present) and prints the exact commands. Pass --execute to
 * run them. Deploys Cloudflare Pages + Functions; see
 * docs/deployment-cloudflare.md for the full setup.
 */
export async function deploy(args: ParsedArgs, opts: { cwd?: string } = {}): Promise<unknown> {
  const cwd = opts.cwd ?? process.cwd();
  const project = strFlag(args.flags, "project", "p") ?? "nicebear";
  const execute = boolFlag(args.flags, "execute");

  const checks: Array<{ name: string; ok: boolean; hint: string }> = [];
  const hasWrangler = commandOk("wrangler", ["--version"]);
  checks.push({
    name: "wrangler installed",
    ok: hasWrangler,
    hint: hasWrangler ? "" : "install: npm i -g wrangler",
  });
  let loggedIn = false;
  if (hasWrangler) {
    loggedIn = commandOk("wrangler", ["whoami"]);
  }
  checks.push({ name: "wrangler logged in", ok: loggedIn, hint: loggedIn ? "" : "run: wrangler login" });

  const distDir = `${cwd.replace(/\/$/, "")}/apps/web/dist`;
  let built = false;
  try {
    built = statSync(distDir).isDirectory();
  } catch {
    built = false;
  }
  checks.push({ name: "app built (apps/web/dist)", ok: built, hint: built ? "" : "run: pnpm build" });

  const commands = [
    "pnpm db:migrate",
    `wrangler pages deploy apps/web/dist --project-name ${project}`,
  ];
  if (!execute) {
    return { dryRun: true, checks, runWithExecute: ["nicebear deploy", `--project ${project}`, "--execute"] };
  }
  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    throw new Error(`prerequisites missing: ${failed.map((c) => `${c.name} (${c.hint})`).join("; ")}`);
  }
  const out: string[] = [];
  for (const full of commands) {
    const [bin, ...rest] = full.split(" ");
    out.push(execFileSync(bin!, rest, { cwd: joinRoot(cwd), encoding: "utf8", timeout: 300_000 }).slice(-2000));
  }
  return { ok: true, project, outputTail: out };
}

function commandOk(bin: string, args: string[]): boolean {
  try {
    execFileSync(bin, args, { stdio: "ignore", timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

/** Walk up to the repo root (pnpm workspace marker) for command execution. */
function joinRoot(cwd: string): string {
  let dir = cwd;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cwd;
}
