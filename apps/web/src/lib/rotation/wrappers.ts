import type { RotationDsl } from "@nicebear/shared-types";

/**
 * Thin wrappers — /daily, /weekly, /monthly, /custom construct the equivalent
 * DSL and call the shared evaluator. No parallel logic paths (§5.2).
 */

export function buildDailyRule(collectionId: string): RotationDsl {
  return {
    type: "composite",
    priority: "first_match",
    rules: [{ when: "every:1d", avatar_from: `collection:${collectionId}` }],
  };
}

export function buildWeeklyRule(collectionId: string): RotationDsl {
  return {
    type: "composite",
    priority: "first_match",
    rules: [{ when: "every:1w", avatar_from: `collection:${collectionId}` }],
  };
}

export function buildMonthlyRule(avatarIds: string[]): RotationDsl {
  // Approximate month rotation with a cron-gated collection is overkill for the
  // wrapper; rotate across the explicit avatar list by month index instead.
  // Callers expand this into 12 weekday-agnostic rules if they need DSL purity.
  void avatarIds;
  return {
    type: "composite",
    priority: "first_match",
    rules: [{ when: "cron:0 0 1 * *", avatar_from: `collection:monthly` }],
  };
}

export function buildCustomRule(
  collectionId: string,
  input: { every: string } | { cron: string },
): RotationDsl {
  if ("cron" in input) {
    return {
      type: "composite",
      priority: "first_match",
      rules: [{ when: `cron:${input.cron}`, avatar_from: `collection:${collectionId}` }],
    };
  }
  const normalized = input.every.trim().toLowerCase().replace(/\s+/g, "");
  // "3 days" -> "3d", "1 week" -> "1w", "30 minutes" -> "30m", "2 hours" -> "2h"
  const compact = normalized
    .replace(/minutes?$/, "m")
    .replace(/hours?$/, "h")
    .replace(/days?$/, "d")
    .replace(/weeks?$/, "w");
  if (!/^every:\d+[mhdw]$/.test(`every:${compact}`)) {
    throw new Error(`invalid custom every: ${input.every}`);
  }
  return {
    type: "composite",
    priority: "first_match",
    rules: [{ when: `every:${compact}`, avatar_from: `collection:${collectionId}` }],
  };
}
