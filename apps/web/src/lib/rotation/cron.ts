import { getZonedParts } from "./tz";

function matchField(value: number, expr: string, min: number, max: number): boolean {
  if (expr === "*") return true;
  // comma lists
  if (expr.includes(",")) return expr.split(",").some((e) => matchField(value, e.trim(), min, max));
  // step values: */n or a-b/n
  const stepSplit = expr.split("/");
  if (stepSplit.length === 2) {
    const step = Number(stepSplit[1]);
    if (!Number.isInteger(step) || step <= 0) return false;
    const base = stepSplit[0];
    if (base === "*") return (value - min) % step === 0;
    const range = parseRange(base, min, max);
    if (!range) return false;
    if (value < range[0] || value > range[1]) return false;
    return (value - range[0]) % step === 0;
  }
  const range = parseRange(expr, min, max);
  if (!range) return false;
  return value >= range[0] && value <= range[1];
}

function parseRange(expr: string, min: number, max: number): [number, number] | null {
  if (/^\d+$/.test(expr)) {
    const v = Number(expr);
    // cron dow accepts 7 as Sunday
    if (max === 6 && v === 7) return [0, 0];
    if (v < min || v > max) return null;
    return [v, v];
  }
  const m = /^(\d+)-(\d+)$/.exec(expr);
  if (!m) return null;
  let a = Number(m[1]);
  let b = Number(m[2]);
  if (max === 6) {
    if (a === 7) a = 0;
    if (b === 7) b = 0;
  }
  if (a < min || b > max || a > b) return null;
  return [a, b];
}

/**
 * Minimal 5-field cron matcher: `m h dom mon dow`.
 * - dom/mon/dow follow Vixie cron OR-semantics: if dom AND dow are both
 *   restricted (not `*`), a match on either satisfies the day condition.
 * - Evaluated in the rule's tz (default UTC).
 */
export function matchesCron(cronExpr: string, now: Date, tz = "UTC"): boolean {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [mE, hE, domE, monE, dowE] = fields;
  const p = getZonedParts(now, tz);
  if (!matchField(p.minute, mE, 0, 59)) return false;
  if (!matchField(p.hour, hE, 0, 23)) return false;
  if (!matchField(p.month, monE, 1, 12)) return false;
  const domRestricted = domE !== "*";
  const dowRestricted = dowE !== "*";
  const domMatch = matchField(p.day, domE, 1, 31);
  const dowMatch = matchField(p.weekday, dowE, 0, 6);
  if (domRestricted && dowRestricted) return domMatch || dowMatch;
  if (domRestricted) return domMatch;
  if (dowRestricted) return dowMatch;
  return true;
}
