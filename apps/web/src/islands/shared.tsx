import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import React, { createContext, useContext, useMemo, useState } from "react";
import "../styles/global.css";
import { createClient, type NbClient } from "../lib/api/client";
import { authClient } from "../lib/auth/client";
import { badgeClass, buttonClass, cardClass, cn, inputClass } from "../components/ui";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

interface KeyState {
  key: string | null;
  storedOrg: string | null;
  save: (key: string, orgId: string | null) => void;
  setStoredOrg: (orgId: string | null) => void;
  clear: () => void;
}

const KeyCtx = createContext<KeyState>({
  key: null,
  storedOrg: null,
  save: () => undefined,
  setStoredOrg: () => undefined,
  clear: () => undefined,
});

function loadStored(): { key: string | null; orgId: string | null } {
  try {
    return {
      key: localStorage.getItem("nb_api_key"),
      orgId: localStorage.getItem("nb_org_id"),
    };
  } catch {
    return { key: null, orgId: null };
  }
}

function persist(key: string | null, orgId: string | null): void {
  try {
    if (key) localStorage.setItem("nb_api_key", key);
    else localStorage.removeItem("nb_api_key");
    if (orgId) localStorage.setItem("nb_org_id", orgId);
    else localStorage.removeItem("nb_org_id");
  } catch {
    /* private mode */
  }
}

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  role?: string;
}

/**
 * Dashboard shell: session-first, API-key fallback. Signed-in users skip the
 * key gate entirely (session cookie authenticates API calls); key users get
 * the manual gate as before. Org resolves stored → first membership.
 */
export function Dashboard({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useState(loadStored);
  const value = useMemo<KeyState>(
    () => ({
      key: stored.key,
      storedOrg: stored.orgId,
      save: (key, orgId) => {
        persist(key, orgId);
        setStored({ key, orgId });
      },
      setStoredOrg: (orgId) => {
        persist(stored.key, orgId);
        setStored({ key: stored.key, orgId });
      },
      clear: () => {
        persist(null, null);
        setStored({ key: null, orgId: null });
        authClient.signOut().catch(() => undefined);
      },
    }),
    [stored],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <KeyCtx.Provider value={value}>
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
          <div className="mx-auto max-w-5xl px-4 py-6">
            <Gate>{children}</Gate>
          </div>
        </div>
      </KeyCtx.Provider>
    </QueryClientProvider>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { key, save } = useContext(KeyCtx);
  const session = authClient.useSession();
  if (session.isPending) {
    return <p className="mt-16 text-center text-sm text-zinc-400">Loading…</p>;
  }
  if (session.data?.user || key) return <>{children}</>;
  return <KeyGate onSave={save} />;
}

function KeyGate({ onSave }: { onSave: (key: string, orgId: string | null) => void }) {
  const [key, setKey] = useState("");
  const [orgId, setOrgId] = useState("");
  return (
    <div className={cn(cardClass(), "max-w-md mx-auto mt-16")}>
      <h1 className="text-lg font-semibold">NiceBear dashboard</h1>
      <p className="mt-1 text-sm text-zinc-400">
        <a className="underline" href="/login">Sign in</a> for full access, or paste an admin API key (
        <code>nb_live_…</code>). User keys also need the org id.
      </p>
      <div className="mt-4 space-y-2">
        <input
          className={inputClass()}
          placeholder="nb_live_…"
          value={key}
          onChange={(e) => setKey(e.target.value.trim())}
          autoComplete="off"
          spellCheck={false}
        />
        <input
          className={inputClass()}
          placeholder="org id (only for user keys)"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value.trim())}
          autoComplete="off"
          spellCheck={false}
        />
        <button className={buttonClass()} disabled={!key} onClick={() => onSave(key, orgId || null)}>
          Connect
        </button>
      </div>
    </div>
  );
}

export function useNb(): {
  client: NbClient | null;
  orgId: string | null;
  orgs: OrgRow[];
  setOrgId: (id: string | null) => void;
  clear: () => void;
  hasKey: boolean;
  sessionUser: { id: string; email: string } | null;
} {
  const { key, storedOrg, setStoredOrg, clear } = useContext(KeyCtx);
  const session = authClient.useSession();
  const sessionUser = session.data?.user
    ? { id: session.data.user.id, email: session.data.user.email }
    : null;
  const authed = !!sessionUser || !!key;
  const orgsQuery = useQuery({
    queryKey: ["orgs-mine", sessionUser?.id ?? "no-user", key ? "key" : "no-key"],
    queryFn: async () => {
      const c = createClient(key, null);
      const data = await c.get<{ orgs: OrgRow[] }>("/api/orgs/mine");
      return data.orgs;
    },
    enabled: authed,
    staleTime: 60_000,
  });
  const orgs = orgsQuery.data ?? [];
  const orgId = storedOrg ?? orgs[0]?.id ?? null;
  const client = useMemo(() => (authed ? createClient(key, orgId) : null), [authed, key, orgId]);
  return { client, orgId, orgs, setOrgId: setStoredOrg, clear, hasKey: !!key, sessionUser };
}

export function KeyBar() {
  const { orgId, orgs, setOrgId, clear, sessionUser } = useNb();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
      <span className={badgeClass("ok")}>connected{sessionUser ? ` as ${sessionUser.email}` : ""}</span>
      {orgs.length > 1 ? (
        <select
          className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs"
          value={orgId ?? ""}
          onChange={(e) => setOrgId(e.target.value || null)}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>{o.name} ({o.slug})</option>
          ))}
        </select>
      ) : (
        orgId && <span className={badgeClass()}>org {orgId}</span>
      )}
      <a className="underline hover:text-zinc-200" href="/login">account</a>
      <button className="underline hover:text-zinc-200" onClick={clear}>
        disconnect
      </button>
    </div>
  );
}

export function Err({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "request failed";
  return <div className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-200">{msg}</div>;
}
