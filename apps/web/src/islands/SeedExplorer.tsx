import { useEffect, useMemo, useState } from "react";
import "../styles/global.css";
import { STYLES } from "../lib/engines/catalog";
import { getAnimated, getEngine } from "../lib/engines/registry";

/** Signature interaction: type anything, watch every style redraw. */
const SHOWCASE = ["personas", "inkwell", "quests", "robots", "anime", "notional", "rings", "blink"] as const;
const PRESETS = ["Felix", "john@doe.dev", "user_42", "🦊", "2026-01-01"];

function gifUri(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return `data:image/gif;base64,${btoa(bin)}`;
}

export function SeedExplorer() {
  const [seed, setSeed] = useState("Felix");
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const shown = useMemo(() => {
    const effective = seed.trim() || "Felix";
    return SHOWCASE.map((id) => {
      const meta = STYLES.find((s) => s.id === id)!;
      try {
        return meta.kind === "gif"
          ? { meta, kind: "gif" as const, src: gifUri(getAnimated(id)!.generate(effective)) }
          : { meta, kind: "svg" as const, src: getEngine(id)!.generate(effective) };
      } catch {
        return { meta, kind: "svg" as const, src: "" };
      }
    });
  }, [seed]);

  const apiUrl = `https://api.nicebear.dev/api/avatar/av_123?seed=${encodeURIComponent(seed.trim() || "Felix")}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiUrl);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div id="seed-explorer" className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs uppercase tracking-wider text-zinc-500" htmlFor="nb-seed">
          Seed
        </label>
        <input
          id="nb-seed"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          spellCheck={false}
          placeholder="anything — a name, an email, an id"
          className="min-w-56 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
        />
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setSeed(p)}
              className="rounded-md border border-zinc-700 px-2 py-1 font-mono text-xs text-zinc-400 hover:bg-zinc-800"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {shown.map(({ meta, kind, src }) => (
          <figure key={meta.id} className="m-0 grid gap-1.5">
            <div className="aspect-square overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              {!mounted ? (
                <div className="h-full w-full animate-pulse bg-zinc-800/40" />
              ) : kind === "gif" ? (
                <img src={src} alt={`${meta.name} avatar`} className="h-full w-full [image-rendering:pixelated]" />
              ) : (
                <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: src }} />
              )}
            </div>
            <figcaption className="truncate text-center font-mono text-[10px] text-zinc-500">{meta.id}</figcaption>
          </figure>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-zinc-800 bg-black px-3 py-2 font-mono text-xs text-emerald-300">
          {apiUrl}
        </code>
        <button
          onClick={copy}
          className="rounded-md bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-white"
        >
          {copied ? "Copied!" : "Copy URL"}
        </button>
      </div>
    </div>
  );
}
