import { useState } from "react";
import { cardClass, inputClass } from "../components/ui";

/**
 * Standalone playground — public avatar endpoints need no key, so this
 * renders outside the dashboard key gate (used on /dashboard as a demo).
 */
export function Playground() {
  const [avatarId, setAvatarId] = useState("");
  const [seed, setSeed] = useState("john");
  const variants: Array<{ label: string; href: string }> = avatarId
    ? [
        { label: "current", href: `/api/avatar/${avatarId}?seed=${encodeURIComponent(seed)}` },
        { label: "daily", href: `/api/avatar/${avatarId}/daily` },
        { label: "weekly", href: `/api/avatar/${avatarId}/weekly` },
        { label: "monthly", href: `/api/avatar/${avatarId}/monthly` },
        { label: "random", href: `/api/avatar/${avatarId}/random?seed=${encodeURIComponent(seed)}` },
      ]
    : [];
  return (
    <div className={cardClass()}>
      <h2 className="text-base font-semibold">Playground</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          className={inputClass()}
          style={{ maxWidth: 220 }}
          placeholder="avatar id (av_…)"
          value={avatarId}
          onChange={(e) => setAvatarId(e.target.value.trim())}
          spellCheck={false}
        />
        <input
          className={inputClass()}
          style={{ maxWidth: 160 }}
          placeholder="seed"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          spellCheck={false}
        />
      </div>
      {variants.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {variants.map((v) => (
            <figure key={v.label}>
              <img src={v.href} alt={v.label} className="h-20 w-20 rounded-md bg-zinc-900" loading="lazy" />
              <figcaption className="mt-1 font-mono text-[10px] text-zinc-500">{v.label}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
