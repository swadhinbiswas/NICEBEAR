import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { spawn, type ChildProcess } from "node:child_process";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, "..");
const rootDir = join(here, "..", "..");
const STATE_PATH = join(here, ".state.json");
const PORT = 4411;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() - start > timeoutMs) throw new Error(`server did not start at ${url}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "nb-pw-"));
  const dbUrl = `file:${join(dir, "nicebear.db")}`;
  const baseURL = `http://127.0.0.1:${PORT}`;
  // better-auth validates request origins against its baseURL — must match.
  // DONATE_URL exercises the support page's optional donate button.
  const env = {
    ...process.env,
    TURSO_DATABASE_URL: dbUrl,
    BETTER_AUTH_URL: baseURL,
    DONATE_URL: "https://example.com/donate",
  };

  await execFileAsync("node", ["scripts/migrate.mjs"], { cwd: webDir, env });
  const seed = await execFileAsync("node", ["scripts/seed.mjs", "e2e"], { cwd: webDir, env });
  const lines = seed.stdout.split("\n").map((l) => l.trim());
  const keyLine = lines.findIndex((l) => l.includes("ADMIN API KEY"));
  const key = lines[keyLine + 1];
  const ids = lines.find((l) => l.startsWith("key_id=")) ?? "";
  const keyId = /key_id=(\S+)/.exec(ids)?.[1] ?? "";
  const orgId = /org_id=(\S+)/.exec(ids)?.[1] ?? "";
  if (!key?.startsWith("nb_live_") || !orgId) {
    throw new Error(`seed parse failed:\n${seed.stdout}`);
  }

  // Extra user for team-membership flows (invites require existing users).
  const db = createClient({ url: dbUrl });
  const now = Math.floor(Date.now() / 1000);
  await db.execute({
    sql: "INSERT INTO users (id, email, name, github_id, avatar_url, created_at, deleted_at) VALUES ('u_e2e_mate', 'mate@e2e.dev', 'E2E Mate', NULL, NULL, ?, NULL)",
    args: [now],
  });

  // Boot the real app (astro dev) against the temp DB. `pnpm exec` forwards
  // CLI flags cleanly (plain `pnpm dev -- --port` leaks the `--` through).
  const server: ChildProcess = spawn("pnpm", ["--filter", "@nicebear/web", "exec", "astro", "dev", "--port", String(PORT)], {
    cwd: rootDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  server.stdout?.on("data", () => undefined);
  server.stderr?.on("data", () => undefined);
  if (!server.pid) throw new Error("failed to spawn dev server");

  try {
    await waitForServer(baseURL, 90_000);
    // Guard against a stale server squatting the port (bind conflicts don't
    // fail the spawn): prove THIS server sees our seeded key.
    const who = await fetch(`${baseURL}/api/api-keys/self`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (who.status !== 200) {
      throw new Error(
        `port ${PORT} answered but rejected the seeded key (HTTP ${who.status}) — ` +
          `another dev server is likely squatting the port; kill it and retry`,
      );
    }
    // Warm Astro dev's lazy island compilation so browser tests don't race it.
    await Promise.all(
      ["/dashboard", "/login", "/dashboard/api-keys", "/dashboard/webhooks", "/dashboard/collections", "/dashboard/analytics", "/dashboard/team"].map(
        (p) => fetch(`${baseURL}${p}`).then((r) => r.text()).catch(() => ""),
      ),
    );
  } catch (e) {
    server.kill();
    throw e;
  }

  writeFileSync(STATE_PATH, JSON.stringify({ baseURL, key, keyId, orgId, dbUrl, dir, serverPid: server.pid }));
  // Detach so the server outlives this setup process (teardown kills by pid).
  server.unref();
}

export default main;
