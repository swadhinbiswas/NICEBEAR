import { getZonedParts } from "./tz";

/** nth weekday of month (n>=1). weekday: 0=Sun..6=Sat */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): number {
  const last = new Date(Date.UTC(year, month, 0)); // day 0 of next month = last day
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return last.getUTCDate() - offset;
}

/**
 * Minimal US federal-holiday check (fixed + floating), evaluated in tz.
 * Covers: New Year's, MLK (3rd Mon Jan), Presidents (3rd Mon Feb),
 * Memorial (last Mon May), Juneteenth, Independence, Labor (1st Mon Sep),
 * Columbus (2nd Mon Oct), Veterans, Thanksgiving (4th Thu Nov), Christmas.
 * Weekend-observed shift is NOT applied — matching is on the nominal date.
 */
export function isUsHoliday(now: Date, tz = "UTC"): boolean {
  const p = getZonedParts(now, tz);
  const { year: y, month: m, day: d } = p;
  if (m === 1 && d === 1) return true;
  if (m === 1 && d === nthWeekdayOfMonth(y, 1, 1, 3)) return true;
  if (m === 2 && d === nthWeekdayOfMonth(y, 2, 1, 3)) return true;
  if (m === 5 && d === lastWeekdayOfMonth(y, 5, 1)) return true;
  if (m === 6 && d === 19) return true;
  if (m === 7 && d === 4) return true;
  if (m === 9 && d === nthWeekdayOfMonth(y, 9, 1, 1)) return true;
  if (m === 10 && d === nthWeekdayOfMonth(y, 10, 1, 2)) return true;
  if (m === 11 && d === 11) return true;
  if (m === 11 && d === nthWeekdayOfMonth(y, 11, 4, 4)) return true;
  if (m === 12 && d === 25) return true;
  return false;
}
