import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface StoredCredentials {
  baseUrl: string;
  apiKey: string;
  orgId?: string;
  updatedAt: string;
}

export interface ProjectConfig {
  baseUrl?: string;
  orgId?: string;
  defaultEngine?: string;
}

function configDir(): string {
  return (
    process.env.NICEBEAR_CONFIG_DIR ??
    process.env.XDG_CONFIG_HOME ??
    join(homedir(), ".config", "nicebear")
  );
}

function credsPath(): string {
  return join(configDir(), "credentials.json");
}

function projectPath(cwd = process.cwd()): string {
  return join(cwd, "nicebear.config.json");
}

/**
 * Credential + project-config store.
 *
 * Credentials live in a 0600 file under the OS config dir (NOT the project
 * dir, so keys never end up in git). Env override exists for tests/CI
 * (`NICEBEAR_CONFIG_DIR`). A future revision can swap the file backend for
 * the OS keychain behind the same load/save/clear interface.
 */
export function saveCredentials(creds: Omit<StoredCredentials, "updatedAt">): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const payload: StoredCredentials = { ...creds, updatedAt: new Date().toISOString() };
  writeFileSync(credsPath(), JSON.stringify(payload, null, 2), { mode: 0o600 });
  try {
    chmodSync(credsPath(), 0o600);
  } catch {
    /* non-POSIX filesystems */
  }
}

export function loadCredentials(): StoredCredentials | null {
  try {
    if (!existsSync(credsPath())) return null;
    const raw = JSON.parse(readFileSync(credsPath(), "utf8")) as Partial<StoredCredentials>;
    if (typeof raw.apiKey !== "string" || !raw.apiKey) return null;
    return {
      baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : "https://api.nicebear.dev",
      apiKey: raw.apiKey,
      orgId: typeof raw.orgId === "string" ? raw.orgId : undefined,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    };
  } catch {
    return null;
  }
}

export function clearCredentials(): boolean {
  try {
    if (!existsSync(credsPath())) return false;
    unlinkSync(credsPath());
    return true;
  } catch {
    return false;
  }
}

export function loadProjectConfig(cwd = process.cwd()): ProjectConfig | null {
  try {
    if (!existsSync(projectPath(cwd))) return null;
    return JSON.parse(readFileSync(projectPath(cwd), "utf8")) as ProjectConfig;
  } catch {
    return null;
  }
}

export function saveProjectConfig(cfg: ProjectConfig, cwd = process.cwd()): string {
  const path = projectPath(cwd);
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
  return path;
}

export interface ResolvedContext {
  baseUrl: string;
  apiKey?: string;
  orgId?: string;
  source: string;
}

/**
 * Precedence: explicit flags > env (NICEBEAR_API_KEY / NICEBEAR_BASE_URL) >
 * stored credentials > project config (baseUrl/org only, never keys).
 */
export function resolveContext(opts: {
  baseUrlFlag?: string;
  apiKeyFlag?: string;
  orgFlag?: string;
  cwd?: string;
}): ResolvedContext {
  const stored = loadCredentials();
  const project = loadProjectConfig(opts.cwd);
  const apiKey = opts.apiKeyFlag ?? process.env.NICEBEAR_API_KEY ?? stored?.apiKey;
  const baseUrl =
    opts.baseUrlFlag ??
    process.env.NICEBEAR_BASE_URL ??
    stored?.baseUrl ??
    project?.baseUrl ??
    "https://api.nicebear.dev";
  const orgId = opts.orgFlag ?? stored?.orgId ?? project?.orgId;
  const source = opts.apiKeyFlag || process.env.NICEBEAR_API_KEY ? "flag/env" : stored ? "stored" : "anonymous";
  return { baseUrl, apiKey, orgId, source };
}
