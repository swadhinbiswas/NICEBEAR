import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { WebhookEventSchema } from "@nicebear/shared-types";
import { asList } from "../lib/api/client";
import { badgeClass, buttonClass, cardClass, cn, inputClass, tdClass, thClass, tableClass } from "../components/ui";
import { Dashboard, Err, KeyBar, useNb } from "./shared";

interface Hook {
  id: string;
  url: string;
  events: string[];
  created_at: number;
}
interface Delivery {
  id: string;
  event: string;
  status: string;
  attempt: number;
  response_code: number | null;
  delivered_at: number | null;
  created_at: number;
}

// Single source of truth: adding an event to WebhookEventSchema surfaces it here.
const EVENTS: string[] = [...WebhookEventSchema.options];

const CreateSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16),
  events: z.array(z.string()).min(1),
});

export function Webhooks() {
  return (
    <Dashboard>
      <KeyBar />
      <Inner />
    </Dashboard>
  );
}

function Inner() {
  const { client, orgId } = useNb();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["webhooks", orgId],
    queryFn: () => client!.get<unknown>("/api/webhooks"),
    enabled: !!client,
  });
  const create = useMutation({
    mutationFn: (v: z.infer<typeof CreateSchema>) => client!.post("/api/webhooks", v),
    onSuccess: () => {
      form.reset();
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });
  const drain = useMutation({
    mutationFn: () => client!.post<{ processed: number; success: number; retry: number; failed: number }>("/api/webhooks/process", { limit: 25 }),
  });
  const deliveries = useQuery({
    queryKey: ["deliveries", open],
    queryFn: () => client!.get<{ deliveries: Delivery[] }>(`/api/webhooks/${open}/deliveries?limit=25`),
    enabled: !!client && !!open,
  });

  const form = useForm<z.infer<typeof CreateSchema>>({
    resolver: zodResolver(CreateSchema),
    defaultValues: { url: "", secret: "", events: ["avatar.changed"] },
  });
  const hooks = asList<Hook>(list.data, "webhooks");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Webhooks</h1>
        <button className={buttonClass("ghost")} onClick={() => drain.mutate()} disabled={drain.isPending}>
          {drain.isPending ? "Draining…" : "Drain pending"}
        </button>
      </div>
      {drain.data && (
        <p className="text-sm text-zinc-400">
          processed {drain.data.processed}: {drain.data.success} delivered, {drain.data.retry} retrying,{" "}
          {drain.data.failed} failed
        </p>
      )}
      {(list.error || create.error) && <Err error={(list.error ?? create.error) as Error} />}
      <div className={cardClass()}>
        <form className="space-y-2" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <div className="flex flex-wrap gap-2">
            <input className={cn(inputClass(), "flex-1 min-w-52")} placeholder="https://…/hook" {...form.register("url")} />
            <input className={cn(inputClass(), "flex-1 min-w-52")} placeholder="signing secret (16+ chars)" {...form.register("secret")} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {EVENTS.map((e) => (
              <label key={e} className="flex items-center gap-1 text-zinc-300">
                <input
                  type="checkbox"
                  value={e}
                  checked={(form.watch("events") ?? []).includes(e)}
                  onChange={(ev) => {
                    const cur = form.getValues("events") ?? [];
                    form.setValue("events", ev.target.checked ? [...cur, e] : cur.filter((x) => x !== e));
                  }}
                />
                {e}
              </label>
            ))}
          </div>
          <button className={buttonClass()} disabled={create.isPending}>
            Add webhook
          </button>
        </form>
      </div>
      <div className={cardClass()}>
        <table className={tableClass()}>
          <thead>
            <tr>
              <th className={thClass()}>url</th>
              <th className={thClass()}>events</th>
              <th className={thClass()}></th>
            </tr>
          </thead>
          <tbody>
            {hooks.map((h) => (
              <Fragment key={h.id}>
                <tr>
                  <td className={cn(tdClass(), "font-mono text-xs")}>{h.url}</td>
                  <td className={tdClass()}>
                    <span className="text-xs text-zinc-400">{h.events.join(", ")}</span>
                  </td>
                  <td className={cn(tdClass(), "text-right")}>
                    <button className={buttonClass("ghost")} onClick={() => setOpen(open === h.id ? null : h.id)}>
                      Deliveries
                    </button>
                  </td>
                </tr>
                {open === h.id && (
                  <tr>
                    <td colSpan={3} className={tdClass()}>
                      {deliveries.isLoading ? (
                        "Loading…"
                      ) : (
                        <table className={tableClass()}>
                          <tbody>
                            {(deliveries.data?.deliveries ?? []).map((d) => (
                              <tr key={d.id}>
                                <td className={cn(tdClass(), "font-mono text-xs")}>{d.id}</td>
                                <td className={tdClass()}>{d.event}</td>
                                <td className={tdClass()}>
                                  <span
                                    className={badgeClass(
                                      d.status === "success" ? "ok" : d.status === "failed" ? "bad" : "warn",
                                    )}
                                  >
                                    {d.status} · try {d.attempt}
                                  </span>
                                </td>
                                <td className={tdClass()}>{d.response_code ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
