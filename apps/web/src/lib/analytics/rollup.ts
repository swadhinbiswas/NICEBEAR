import { and, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Database } from "../db/client";
import { rollupState, usageDaily, usageHourly, usageLogs } from "../db/schema";

export const HOUR_SEC = 3600;
export const DAY_SEC = 86_400;

export const floorHour = (ts: number): number => Math.floor(ts / HOUR_SEC) * HOUR_SEC;
export const floorDay = (ts: number): number => Math.floor(ts / DAY_SEC) * DAY_SEC;

export interface SliceRow {
  bucket: number;
  avatarId: string | null;
  apiKeyId: string | null;
  region: string | null;
  requests: number;
  errors: number;
  cacheHits: number;
  sumMs: number;
  maxMs: number;
}

/**
 * Aggregate one complete bucket from raw logs into a grain table.
 * Idempotent: existing rows for the bucket are deleted first (NULLs in the
 * composite PK would defeat ON CONFLICT — see migration 0002).
 */
async function aggregateBucket(
  db: Database,
  table: typeof usageHourly | typeof usageDaily,
  grain: number,
  bucket: number,
): Promise<number> {
  const rows = await db
    .select({
      avatarId: usageLogs.avatarId,
      apiKeyId: usageLogs.apiKeyId,
      region: usageLogs.region,
      requests: sql<number>`count(*)`,
      errors: sql<number>`sum(case when ${usageLogs.statusCode} >= 400 then 1 else 0 end)`,
      cacheHits: sql<number>`sum(case when ${usageLogs.cacheHit} = 1 then 1 else 0 end)`,
      sumMs: sql<number>`coalesce(sum(${usageLogs.responseMs}), 0)`,
      maxMs: sql<number>`coalesce(max(${usageLogs.responseMs}), 0)`,
    })
    .from(usageLogs)
    .where(and(gte(usageLogs.createdAt, bucket), lt(usageLogs.createdAt, bucket + grain)))
    .groupBy(usageLogs.avatarId, usageLogs.apiKeyId, usageLogs.region);

  await db.delete(table).where(eq((table as typeof usageHourly).bucket, bucket));
  if (rows.length > 0) {
    const t = table as typeof usageHourly;
    await db.insert(t).values(
      rows.map((r) => ({
        bucket,
        avatarId: r.avatarId,
        apiKeyId: r.apiKeyId,
        region: r.region,
        requests: r.requests,
        errors: r.errors,
        cacheHits: r.cacheHits,
        sumMs: r.sumMs,
        maxMs: r.maxMs,
      })),
    );
  }
  return rows.length;
}

async function grainCursor(db: Database, grain: string): Promise<number> {
  const rows = await db.select().from(rollupState).where(eq(rollupState.grain, grain)).limit(1);
  return rows[0]?.lastBucket ?? 0;
}

/** Aggregate every complete bucket since the cursor. Returns buckets processed. */
export async function runGrain(
  db: Database,
  grain: "hourly" | "daily",
  nowSec = Math.floor(Date.now() / 1000),
): Promise<number> {
  const size = grain === "hourly" ? HOUR_SEC : DAY_SEC;
  const table = grain === "hourly" ? usageHourly : usageDaily;
  const lastComplete = (grain === "hourly" ? floorHour(nowSec) : floorDay(nowSec)) - size;
  const cursor = await grainCursor(db, grain);
  // Fresh state (seeded 0): backfill at most 7 days. Otherwise resume after
  // the last aggregated bucket — minus a 2-bucket overlap so late-arriving
  // rows (delayed usage-log writes) in recent buckets are picked up.
  // Re-aggregation is safe: buckets are delete-then-inserted (idempotent).
  const floor = grain === "hourly" ? floorHour(nowSec) : floorDay(nowSec);
  const rawStart = cursor === 0 ? floor - 7 * DAY_SEC : cursor + size;
  const start = Math.max(rawStart - 2 * size, floor - 7 * DAY_SEC);
  let done = 0;
  for (let b = start; b <= lastComplete && done < 24 * 8; b += size) {
    await aggregateBucket(db, table, size, b);
    await db
      .insert(rollupState)
      .values({ grain, lastBucket: b })
      .onConflictDoUpdate({ target: rollupState.grain, set: { lastBucket: b } });
    done++;
  }
  return done;
}

export async function runRollups(
  db: Database,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<{ hourly: number; daily: number }> {
  const hourly = await runGrain(db, "hourly", nowSec);
  const daily = await runGrain(db, "daily", nowSec);
  return { hourly, daily };
}

// ---------------------------------------------------------- merged reads

/**
 * Partitioned read, no double-counting: daily grain for whole days before
 * today, hourly grain for today's complete hours, raw logs for the live hour.
 */
export async function loadSlices(
  db: Database,
  sinceSec: number,
  nowSec: number,
  avatarIds: string[] | null,
): Promise<SliceRow[]> {
  const out: SliceRow[] = [];
  const scopeIn = (col: SQLiteColumn): SQL | undefined =>
    avatarIds === null
      ? undefined
      : avatarIds.length > 0
        ? inArray(col, avatarIds)
        : eq(col, "__none__");
  const today = floorDay(nowSec);
  const thisHour = floorHour(nowSec);

  if (sinceSec < today) {
    const conds: SQL[] = [gte(usageDaily.bucket, floorDay(sinceSec)), lt(usageDaily.bucket, today)];
    const s = scopeIn(usageDaily.avatarId);
    if (s) conds.push(s);
    out.push(...(await db.select().from(usageDaily).where(and(...conds))));
  }
  if (Math.max(sinceSec, today) < thisHour) {
    const conds: SQL[] = [
      gte(usageHourly.bucket, Math.max(sinceSec, today)),
      lt(usageHourly.bucket, thisHour),
    ];
    const s = scopeIn(usageHourly.avatarId);
    if (s) conds.push(s);
    out.push(...(await db.select().from(usageHourly).where(and(...conds))));
  }
  const rawFrom = Math.max(sinceSec, thisHour);
  if (rawFrom <= nowSec) {
    const conds: SQL[] = [gte(usageLogs.createdAt, rawFrom)];
    const s = avatarIds !== null
      ? avatarIds.length > 0
        ? inArray(usageLogs.avatarId, avatarIds)
        : eq(usageLogs.avatarId, "__none__")
      : undefined;
    if (s) conds.push(s);
    const raw = await db
      .select({
        bucket: sql<number>`(cast(${usageLogs.createdAt} / 3600 as integer) * 3600)`,
        avatarId: usageLogs.avatarId,
        apiKeyId: usageLogs.apiKeyId,
        region: usageLogs.region,
        requests: sql<number>`count(*)`,
        errors: sql<number>`sum(case when ${usageLogs.statusCode} >= 400 then 1 else 0 end)`,
        cacheHits: sql<number>`sum(case when ${usageLogs.cacheHit} = 1 then 1 else 0 end)`,
        sumMs: sql<number>`coalesce(sum(${usageLogs.responseMs}), 0)`,
        maxMs: sql<number>`coalesce(max(${usageLogs.responseMs}), 0)`,
      })
      .from(usageLogs)
      .where(and(...conds))
      .groupBy(
        sql`(cast(${usageLogs.createdAt} / 3600 as integer) * 3600)`,
        usageLogs.avatarId,
        usageLogs.apiKeyId,
        usageLogs.region,
      );
    out.push(...raw);
  }
  return out;
}

export interface UsageTotals {
  requests: number;
  errors: number;
  cacheHits: number;
  sumMs: number;
  maxMs: number;
}

export function sumSlices(rows: SliceRow[]): UsageTotals {
  return rows.reduce<UsageTotals>(
    (a, r) => ({
      requests: a.requests + r.requests,
      errors: a.errors + r.errors,
      cacheHits: a.cacheHits + r.cacheHits,
      sumMs: a.sumMs + r.sumMs,
      maxMs: Math.max(a.maxMs, r.maxMs),
    }),
    { requests: 0, errors: 0, cacheHits: 0, sumMs: 0, maxMs: 0 },
  );
}

export function topByAvatar(rows: SliceRow[], limit = 10): Array<{ avatar_id: string; n: number }> {
  const agg = new Map<string, number>();
  for (const r of rows) {
    if (!r.avatarId) continue;
    agg.set(r.avatarId, (agg.get(r.avatarId) ?? 0) + r.requests);
  }
  return [...agg.entries()]
    .map(([avatar_id, n]) => ({ avatar_id, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}

export function groupByRegion(rows: SliceRow[], limit = 50): Array<{ region: string | null; n: number }> {
  const agg = new Map<string | null, number>();
  for (const r of rows) agg.set(r.region, (agg.get(r.region) ?? 0) + r.requests);
  return [...agg.entries()]
    .map(([region, n]) => ({ region, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}

export function bucketsByDay(rows: SliceRow[]): Array<{ day: string; n: number }> {
  const agg = new Map<string, number>();
  for (const r of rows) {
    const day = new Date(floorDay(r.bucket) * 1000).toISOString().slice(0, 10);
    agg.set(day, (agg.get(day) ?? 0) + r.requests);
  }
  return [...agg.entries()].map(([day, n]) => ({ day, n })).sort((a, b) => (a.day < b.day ? -1 : 1));
}
