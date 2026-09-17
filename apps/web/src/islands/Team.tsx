import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { asList } from "../lib/api/client";
import { badgeClass, buttonClass, cardClass, cn, inputClass, tdClass, thClass, tableClass } from "../components/ui";
import { Dashboard, Err, KeyBar, useNb } from "./shared";

interface Member {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: number;
}

const ROLES = ["owner", "admin", "developer", "viewer"] as const;

const AddSchema = z.object({ email: z.string().email(), role: z.enum(["admin", "developer", "viewer"]) });

export function Team() {
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
  // orgId resolves stored → first membership (see shared useNb).
  const effectiveOrg = orgId;
  const list = useQuery({
    queryKey: ["team", effectiveOrg],
    queryFn: () => client!.get<{ members: Member[] }>(`/api/team?org_id=${encodeURIComponent(effectiveOrg!)}`),
    enabled: !!client && !!effectiveOrg,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["team", effectiveOrg] });
  const add = useMutation({
    mutationFn: (v: z.infer<typeof AddSchema>) => client!.post("/api/team", { org_id: effectiveOrg, ...v }),
    onSuccess: () => {
      addForm.reset();
      refresh();
    },
  });
  const changeRole = useMutation({
    mutationFn: (v: { user_id: string; role: string }) =>
      client!.put("/api/team", { org_id: effectiveOrg, ...v }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (user_id: string) =>
      client!.del(`/api/team?org_id=${encodeURIComponent(effectiveOrg!)}&user_id=${encodeURIComponent(user_id)}`),
    onSuccess: refresh,
  });

  const addForm = useForm<z.infer<typeof AddSchema>>({
    resolver: zodResolver(AddSchema),
    defaultValues: { email: "", role: "viewer" },
  });
  const members = asList<Member>(list.data, "members");
  const err = (list.error ?? add.error ?? changeRole.error ?? remove.error) as Error | null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Team</h1>
      {!effectiveOrg && (
        <div className={cardClass()}>
          <p className="text-sm text-zinc-400">No organization found for this identity yet.</p>
        </div>
      )}
      {err && <Err error={err} />}
      {effectiveOrg && (
        <>
          <div className={cardClass()}>
            <form className="flex flex-wrap items-end gap-2" onSubmit={addForm.handleSubmit((v) => add.mutate(v))}>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-400">Email (must have signed in)</span>
                <input className={inputClass()} placeholder="teammate@org.dev" {...addForm.register("email")} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-zinc-400">Role</span>
                <select className={inputClass()} {...addForm.register("role")}>
                  <option value="admin">admin</option>
                  <option value="developer">developer</option>
                  <option value="viewer">viewer</option>
                </select>
              </label>
              <button className={buttonClass()} disabled={add.isPending}>Add member</button>
            </form>
          </div>
          <div className={cardClass()}>
            <table className={tableClass()}>
              <thead>
                <tr>
                  <th className={thClass()}>email</th>
                  <th className={thClass()}>role</th>
                  <th className={thClass()}></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id}>
                    <td className={tdClass()}>
                      <div>{m.email}</div>
                      <div className="font-mono text-[10px] text-zinc-500">{m.user_id}</div>
                    </td>
                    <td className={tdClass()}>
                      <select
                        className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs"
                        value={m.role}
                        onChange={(e) => changeRole.mutate({ user_id: m.user_id, role: e.target.value })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>{" "}
                      <span className={badgeClass("mute")}>{m.role}</span>
                    </td>
                    <td className={cn(tdClass(), "text-right")}>
                      <button className={buttonClass("danger")} onClick={() => remove.mutate(m.user_id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
