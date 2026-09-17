import { describe, expect, it } from "vitest";
import { evaluateRuleStack, pickVersion } from "./lib/api/avatars";

describe("pickVersion (?v=N | ?v=latest)", () => {
  const history = [
    { sha: "ccc", createdAt: 300 },
    { sha: "aaa", createdAt: 100 },
    { sha: "bbb", createdAt: 200 },
  ];
  it("returns current for absent/latest", () => {
    expect(pickVersion(history, "ccc", null)).toBe("ccc");
    expect(pickVersion(history, "ccc", "latest")).toBe("ccc");
  });
  it("indexes chronologically (1-based), regardless of input order", () => {
    expect(pickVersion(history, "ccc", "1")).toBe("aaa");
    expect(pickVersion(history, "ccc", "2")).toBe("bbb");
    expect(pickVersion(history, "ccc", "3")).toBe("ccc");
  });
  it("falls back to current on invalid/out-of-range versions", () => {
    for (const v of ["0", "99", "abc", "-2", "1.5"]) {
      expect(pickVersion(history, "ccc", v)).toBe("ccc");
    }
  });
  it("returns null when nothing is committed", () => {
    expect(pickVersion([], null, null)).toBeNull();
    expect(pickVersion([], null, "1")).toBeNull();
  });
});

describe("evaluateRuleStack (org policy override, §5.3)", () => {
  const SAT = new Date("2026-01-10T12:00:00Z");
  const MON = new Date("2026-01-05T12:00:00Z");
  it("higher-priority avatar rule overrides the org default", () => {
    const resolved = evaluateRuleStack(
      [
        {
          priority: 0,
          rule: { type: "composite", priority: "first_match", rules: [{ when: "is_weekend", avatar: "org_weekend" }] },
        },
        {
          priority: 10,
          rule: { type: "composite", priority: "first_match", rules: [{ when: "is_weekend", avatar: "avatar_special" }] },
        },
      ],
      SAT,
    );
    expect(resolved).toBe("avatar_special");
  });
  it("falls through to lower-priority rules on no match", () => {
    const resolved = evaluateRuleStack(
      [
        {
          priority: 10,
          rule: { type: "composite", priority: "first_match", rules: [{ when: "is_weekend", avatar: "avatar_special" }] },
        },
        {
          priority: 0,
          rule: { type: "composite", priority: "first_match", rules: [{ when: "weekday:mon", avatar: "org_monday" }] },
        },
      ],
      MON,
    );
    expect(resolved).toBe("org_monday");
  });
  it("returns null when nothing matches", () => {
    expect(
      evaluateRuleStack(
        [
          {
            priority: 0,
            rule: { type: "composite", priority: "first_match", rules: [{ when: "is_weekend", avatar: "x" }] },
          },
        ],
        MON,
      ),
    ).toBeNull();
  });
});
