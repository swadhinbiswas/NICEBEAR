/** Minimal argv parser (no dependencies): `cmd sub --flag value --bool pos`. */

export interface ParsedArgs {
  command?: string;
  sub?: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/** Parse raw argv (without node/script). First token = command, second (if not a flag) = subcommand. */
export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { positionals: [], flags: {} };
  const rest = [...argv];
  if (rest.length > 0 && !rest[0]?.startsWith("-")) out.command = rest.shift();
  if (rest.length > 0 && !rest[0]?.startsWith("-")) out.sub = rest.shift();
  let i = 0;
  while (i < rest.length) {
    const tok = rest[i]!;
    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      if (eq >= 0) {
        out.flags[tok.slice(2, eq)] = tok.slice(eq + 1);
        i += 1;
      } else {
        const name = tok.slice(2);
        const next = rest[i + 1];
        if (next === undefined || next.startsWith("--")) {
          out.flags[name] = true;
          i += 1;
        } else {
          out.flags[name] = next;
          i += 2;
        }
      }
    } else if (tok.startsWith("-") && tok.length > 1) {
      if (tok.length === 2) {
        // Single short flag: `-o value` consumes the next token, `-o` alone is boolean.
        const name = tok.slice(1);
        const next = rest[i + 1];
        if (next === undefined || next.startsWith("-")) {
          out.flags[name] = true;
          i += 1;
        } else {
          out.flags[name] = next;
          i += 2;
        }
      } else {
        for (const ch of tok.slice(1)) out.flags[ch] = true;
        i += 1;
      }
    } else {
      out.positionals.push(tok);
      i += 1;
    }
  }
  return out;
}

/** Typed flag access with `--no-x` negation support. */
export function strFlag(flags: Record<string, string | boolean>, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = flags[n];
    if (typeof v === "string") return v;
  }
  return undefined;
}

const GLOBAL_FLAGS = new Set(["base-url", "baseUrl", "api-key", "apiKey", "k", "org", "orgId", "json"]);

/** Hoist global flags wherever they appear; command handlers see the rest. */
export function splitGlobals(argv: string[]): {
  globals: Record<string, string | boolean>;
  rest: string[];
} {
  const globals: Record<string, string | boolean> = {};
  const rest: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const tok = argv[i]!;
    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      const name = eq >= 0 ? tok.slice(2, eq) : tok.slice(2);
      if (GLOBAL_FLAGS.has(name)) {
        if (eq >= 0) {
          globals[name] = tok.slice(eq + 1);
          i += 1;
        } else {
          const next = argv[i + 1];
          if (next === undefined || next.startsWith("--") || name === "json") {
            globals[name] = true;
            i += 1;
          } else {
            globals[name] = next;
            i += 2;
          }
        }
        continue;
      }
    }
    rest.push(tok);
    i += 1;
  }
  return { globals, rest };
}

export function boolFlag(flags: Record<string, string | boolean>, ...names: string[]): boolean {
  for (const n of names) {
    const v = flags[n];
    if (v === true) return true;
    if (typeof v === "string") return v !== "false" && v !== "0";
  }
  return false;
}
