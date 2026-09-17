import { describe, expect, it } from "vitest";
import {
  bucketsByDay,
  floorDay,
  floorHour,
  groupByRegion,
  loadSlices,
  runRollups,
  sumSlices,
  topByAvatar,
} from "./lib/analytics/rollup";
import { rollupState, usageDaily, usageHourly, usageLogs } from "./lib/db/schema";
import { createTestDb } from "./lib/test/db";

// Fixed clock: Mon 2026-06-15 12:30 UTC.
const NOW = Math.floor(Date.UTC(2026, 5, 15, 12, 30) / 1000);
const H = 3600;

async function seedUsage(db: Awaited<ReturnType<typeof createTestDb>>) {
  // 3 requests yesterday (2 hits, 1 error), 2 requests this hour (raw tail).
  const rows = [
    { id: "u1", avatarId: "av_a", region: "US", cacheHit: 1, ms: 10, status: 200, at: NOW - 20 * H },
    { id: "u2", avatarId: "av_a", region: "US", cacheHit: 0, ms: 20, status: 200, at: NOW - 19 * H },
    { id: "u3", avatarId: "av_b", region: "EU", cacheHit: 1, ms: 30, status: 500, at: NOW - 18 * H },
    { id: "u4", avatarId: "av_a", region: "US", cacheHit: 1, ms: 12, status: 200, at: NOW - 300 },
    { id: "u5", avatarId: "av_b", region: "EU", cacheHit: 0, ms: 40, status: 200, at: NOW - 200 },
  ];
  for (const r of rows) {
    await db.insert(usageLogs).values({
      id: r.id,
      apiKeyId: null,
      avatarId: r.avatarId,
      region: r.region,
      cacheHit: r.cacheHit,
      responseMs: r.ms,
      statusCode: r.status,
      createdAt: r.at,
    });
  }
}

describe("rollup aggregator (in-memory LibSQL)", () => {
  it("aggregates complete buckets and advances cursors", async () => {
    const db = await createTestDb();
    await seedUsage(db);
    const res = await runRollups(db, NOW);
    expect(res.hourly).toBeGreaterThan(0);
    expect(res.daily).toBeGreaterThan(0);

    const hours = await db.select().from(usageHourly);
    const hSum = hours.reduce((a, r) => a + r.requests, 0);
    expect(hSum).toBe(3); // only complete hours; the 2 live-hour rows stay raw
    const days = await db.select().from(usageDaily);
    expect(days.reduce((a, r) => a + r.requests, 0)).toBe(3);

    const cursors = await db.select().from(rollupState);
    expect(cursors.find((c) => c.grain === "hourly")?.lastBucket).toBe(floorHour(NOW) - H);
  });

  it("is idempotent and resumes from the cursor (with overlap)", async () => {
    const db = await createTestDb();
    await seedUsage(db);
    await runRollups(db, NOW);
    // Re-run only redoes the 2-bucket overlap — totals must not change.
    const second = await runRollups(db, NOW);
    expect(second.hourly).toBe(2);
    const hours = await db.select().from(usageHourly);
    expect(hours.reduce((a, r) => a + r.requests, 0)).toBe(3);

    // Late row lands in an already-rolled bucket → overlap picks it up.
    await db.insert(usageLogs).values({
      id: "u6", apiKeyId: null, avatarId: "av_a", region: "US",
      cacheHit: 1, responseMs: 5, statusCode: 200, createdAt: NOW - 2 * H,
    });
    const third = await runRollups(db, NOW);
    expect(third.hourly).toBe(2); // 10:00 (with u6) + 11:00 re-rolled
    const after = await db.select().from(usageHourly);
    expect(after.reduce((a, r) => a + r.requests, 0)).toBe(4);
  });

  it("merges daily + hourly + raw without double-counting", async () => {
    const db = await createTestDb();
    await seedUsage(db);
    await runRollups(db, NOW);
    const slices = await loadSlices(db, NOW - 3 * 24 * H, NOW, null);
    const totals = sumSlices(slices);
    expect(totals.requests).toBe(5);
    expect(totals.errors).toBe(1);
    expect(totals.cacheHits).toBe(3);
    expect(topByAvatar(slices)).toEqual([
      { avatar_id: "av_a", n: 3 },
      { avatar_id: "av_b", n: 2 },
    ]);
    expect(groupByRegion(slices)).toEqual([
      { region: "US", n: 3 },
      { region: "EU", n: 2 },
    ]);
    expect(bucketsByDay(slices).reduce((a, b) => a + b.n, 0)).toBe(5);
  });

  it("scopes slices to avatar ids", async () => {
    const db = await createTestDb();
    await seedUsage(db);
    await runRollups(db, NOW);
    const slices = await loadSlices(db, NOW - 3 * 24 * H, NOW, ["av_a"]);
    expect(sumSlices(slices).requests).toBe(3);
    const none = await loadSlices(db, NOW - 3 * 24 * H, NOW, []);
    expect(sumSlices(none).requests).toBe(0);
  });

  it("floors buckets in UTC", () => {
    expect(floorHour(NOW)).toBe(Math.floor(Date.UTC(2026, 5, 15, 12) / 1000));
    expect(floorDay(NOW)).toBe(Math.floor(Date.UTC(2026, 5, 15) / 1000));
  });
});
