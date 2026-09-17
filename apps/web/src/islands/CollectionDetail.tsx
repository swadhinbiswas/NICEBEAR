import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { badgeClass, buttonClass, cardClass, cn, inputClass } from "../components/ui";
import { Dashboard, Err, KeyBar, useNb } from "./shared";

interface RuleItem {
  when: string;
  avatar?: string;
  avatar_from?: string;
  tz?: string;
  seed_by?: string;
}
interface StoredRule {
  id: string;
  target_id: string;
  target_type: string;
  rule: { type: "composite"; priority: "first_match"; rules: RuleItem[] };
  priority: number;
}

const TEMPLATES: Array<{ label: string; item: RuleItem }> = [
  { label: "Daily rotation", item: { when: "every:1d", avatar_from: "collection:__self__" } },
  { label: "Weekly rotation", item: { when: "every:1w", avatar_from: "collection:__self__" } },
  { label: "Weekend special", item: { when: "is_weekend", avatar: "avatar_weekend" } },
  { label: "US holiday", item: { when: "is_holiday:US", avatar: "avatar_holiday" } },
  { label: "Random", item: { when: "random", avatar_from: "collection:__self__", seed_by: "request" } },
];

/**
 * Rotation rules for any target (avatar | collection | organization).
 * `collection:__self__` is rewritten to the target's own collection by the API.
 */
export function RulesPanel({ targetType, targetId }: { targetType: string; targetId: string }) {
  const { client } = useNb();
  const qc = useQueryClient();
  const key = ["rules", targetType, targetId];
  const list = useQuery({
    queryKey: key,
    queryFn: () =>
      client!.get<{ rules: StoredRule[] }>(
        `/api/rotation-rules?target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(targetId)}`,
      ),
    enabled: !!client,
  });
  const [template, setTemplate] = useState(0);
  const [customWhen, setCustomWhen] = useState("");
  const [customAvatar, setCustomAvatar] = useState("");
  const create = useMutation({
    mutationFn: (item: RuleItem) =>
      client!.post("/api/rotation-rules", {
        target_id: targetId,
        target_type: targetType,
        priority: 0,
        rule: { type: "composite", priority: "first_match", rules: [item] },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Rotation rules</h2>
      {list.error && <Err error={list.error as Error} />}
      {(list.data?.rules ?? []).map((r) => (
        <div key={r.id} className={cn(cardClass(), "text-sm")}>
          <div className="flex items-center gap-2">
            <span className={badgeClass()}>priority {r.priority}</span>
            <span className="font-mono text-xs text-zinc-500">{r.id}</span>
          </div>
          <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-300">
            {r.rule.rules.map((item, i) => (
              <li key={i}>
                when <span className="text-emerald-300">{item.when}</span> →{" "}
                {item.avatar ?? item.avatar_from}
                {item.tz ? ` (${item.tz})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className={cardClass()}>
        <div className="flex flex-wrap gap-2">
          <select className={inputClass()} value={template} onChange={(e) => setTemplate(Number(e.target.value))}>
            {TEMPLATES.map((t, i) => (
              <option key={t.label} value={i}>{t.label}</option>
            ))}
            <option value={TEMPLATES.length}>Custom…</option>
          </select>
          {template === TEMPLATES.length && (
            <>
              <input
                className={cn(inputClass(), "min-w-52 flex-1")}
                placeholder="when — e.g. weekday:mon, every:3d, cron:0 9 * * *"
                value={customWhen}
                onChange={(e) => setCustomWhen(e.target.value)}
              />
              <input
                className={cn(inputClass(), "min-w-40 flex-1")}
                placeholder="avatar id (or collection:id for avatar_from)"
                value={customAvatar}
                onChange={(e) => setCustomAvatar(e.target.value)}
              />
            </>
          )}
          <button
            className={buttonClass()}
            disabled={create.isPending}
            onClick={() => {
              if (template < TEMPLATES.length) {
                const item = { ...TEMPLATES[template].item };
                if (item.avatar_from === "collection:__self__" && targetType === "collection") {
                  item.avatar_from = `collection:${targetId}`;
                }
                create.mutate(item);
              } else if (customWhen && customAvatar) {
                create.mutate(
                  customAvatar.startsWith("collection:")
                    ? { when: customWhen, avatar_from: customAvatar }
                    : { when: customWhen, avatar: customAvatar },
                );
              }
            }}
          >
            Add rule
          </button>
        </div>
        {create.error && <div className="mt-2"><Err error={create.error as Error} /></div>}
      </div>
    </div>
  );
}

export function CollectionDetail({ id }: { id: string }) {
  return (
    <Dashboard>
      <KeyBar />
      <Inner id={id} />
    </Dashboard>
  );
}

function Inner({ id }: { id: string }) {
  const { client } = useNb();
  const qc = useQueryClient();
  const [attachId, setAttachId] = useState("");
  const detail = useQuery({
    queryKey: ["collection", id],
    queryFn: () => client!.get<{ id: string; name: string; engine_type: string; avatars: string[] }>(`/api/collections/${id}`),
    enabled: !!client,
  });
  const attach = useMutation({
    mutationFn: () => client!.post(`/api/collections/${id}/avatars`, { avatar_id: attachId }),
    onSuccess: () => {
      setAttachId("");
      qc.invalidateQueries({ queryKey: ["collection", id] });
    },
  });
  const avatars = detail.data?.avatars ?? [];

  return (
    <div className="space-y-4">
      <a href="/dashboard" className="text-sm text-zinc-400 underline">← dashboard</a>
      {detail.error && <Err error={detail.error as Error} />}
      {detail.data && (
        <>
          <h1 className="text-xl font-semibold">{detail.data.name}</h1>
          <p className="font-mono text-xs text-zinc-500">{detail.data.id} · {detail.data.engine_type}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {avatars.map((a) => (
              <div key={a} className={cardClass()} title={a}>
                <img src={`/api/avatar/${a}`} alt={a} className="h-20 w-20 rounded-md" loading="lazy" />
                <div className="mt-1 truncate font-mono text-[10px] text-zinc-500">{a}</div>
              </div>
            ))}
            {avatars.length === 0 && <p className="text-sm text-zinc-400">No avatars yet — attach one below.</p>}
          </div>
          <div className={cardClass()}>
            <div className="flex gap-2">
              <input
                className={inputClass()}
                placeholder="avatar id to attach"
                value={attachId}
                onChange={(e) => setAttachId(e.target.value.trim())}
              />
              <button className={buttonClass()} disabled={!attachId || attach.isPending} onClick={() => attach.mutate()}>
                Attach
              </button>
            </div>
            {attach.error && <div className="mt-2"><Err error={attach.error as Error} /></div>}
          </div>
          <RulesPanel targetType="collection" targetId={id} />
        </>
      )}
    </div>
  );
}
