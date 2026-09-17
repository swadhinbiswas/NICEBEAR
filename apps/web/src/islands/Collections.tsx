import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { asList } from "../lib/api/client";
import { buttonClass, cardClass, cn, inputClass, tdClass, thClass, tableClass } from "../components/ui";
import { Dashboard, Err, KeyBar, useNb } from "./shared";

export const ENGINES = [
  "pixel-art", "robots", "cartoon", "anime", "minimal", "business", "fantasy",
  "gaming", "cyberpunk", "geometric", "abstract", "animals", "identicons", "mixed",
];

interface Collection {
  id: string;
  org_id: string;
  name: string;
  engine_type: string;
  avatar_count: number;
  created_at: number;
}

const CreateSchema = z.object({
  name: z.string().min(1).max(128),
  engine_type: z.string().min(1),
});

export function Collections() {
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
  const list = useQuery({
    queryKey: ["collections", orgId],
    queryFn: () => client!.get<unknown>("/api/collections"),
    enabled: !!client,
  });
  const create = useMutation({
    mutationFn: (v: z.infer<typeof CreateSchema>) => client!.post("/api/collections", v),
    onSuccess: () => {
      form.reset();
      qc.invalidateQueries({ queryKey: ["collections"] });
    },
  });
  const form = useForm<z.infer<typeof CreateSchema>>({
    resolver: zodResolver(CreateSchema),
    defaultValues: { name: "", engine_type: "pixel-art" },
  });
  const cols = asList<Collection>(list.data, "collections");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Collections</h1>
      {(list.error || create.error) && <Err error={(list.error ?? create.error) as Error} />}
      <div className={cardClass()}>
        <form className="flex flex-wrap items-end gap-2" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <label className="text-sm">
            <span className="mb-1 block text-zinc-400">Name</span>
            <input className={inputClass()} placeholder="team-avatars" {...form.register("name")} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-zinc-400">Engine</span>
            <select className={inputClass()} {...form.register("engine_type")}>
              {ENGINES.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </label>
          <button className={buttonClass()} disabled={create.isPending}>Create</button>
        </form>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cols.map((c) => (
          <a key={c.id} href={`/dashboard/collections/${c.id}`} className={cn(cardClass(), "hover:border-zinc-600")}>
            <div className="font-medium">{c.name}</div>
            <div className="mt-1 font-mono text-xs text-zinc-500">{c.id}</div>
            <div className="mt-2 text-xs text-zinc-400">
              {c.engine_type} · {c.avatar_count} avatar{c.avatar_count === 1 ? "" : "s"}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
