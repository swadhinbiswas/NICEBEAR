import { readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export default async function teardown(): Promise<void> {
  try {
    const state = JSON.parse(readFileSync(join(here, ".state.json"), "utf8")) as {
      serverPid: number;
      dir: string;
    };
    try {
      process.kill(state.serverPid, "SIGTERM");
    } catch {
      /* already gone */
    }
    rmSync(state.dir, { recursive: true, force: true });
    rmSync(join(here, ".state.json"), { force: true });
  } catch {
    /* best-effort */
  }
}
