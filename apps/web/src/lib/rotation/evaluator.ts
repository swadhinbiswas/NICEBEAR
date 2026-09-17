import type { RotationDsl, RotationRuleItem } from "@nicebear/shared-types";
import { matchesCron } from "./cron";
import { pickIndex } from "./hash";
import { isUsHoliday } from "./holidays";
import { getZonedParts, isInRange, minutesSinceMidnight, parseTimeRange } from "./tz";

export interface EvaluatorContext {
  /** Collection contents for `avatar_from: collection:<id>` resolution. */
  collections?: Record<string, string[]>;
  /** Optional explicit seed (e.g. `?seed=john`). Used when seed_by=request. */
  seed?: string;
}

const EVERY_RE = /^every:(\d+)([mhdw])$/;
const WEEKDAY_RE = /^weekday:(mon|tue|wed|thu|fri|sat|sun)$/;
const TIME_RE = /^time_of_day:(\d{2}:\d{2}-\d{2}:\d{2})$/;
const HOLIDAY_RE = /^is_holiday:([A-Z]{2})$/;
const CRON_RE = /^cron:(.+)$/;

export function everyToMs(expr: string): number | null {
  const m = EVERY_RE.exec(expr);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  const per: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return n * per[unit];
}

function collectionId(ref: string): string {
  return ref.slice("collection:".length);
}

function resolveTarget(
  item: RotationRuleItem,
  now: Date,
  ctx: EvaluatorContext,
  whenKey: string,
): string | null {
  if (item.avatar) return item.avatar;
  if (!item.avatar_from || !ctx.collections) return null;
  const list = ctx.collections[collectionId(item.avatar_from)];
  if (!list || list.length === 0) return null;
  if (whenKey.startsWith("every:")) {
    const ms = everyToMs(whenKey);
    if (!ms) return list[0];
    const slot = Math.floor(now.getTime() / ms);
    return list[slot % list.length];
  }
  if (whenKey.startsWith("cron:")) {
    // Deterministic daily slot within the collection: day-index rotates.
    const dayIndex = Math.floor(now.getTime() / 86_400_000);
    return list[dayIndex % list.length];
  }
  // `random`: seed determines the pick so KV caching + tests stay trivial.
  const seedBy = item.seed_by ?? "request";
  const seedKey =
    seedBy === "request"
      ? (ctx.seed ?? now.toISOString().slice(0, 10))
      : seedBy === "day"
        ? now.toISOString().slice(0, 10)
        : `${now.getUTCFullYear()}-W${Math.floor(now.getTime() / 604_800_000)}`;
  return list[pickIndex(`${whenKey}:${seedKey}`, list.length)];
}

function whenMatches(when: string, now: Date, item: RotationRuleItem): boolean {
  const tz = item.tz ?? "UTC";
  if (when === "random" || when === "is_weekend") {
    if (when === "random") return true;
    const wd = getZonedParts(now, tz).weekday;
    return wd === 0 || wd === 6;
  }
  let m: RegExpExecArray | null;
  if ((m = WEEKDAY_RE.exec(when))) return getZonedParts(now, tz).weekdayShort === m[1];
  if ((m = TIME_RE.exec(when))) {
    const { start, end } = parseTimeRange(m[1]);
    return isInRange(minutesSinceMidnight(getZonedParts(now, tz)), start, end);
  }
  if ((m = HOLIDAY_RE.exec(when))) {
    if (m[1] === "US") return isUsHoliday(now, tz);
    return false; // unknown region codes never match (fail-closed)
  }
  if ((m = CRON_RE.exec(when))) return matchesCron(m[1], now, tz);
  if (EVERY_RE.test(when)) return true; // interval rules always resolve (slot math decides)
  return false;
}

/**
 * Pure function: resolveActiveAvatar(rule, now, ctx?) → avatarId | null.
 * Deterministic given the same (rule, now, seed, collections) — this is what
 * makes KV caching and exhaustive unit testing trivial.
 * `first_match` wins; null means "no rule matched".
 */
export function resolveActiveAvatar(
  rule: RotationDsl,
  now: Date,
  ctx: EvaluatorContext = {},
): string | null {
  for (const item of rule.rules) {
    if (!whenMatches(item.when, now, item)) continue;
    const resolved = resolveTarget(item, now, ctx, item.when);
    if (resolved) return resolved;
  }
  return null;
}

/**
 * Compute the KV decision-cache TTL boundary for a rule: seconds until the
 * next moment the resolution could change. Conservative (minimum over rules).
 */
export function secondsUntilNextBoundary(rule: RotationDsl, now: Date): number {
  const nowMs = now.getTime();
  const nextMidnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  let ttl = Math.max(1, Math.floor((nextMidnightUtc - nowMs) / 1000));
  for (const item of rule.rules) {
    if (item.when.startsWith("every:")) {
      const ms = everyToMs(item.when);
      if (ms) {
        const remain = Math.floor((Math.floor(nowMs / ms) * ms + ms - nowMs) / 1000);
        ttl = Math.min(ttl, Math.max(1, remain));
      }
    }
  }
  return ttl;
}
