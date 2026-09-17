import type { APIRoute } from "astro";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { authedRoute } from "../../../lib/api/authed";
import {
  bucketsByDay,
  groupByRegion,
  loadSlices,
  sumSlices,
  topByAvatar,
} from "../../../lib/analytics/rollup";
import { avatars, usageLogs } from "../../../lib/db/schema";
import type { Database } from "../../../lib/db/client";

/**
 * GET /api/analytics?metric=summary|requests|top-avatars|top-collections|geo|errors
 * Totals come from usage_daily/hourly rollups + the live raw tail (§10) —
 * raw usage_logs is never scanned wholesale. Percentiles are exact over a
 * trailing 24h raw window (bounded); longer ranges report avg/max.
 * Org-owned keys are auto-scoped to their org's avatars.
 */
export const GET: APIRoute = authedRoute("read", async ({ db, auth, account }, _req, { url }) => {
  const metric = url.searchParams.get("metric") ?? "summary";
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 30) || 30));
  const nowSec = Math.floor(Date.now() / 1000);
  const since = nowSec - days * 86_400;

  let avatarScope: string[] | null = null;
  if (auth.ownerType === "organization") {
    avatarScope = await orgAvatarIds(db, auth.ownerId);
  }
  const slices = await loadSlices(db, since, nowSec, avatarScope);

  switch (metric) {
    case "requests": {
      account();
      return Response.json({ metric, days, buckets: bucketsByDay(slices) });
    }
    case "top-avatars": {
      account();
      return Response.json({ metric, top: topByAvatar(slices, 10) });
    }
    case "top-collections": {
      const top = topByAvatar(slices, 100);
      const ids = top.map((t) => t.avatar_id);
      const owners =
        ids.length > 0
          ? await db
              .select({ id: avatars.id, collectionId: avatars.collectionId })
              .from(avatars)
              .where(inArray(avatars.id, ids))
          : [];
      const collOf = new Map(owners.map((o) => [o.id, o.collectionId ?? "(none)"]));
      const agg = new Map<string, number>();
      for (const t of top) {
        const c = collOf.get(t.avatar_id) ?? "(none)";
        agg.set(c, (agg.get(c) ?? 0) + t.n);
      }
      account();
      return Response.json({
        metric,
        top: [...agg.entries()]
          .map(([collection_id, n]) => ({ collection_id, n }))
          .sort((a, b) => b.n - a.n)
          .slice(0, 10),
      });
    }
    case "geo": {
      account();
      return Response.json({ metric, geo: groupByRegion(slices) });
    }
    case "errors": {
      const totals = sumSlices(slices);
      const statusCond =
        avatarScope === null
          ? and(gte(usageLogs.createdAt, since), gte(usageLogs.statusCode, 400))
          : and(
              gte(usageLogs.createdAt, since),
              gte(usageLogs.statusCode, 400),
              avatarScope.length > 0
                ? inArray(usageLogs.avatarId, avatarScope)
                : eq(usageLogs.avatarId, "__none__"),
            );
      const byStatus = await db
        .select({ statusCode: usageLogs.statusCode, n: count() })
        .from(usageLogs)
        .where(statusCond)
        .groupBy(usageLogs.statusCode);
      account();
      return Response.json({
        metric,
        total: totals.requests,
        errors: totals.errors,
        error_rate: totals.requests ? totals.errors / totals.requests : 0,
        by_status: byStatus,
      });
    }
    default: {
      const totals = sumSlices(slices);
      // Exact percentiles over the trailing 24h raw window (bounded scan).
      const pctWindow = Math.max(since, nowSec - 86_400);
      const pctScope =
        avatarScope === null
          ? gte(usageLogs.createdAt, pctWindow)
          : and(
              gte(usageLogs.createdAt, pctWindow),
              avatarScope.length > 0
                ? inArray(usageLogs.avatarId, avatarScope)
                : eq(usageLogs.avatarId, "__none__"),
            );
      const windowTotal = await db
        .select({ n: count() })
        .from(usageLogs)
        .where(pctScope);
      const w = windowTotal[0]?.n ?? 0;
      const pct = async (q: number) => {
        if (w === 0) return 0;
        const rows = await db
          .select({ ms: usageLogs.responseMs })
          .from(usageLogs)
          .where(pctScope)
          .orderBy(usageLogs.responseMs)
          .limit(1)
          .offset(Math.min(w - 1, Math.floor(w * q)));
        return rows[0]?.ms ?? 0;
      };
      const [p50, p95, p99] = await Promise.all([pct(0.5), pct(0.95), pct(0.99)]);
      account();
      return Response.json({
        metric: "summary",
        days,
        total_requests: totals.requests,
        cache_hit_ratio: totals.requests ? totals.cacheHits / totals.requests : 0,
        avg_response_ms: totals.requests ? totals.sumMs / totals.requests : 0,
        max_response_ms: totals.maxMs,
        p50_response_ms: p50,
        p95_response_ms: p95,
        p99_response_ms: p99,
        percentiles_window: "trailing_24h",
      });
    }
  }
});

async function orgAvatarIds(db: Database, orgId: string): Promise<string[]> {
  const rows = await db.select({ id: avatars.id }).from(avatars).where(eq(avatars.orgId, orgId));
  return rows.map((r) => r.id);
}
