/** shadcn-style primitives (Tailwind v4). Radix-backed overlays land later; these
 * cover the dashboard slice: buttons, cards, inputs, tables, badges, alerts. */

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function buttonClass(variant: "primary" | "ghost" | "danger" = "primary"): string {
  const base =
    "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
  if (variant === "ghost") return cn(base, "border border-zinc-700 text-zinc-200 hover:bg-zinc-800");
  if (variant === "danger") return cn(base, "bg-red-600 text-white hover:bg-red-500");
  return cn(base, "bg-zinc-100 text-zinc-900 hover:bg-white");
}

export function cardClass(): string {
  return "rounded-lg border border-zinc-800 bg-zinc-950 p-4";
}

export function inputClass(): string {
  return "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400";
}

export function badgeClass(tone: "ok" | "warn" | "bad" | "mute" = "mute"): string {
  const tones: Record<string, string> = {
    ok: "bg-emerald-950 text-emerald-300 border-emerald-800",
    warn: "bg-amber-950 text-amber-300 border-amber-800",
    bad: "bg-red-950 text-red-300 border-red-800",
    mute: "bg-zinc-900 text-zinc-300 border-zinc-700",
  };
  return cn("inline-block rounded border px-1.5 py-0.5 text-xs", tones[tone]);
}

export function tableClass(): string {
  return "w-full text-sm";
}

export function thClass(): string {
  return "text-left font-medium text-zinc-400 border-b border-zinc-800 px-2 py-1.5";
}

export function tdClass(): string {
  return "border-b border-zinc-900 px-2 py-1.5 text-zinc-200";
}
