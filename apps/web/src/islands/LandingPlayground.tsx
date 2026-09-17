import { useEffect, useMemo, useState } from "react";
import "../styles/global.css";
import { getAnimated, getEngine, listAnimated, listEngines } from "../lib/engines/registry";

const SVG_STYLES = listEngines();
const GIF_STYLES = listAnimated();

function randomSeed(): string {
  const words = ["ember", "pixel", "nova", "drift", "cobalt", "miso", "quokka", "zephyr", "acorn", "bongo"];
  const pick = () => words[Math.floor(Math.random() * words.length)]!;
  return `${pick()}-${Math.floor(Math.random() * 999)}`;
}

function gifDataUri(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:image/gif;base64,${btoa(bin)}`;
}

/**
 * Public playground: renders engines entirely client-side (they're pure
 * functions of seed — no account, no backend). The embed snippet shows the
 * equivalent hosted API call for production use.
 */
export function LandingPlayground() {
  const [style, setStyle] = useState("personas");
  const [seed, setSeed] = useState("ember-42");
  const [format, setFormat] = useState<"svg" | "gif">("svg");
  const [copied, setCopied] = useState<string | null>(null);

  const isGifStyle = GIF_STYLES.includes(style);
  useEffect(() => {
    if (isGifStyle) setFormat("gif");
  }, [isGifStyle, style]);

  const preview = useMemo(() => {
    try {
      if (format === "gif") {
        const animated = getAnimated(style) ?? getAnimated("blink")!;
        return { kind: "img" as const, src: gifDataUri(animated.generate(seed || "x")) };
      }
      const engine = getEngine(style) ?? getEngine("personas")!;
      return { kind: "svg" as const, src: engine.generate(seed || "x") };
    } catch {
      return { kind: "svg" as const, src: "" };
    }
  }, [style, seed, format]);

  const embedUrl = `/api/avatar/YOUR_ID?seed=${encodeURIComponent(seed || "x")}${format === "svg" ? "" : `&format=${format}`}`;
  const embedHtml = `<img src="https://api.nicebear.dev${embedUrl}" alt="avatar" width="128" />`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="flex items-center justify-center rounded-xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-black p-6 sm:w-64">
          {preview.kind === "svg" ? (
            <div className="h-44 w-44 overflow-hidden rounded-xl [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: preview.src }} />
          ) : (
            <img src={preview.src} alt={`${style} avatar preview`} className="h-44 w-44 rounded-xl [image-rendering:pixelated]" />
          )}
        </div>
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-zinc-400">
              Style
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
              >
                <optgroup label="Static · SVG + PNG">
                  {SVG_STYLES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </optgroup>
                <optgroup label="Animated · GIF">
                  {GIF_STYLES.map((s) => (
                    <option key={s} value={s}>{s} (animated)</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              Seed
              <div className="mt-1 flex gap-1">
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  spellCheck={false}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                />
                <button
                  title="Random seed"
                  onClick={() => setSeed(randomSeed())}
                  className="rounded-md border border-zinc-700 px-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  Shuffle
                </button>
              </div>
            </label>
          </div>
          <div className="flex gap-1 text-xs">
            {(["svg", "gif"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`rounded-md border px-2.5 py-1 font-mono uppercase ${
                  format === f ? "border-zinc-100 bg-zinc-100 text-zinc-900" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {f}
              </button>
            ))}
            <span className="ml-1 self-center text-zinc-500">+ png via API (?format=png&amp;w=256)</span>
          </div>
          <div className="rounded-md border border-zinc-800 bg-black px-3 py-2 font-mono text-xs text-emerald-300 break-all">
            {embedHtml}
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => copy(embedHtml, "html")} className="rounded-md bg-zinc-100 px-3 py-1.5 font-medium text-zinc-900 hover:bg-white">
              {copied === "html" ? "Copied!" : "Copy embed"}
            </button>
            <button
              onClick={() => copy(`https://api.nicebear.dev${embedUrl}`, "url")}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
            >
              {copied === "url" ? "Copied!" : "Copy URL"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
