import { describe, expect, it } from "vitest";
import type { KvStore } from "./lib/runtime/env";
import {
  checkMonthlyQuota,
  checkRateLimit,
  getClientIp,
  incrMonthlyQuota,
  secondsToMonthEnd,
} from "./lib/security/ratelimit";

function memKv(): KvStore & { size(): number } {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    put: async (k, v) => {
      m.set(k, v);
    },
    delete: async (k) => {
      m.delete(k);
    },
    size: () => m.size,
  };
}

describe("rate limiting (KV fixed window)", () => {
  it("is allow-open without KV (local dev)", async () => {
    const r = await checkRateLimit(undefined, "ip", "1.2.3.4", 1);
    expect(r.allowed).toBe(true);
  });

  it("blocks after the per-minute limit and rolls over", async () => {
    const kv = memKv();
    const t = Date.UTC(2026, 0, 5, 12, 0, 0);
    expect((await checkRateLimit(kv, "key", "k1", 2, t)).allowed).toBe(true);
    const second = await checkRateLimit(kv, "key", "k1", 2, t + 1000);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    const third = await checkRateLimit(kv, "key", "k1", 2, t + 2000);
    expect(third.allowed).toBe(false);
    // next minute bucket → allowed again
    expect((await checkRateLimit(kv, "key", "k1", 2, t + 61_000)).allowed).toBe(true);
  });

  it("isolates keys from each other", async () => {
    const kv = memKv();
    const t = Date.UTC(2026, 0, 5, 12, 0, 0);
    await checkRateLimit(kv, "key", "a", 1, t);
    expect((await checkRateLimit(kv, "key", "b", 1, t)).allowed).toBe(true);
    expect((await checkRateLimit(kv, "key", "a", 1, t)).allowed).toBe(false);
  });
});

describe("monthly quota counters", () => {
  it("gates before Turso and increments after serve", async () => {
    const kv = memKv();
    expect((await checkMonthlyQuota(kv, "k1", 2, "2026-01")).allowed).toBe(true);
    await incrMonthlyQuota(kv, "k1", "2026-01");
    await incrMonthlyQuota(kv, "k1", "2026-01");
    const gate = await checkMonthlyQuota(kv, "k1", 2, "2026-01");
    expect(gate.allowed).toBe(false);
    expect(gate.remaining).toBe(0);
  });

  it("treats null quota as unlimited and scopes by month", async () => {
    const kv = memKv();
    expect((await checkMonthlyQuota(kv, "k1", null, "2026-01")).allowed).toBe(true);
    await incrMonthlyQuota(kv, "k1", "2026-01");
    expect((await checkMonthlyQuota(kv, "k1", 5, "2026-02")).allowed).toBe(true);
  });

  it("computes seconds to month end sanely", () => {
    const s = secondsToMonthEnd(Date.UTC(2026, 0, 15) / 1000);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(31 * 86_400);
  });
});

describe("getClientIp", () => {
  it("prefers CF-Connecting-IP, then XFF, then unknown", () => {
    expect(getClientIp(new Request("https://x/", { headers: { "CF-Connecting-IP": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(
      getClientIp(new Request("https://x/", { headers: { "X-Forwarded-For": "1.1.1.1, 2.2.2.2" } })),
    ).toBe("1.1.1.1");
    expect(getClientIp(new Request("https://x/"))).toBe("unknown");
  });
});
