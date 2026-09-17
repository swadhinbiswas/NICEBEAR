import { describe, expect, it } from "vitest";
import type { RotationDsl } from "@nicebear/shared-types";
import { matchesCron } from "./lib/rotation/cron";
import { resolveActiveAvatar, secondsUntilNextBoundary } from "./lib/rotation/evaluator";
import { buildCustomRule, buildDailyRule } from "./lib/rotation/wrappers";

const MON_2026_01_05 = new Date("2026-01-05T12:00:00Z"); // a Monday
const TUE_2026_01_06 = new Date("2026-01-06T12:00:00Z"); // a Tuesday
const SAT_2026_01_10 = new Date("2026-01-10T12:00:00Z"); // a Saturday

describe("resolveActiveAvatar — deterministic", () => {
  it("matches weekday rules first_match", () => {
    const rule: RotationDsl = {
      type: "composite",
      priority: "first_match",
      rules: [
        { when: "weekday:mon", avatar: "avatar_a" },
        { when: "weekday:tue", avatar: "avatar_b" },
      ],
    };
    expect(resolveActiveAvatar(rule, MON_2026_01_05)).toBe("avatar_a");
    expect(resolveActiveAvatar(rule, TUE_2026_01_06)).toBe("avatar_b");
  });

  it("matches time_of_day windows with tz", () => {
    const rule: RotationDsl = {
      type: "composite",
      priority: "first_match",
      rules: [{ when: "time_of_day:06:00-12:00", tz: "UTC", avatar: "avatar_morning" }],
    };
    expect(resolveActiveAvatar(rule, new Date("2026-01-05T08:00:00Z"))).toBe("avatar_morning");
    expect(resolveActiveAvatar(rule, new Date("2026-01-05T13:00:00Z"))).toBeNull();
  });

  it("matches is_weekend", () => {
    const rule: RotationDsl = {
      type: "composite",
      priority: "first_match",
      rules: [{ when: "is_weekend", avatar: "avatar_weekend" }],
    };
    expect(resolveActiveAvatar(rule, SAT_2026_01_10)).toBe("avatar_weekend");
    expect(resolveActiveAvatar(rule, MON_2026_01_05)).toBeNull();
  });

  it("matches is_holiday:US (Christmas)", () => {
    const rule: RotationDsl = {
      type: "composite",
      priority: "first_match",
      rules: [{ when: "is_holiday:US", avatar: "avatar_holiday" }],
    };
    expect(resolveActiveAvatar(rule, new Date("2026-12-25T12:00:00Z"))).toBe("avatar_holiday");
    expect(resolveActiveAvatar(rule, MON_2026_01_05)).toBeNull();
  });

  it("resolves every:3d slots deterministically", () => {
    const rule: RotationDsl = {
      type: "composite",
      priority: "first_match",
      rules: [{ when: "every:3d", avatar_from: "collection:main" }],
    };
    const cols = { main: ["a", "b", "c"] };
    const t = new Date("2026-01-05T00:00:00Z");
    const first = resolveActiveAvatar(rule, t, { collections: cols });
    expect(resolveActiveAvatar(rule, t, { collections: cols })).toBe(first); // same now → same id
    const later = new Date(t.getTime() + 3 * 86_400_000);
    expect(["a", "b", "c"]).toContain(resolveActiveAvatar(rule, later, { collections: cols }));
  });

  it("resolves random deterministically given the same seed", () => {
    const rule: RotationDsl = {
      type: "composite",
      priority: "first_match",
      rules: [{ when: "random", avatar_from: "collection:main", seed_by: "request" }],
    };
    const cols = { main: ["a", "b", "c", "d"] };
    const r1 = resolveActiveAvatar(rule, MON_2026_01_05, { collections: cols, seed: "john" });
    const r2 = resolveActiveAvatar(rule, TUE_2026_01_06, { collections: cols, seed: "john" });
    expect(r1).toBe(r2); // same seed → same pick regardless of `now`
  });

  it("cron rules match minute/hour", () => {
    expect(matchesCron("0 0 * * *", new Date("2026-01-05T00:00:00Z"))).toBe(true);
    expect(matchesCron("0 0 * * *", new Date("2026-01-05T00:01:00Z"))).toBe(false);
  });

  it("thin wrappers build equivalent DSL", () => {
    const daily = buildDailyRule("main");
    expect(daily.rules[0].when).toBe("every:1d");
    const custom = buildCustomRule("main", { every: "3 days" });
    expect(custom.rules[0].when).toBe("every:3d");
  });

  it("computes KV TTL until next boundary", () => {
    const ttl = secondsUntilNextBoundary(buildDailyRule("main"), MON_2026_01_05);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(86400);
  });
});
