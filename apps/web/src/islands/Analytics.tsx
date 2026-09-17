import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { badgeClass, cardClass, cn, tdClass, thClass, tableClass } from "../components/ui";
import { Dashboard, Err, KeyBar, useNb } from "./shared";

interface Summary {
  total_requests: number;
  cache_hit_ratio: number;
  avg_response_ms: number;
  max_response_ms: number;
  p50_response_ms: number;
  p95_response_ms: number;
  p99_response_ms: number;
}

export function Analytics() {
  return (
    <Dashboard>
      <KeyBar />
      <Inner />
    </Dashboard>
  );
}

function Inner() {
  const { client } = useNb();
  const [days, setDays] = useState(30);
  const summary = useQuery({
    queryKey: ["analytics", "summary", days],
    queryFn: () => client!.get<Summary>(`/api/analytics?metric=summary&days=${days}`),
    enabled: !!client,
  });
  const requests = useQuery({
    queryKey: ["analytics", "requests", days],
    queryFn: () => client!.get<{ buckets: Array<{ day: string; n: number }> }>(`/api/analytics?metric=requests&days=${days}`),
    enabled: !!client,
  });
  const top = useQuery({
    queryKey: ["analytics", "top", days],
    queryFn: () => client!.get<{ top: Array<{ avatar_id: string; n: number }> }>(`/api/analytics?metric=top-avatars&days=${days}`),
    enabled: !!client,
  });
  const geo = useQuery({
    queryKey: ["analytics", "geo", days],
    queryFn: () => client!.get<{ geo: Array<{ region: string | null; n: number }> }>(`/api/analytics?metric=geo&days=${days}`),
    enabled: !!client,
  });

  const buckets = requests.data?.buckets ?? [];
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const s = summary.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <select
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {[7, 30, 90].map((d) => (
            <option key={d} value={d}>last {d} days</option>
          ))}
        </select>
      </div>
      {(summary.error || requests.error) && <Err error={(summary.error ?? requests.error) as Error} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Requests" value={s ? String(s.total_requests) : "…"} />
        <Stat label="Cache hit" value={s ? `${(s.cache_hit_ratio * 100).toFixed(1)}%` : "…"} />
        <Stat label="Avg / p95" value={s ? `${s.avg_response_ms.toFixed(0)} / ${s.p95_response_ms.toFixed(0)} ms` : "…"} />
        <Stat label="Max" value={s ? `${s.max_response_ms.toFixed(0)} ms` : "…"} />
      </div>
      <div className={cardClass()}>
        <h2 className="mb-2 text-sm font-medium text-zinc-400">Requests per day</h2>
        <div className="flex h-28 items-end gap-1">
          {buckets.map((b) => (
            <div key={b.day} className="flex-1 rounded-t bg-zinc-200/80" style={{ height: `${Math.max(3, (b.n / max) * 100)}%` }} title={`${b.day}: ${b.n}`} />
          ))}
          {buckets.length === 0 && <p className="text-sm text-zinc-500">No data yet.</p>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={cardClass()}>
          <h2 className="mb-2 text-sm font-medium text-zinc-400">Top avatars</h2>
          <table className={tableClass()}>
            <tbody>
              {(top.data?.top ?? []).map((t) => (
                <tr key={t.avatar_id}>
                  <td className={tdClass()}>
                    <img src={`/api/avatar/${t.avatar_id}`} alt="" className="h-8 w-8 rounded" loading="lazy" />
                  </td>
                  <td className={cn(tdClass(), "font-mono text-xs")}>{t.avatar_id}</td>
                  <td className={cn(tdClass(), "text-right")}>{t.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={cardClass()}>
          <h2 className="mb-2 text-sm font-medium text-zinc-400">By region</h2>
          <table className={tableClass()}>
            <thead>
              <tr>
                <th className={thClass()}>region</th>
                <th className={cn(thClass(), "text-right")}>requests</th>
              </tr>
            </thead>
            <tbody>
              {(geo.data?.geo ?? []).map((g) => (
                <tr key={g.region ?? "unknown"}>
                  <td className={tdClass()}>
                    <span className={badgeClass()}>{g.region ?? "unknown"}</span>
                  </td>
                  <td className={cn(tdClass(), "text-right")}>{g.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={cardClass()}>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
