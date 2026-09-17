import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError, asList } from "../lib/api/client";
import { badgeClass, buttonClass, cardClass, cn, inputClass, tdClass, thClass, tableClass } from "../components/ui";
import { Dashboard, Err, KeyBar, useNb } from "./shared";

interface KeyRow {
  id: string;
  scope: string;
  rate_limit_per_min: number;
  monthly_quota: number | null;
  expires_at: number | null;
  last_used_at: number | null;
  created_at: number;
  revoked_at: number | null;
}

const CreateSchema = z.object({
  scope: z.enum(["read", "admin"]),
  rate_limit_per_min: z.coerce.number().int().min(1).max(10_000).default(60),
});
type CreateInput = z.infer<typeof CreateSchema>;

export function ApiKeys() {
  return (
    <Dashboard>
      <KeyBar />
      <Inner />
    </Dashboard>
  );
}

function Inner() {
  const { client } = useNb();
  const qc = useQueryClient();
  const [freshKey, setFreshKey] = useState<{ id: string; key: string } | null>(null);
  const list = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => client!.get<unknown>("/api/api-keys"),
    enabled: !!client,
  });
  const create = useMutation({
    mutationFn: (v: CreateInput) => client!.post<{ id: string; key: string }>("/api/api-keys", v),
    onSuccess: (d) => {
      setFreshKey(d);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
  const mutate = useMutation({
    mutationFn: (v: { id: string; op: "rotate" | "revoke" }) =>
      v.op === "rotate"
        ? client!.post<{ id: string; key: string }>(`/api/api-keys/${v.id}/rotate`)
        : client!.del<{ id: string }>(`/api/api-keys/${v.id}`),
    onSuccess: (d, v) => {
      if (v.op === "rotate") setFreshKey(d as { id: string; key: string });
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const form = useForm<CreateInput>({ resolver: zodResolver(CreateSchema), defaultValues: { scope: "read", rate_limit_per_min: 60 } });
  const keys = asList<KeyRow>(list.data, "api_keys");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">API keys</h1>
      {freshKey && (
        <div className="rounded-md border border-amber-800 bg-amber-950 px-3 py-2 text-sm text-amber-200">
          New key for <code>{freshKey.id}</code> (shown once):{" "}
          <code className="break-all">{freshKey.key}</code>
        </div>
      )}
      {(list.error || create.error || mutate.error) && <Err error={(list.error ?? create.error ?? mutate.error) as ApiError} />}
      <div className={cardClass()}>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
        >
          <label className="text-sm">
            <span className="mb-1 block text-zinc-400">Scope</span>
            <select className={inputClass()} {...form.register("scope")}>
              <option value="read">read</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-zinc-400">Per-minute limit</span>
            <input className={inputClass()} type="number" {...form.register("rate_limit_per_min")} />
          </label>
          <button className={buttonClass()} disabled={create.isPending}>
            {create.isPending ? "Minting…" : "Mint key"}
          </button>
        </form>
      </div>
      <div className={cardClass()}>
        {list.isLoading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : (
          <table className={tableClass()}>
            <thead>
              <tr>
                <th className={thClass()}>id</th>
                <th className={thClass()}>scope</th>
                <th className={thClass()}>limit/min</th>
                <th className={thClass()}>quota</th>
                <th className={thClass()}>last used</th>
                <th className={thClass()}></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className={cn(tdClass(), "font-mono text-xs")}>{k.id}</td>
                  <td className={tdClass()}>
                    <span className={badgeClass(k.scope === "admin" ? "warn" : "mute")}>{k.scope}</span>
                  </td>
                  <td className={tdClass()}>{k.rate_limit_per_min}</td>
                  <td className={tdClass()}>{k.monthly_quota ?? "∞"}</td>
                  <td className={tdClass()}>{k.last_used_at ? new Date(k.last_used_at * 1000).toLocaleString() : "never"}</td>
                  <td className={cn(tdClass(), "space-x-2 text-right")}>
                    <button className={buttonClass("ghost")} onClick={() => mutate.mutate({ id: k.id, op: "rotate" })}>
                      Rotate
                    </button>
                    <button className={buttonClass("danger")} onClick={() => mutate.mutate({ id: k.id, op: "revoke" })}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
