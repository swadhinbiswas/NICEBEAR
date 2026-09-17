import { NiceBearError } from "@nicebear/sdk-js";

/** Human tables by default, JSON with --json. All output via these helpers. */

export function print(value: unknown, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    console.log(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const row of value) printRow(row);
    return;
  }
  if (typeof value === "object") {
    printRow(value as Record<string, unknown>);
    return;
  }
  console.log(String(value));
}

function printRow(row: unknown): void {
  if (typeof row !== "object" || row === null) {
    console.log(String(row));
    return;
  }
  const entries = Object.entries(row as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 1) {
    console.log(String(entries[0]![1]));
    return;
  }
  console.log(entries.map(([k, v]) => `${k}: ${formatCell(v)}`).join("  "));
}

function formatCell(v: unknown): string {
  if (v === null) return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function printError(e: unknown): void {
  if (e instanceof NiceBearError) {
    console.error(`error: ${e.message}`);
    if (process.env.NICEBEAR_DEBUG) console.error(JSON.stringify(e.body, null, 2));
  } else if (e instanceof Error) {
    console.error(`error: ${e.message}`);
  } else {
    console.error(`error: ${String(e)}`);
  }
}

/** Wrap a command body: pretty errors + exit code, JSON errors to stderr. */
export async function runCommand(asJson: boolean, fn: () => Promise<unknown>): Promise<void> {
  try {
    print(await fn(), asJson);
  } catch (e) {
    if (asJson) {
      const status = e instanceof NiceBearError ? e.status : 1;
      console.log(JSON.stringify({ error: e instanceof Error ? e.message : String(e), status }));
    } else {
      printError(e);
    }
    process.exitCode = 1;
  }
}
