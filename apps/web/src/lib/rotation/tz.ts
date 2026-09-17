export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  /** 0=Sun..6=Sat (JS convention) */
  weekday: number;
  /** 'mon'..'sun' lowercase 3-letter */
  weekdayShort: string;
}

const SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Timezone-aware calendar parts via Intl. Falls back to UTC on invalid tz.
 * Pure + deterministic given (date, tz).
 */
export function getZonedParts(date: Date, tz = "UTC"): ZonedParts {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      weekday: "short",
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
    const weekdayRaw = (parts.weekday ?? "Sun").slice(0, 3).toLowerCase();
    const weekday = Math.max(0, SHORT.indexOf(weekdayRaw as (typeof SHORT)[number]));
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour) % 24,
      minute: Number(parts.minute),
      weekday,
      weekdayShort: SHORT[weekday],
    };
  } catch {
    const d = new Date(date.toISOString());
    const weekday = d.getUTCDay();
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      weekday,
      weekdayShort: SHORT[weekday],
    };
  }
}

export function minutesSinceMidnight(p: ZonedParts): number {
  return p.hour * 60 + p.minute;
}

export function parseTimeRange(range: string): { start: number; end: number } {
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(range);
  if (!m) throw new Error(`invalid time range: ${range}`);
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  return { start, end };
}

export function isInRange(nowMin: number, start: number, end: number): boolean {
  // Overnight ranges (e.g. 22:00-06:00) wrap past midnight.
  if (start <= end) return nowMin >= start && nowMin < end;
  return nowMin >= start || nowMin < end;
}
