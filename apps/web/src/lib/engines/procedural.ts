import { hashStringToUint32 } from "../rotation/hash";
import type { AvatarEngine } from "./types";

function hue(seed: string, salt: string, mod = 360): number {
  return hashStringToUint32(`${salt}:${seed}`) % mod;
}

function svg(inner: string, bg: string, size = 100): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${bg}"/>${inner}</svg>`;
}

/** Robot head — antenna style + eye layout vary by seed. */
export const robotsEngine: AvatarEngine = {
  id: "robots",
  generate(seed: string): string {
    const h = hashStringToUint32(`robots:${seed}`);
    const body = `hsl(${hue(seed, "rb")} 60% 55%)`;
    const dark = `hsl(${hue(seed, "rb")} 45% 30%)`;
    const antenna = h % 2 === 0
      ? `<line x1="50" y1="18" x2="50" y2="30" stroke="${dark}" stroke-width="4"/><circle cx="50" cy="14" r="5" fill="#f87171"/>`
      : `<line x1="38" y1="20" x2="44" y2="30" stroke="${dark}" stroke-width="4"/><line x1="62" y1="20" x2="56" y2="30" stroke="${dark}" stroke-width="4"/>`;
    const eyes = h % 3 === 0
      ? `<circle cx="38" cy="48" r="6" fill="#0f172a"/><circle cx="62" cy="48" r="6" fill="#0f172a"/><circle cx="40" cy="46" r="2" fill="#fff"/><circle cx="64" cy="46" r="2" fill="#fff"/>`
      : `<rect x="32" y="43" width="14" height="10" rx="3" fill="#0f172a"/><rect x="54" y="43" width="14" height="10" rx="3" fill="#0f172a"/>`;
    const mouth = `<rect x="40" y="64" width="20" height="5" rx="2.5" fill="${dark}"/>`;
    return svg(`${antenna}<rect x="25" y="30" width="50" height="48" rx="10" fill="${body}"/>${eyes}${mouth}`, `hsl(${hue(seed, "rbg")} 30% 14%)`);
  },
};

/** Cartoon face — smile + eye variants. */
export const cartoonEngine: AvatarEngine = {
  id: "cartoon",
  generate(seed: string): string {
    const h = hashStringToUint32(`cartoon:${seed}`);
    const skin = `hsl(${20 + (h % 30)} 70% ${55 + (h % 20)}%)`;
    const hair = `hsl(${hue(seed, "ch")} 60% 30%)`;
    const eyes = h % 2 === 0
      ? `<circle cx="38" cy="48" r="5" fill="#1f2937"/><circle cx="62" cy="48" r="5" fill="#1f2937"/><circle cx="39.5" cy="46.5" r="1.6" fill="#fff"/><circle cx="63.5" cy="46.5" r="1.6" fill="#fff"/>`
      : `<path d="M32 48 q6 -6 12 0" stroke="#1f2937" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M56 48 q6 -6 12 0" stroke="#1f2937" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    const smile = h % 3 === 0
      ? `<path d="M38 66 q12 10 24 0" stroke="#1f2937" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
      : `<ellipse cx="50" cy="68" rx="7" ry="5" fill="#1f2937"/>`;
    return svg(
      `<path d="M22 42 q-2 -26 28 -26 t28 26 l-6 4 q4 -22 -22 -22 t-22 22 z" fill="${hair}"/><ellipse cx="50" cy="55" rx="27" ry="30" fill="${skin}"/>${eyes}<circle cx="30" cy="60" r="4" fill="#f9a8d4" opacity="0.7"/><circle cx="70" cy="60" r="4" fill="#f9a8d4" opacity="0.7"/>${smile}`,
      `hsl(${hue(seed, "cbg")} 50% 90%)`,
    );
  },
};

/** Anime face — big eyes, blush, hair fringe. */
export const animeEngine: AvatarEngine = {
  id: "anime",
  generate(seed: string): string {
    const h = hashStringToUint32(`anime:${seed}`);
    const hair = `hsl(${hue(seed, "ah")} 65% ${30 + (h % 25)}%)`;
    const eye = `hsl(${hue(seed, "ae")} 80% 45%)`;
    const eyePair = (cx: number) =>
      `<ellipse cx="${cx}" cy="54" rx="7" ry="9" fill="#fff"/><ellipse cx="${cx}" cy="56" rx="4.5" ry="6.5" fill="${eye}"/><circle cx="${cx}" cy="58" r="2.4" fill="#111827"/><circle cx="${cx + 1.5}" cy="53.5" r="1.4" fill="#fff"/>`;
    return svg(
      `<ellipse cx="50" cy="56" rx="24" ry="27" fill="#ffe4d6"/>` +
        `<path d="M24 52 q-4 -30 26 -32 t26 32 l-8 2 q6 -24 -18 -26 t-18 26 z" fill="${hair}"/>` +
        `<path d="M30 44 l6 10 6 -10 6 10 6 -10 6 10 4 -8" stroke="${hair}" stroke-width="4" fill="none" stroke-linecap="round"/>` +
        `${eyePair(40)}${eyePair(60)}` +
        `<ellipse cx="33" cy="64" rx="4" ry="2.5" fill="#fda4af" opacity="0.8"/><ellipse cx="67" cy="64" rx="4" ry="2.5" fill="#fda4af" opacity="0.8"/>` +
        `<path d="M45 70 q5 4 10 0" stroke="#7c2d12" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
      `hsl(${hue(seed, "abg")} 60% 88%)`,
    );
  },
};

/** Minimal — duotone disc + bar. */
export const minimalEngine: AvatarEngine = {
  id: "minimal",
  generate(seed: string): string {
    const h = hashStringToUint32(`minimal:${seed}`);
    const fg = `hsl(${hue(seed, "mfg")} 55% 45%)`;
    const bg = `hsl(${hue(seed, "mbg")} 25% 94%)`;
    const r = 22 + (h % 14);
    const y = 30 + (h % 40);
    return svg(`<circle cx="50" cy="50" r="${r}" fill="${fg}"/><rect x="20" y="${y}" width="60" height="7" rx="3.5" fill="#111827"/>`, bg);
  },
};

/** Business — shirt, collar, tie. */
export const businessEngine: AvatarEngine = {
  id: "business",
  generate(seed: string): string {
    const h = hashStringToUint32(`business:${seed}`);
    const skin = `hsl(${20 + (h % 25)} 60% 60%)`;
    const shirt = `hsl(${hue(seed, "bs")} 30% 92%)`;
    const tie = `hsl(${hue(seed, "bt")} 70% 40%)`;
    const knot = h % 2 === 0;
    return svg(
      `<circle cx="50" cy="34" r="16" fill="${skin}"/>` +
        `<path d="M30 34 q-2 -20 20 -20 t20 20 l-4 2 q2 -16 -16 -16 t-16 16 z" fill="hsl(${hue(seed, "bh")} 40% 25%)"/>` +
        `<rect x="22" y="56" width="56" height="44" rx="6" fill="${shirt}"/>` +
        `<path d="M42 56 l8 8 8 -8 4 44 h-24 z" fill="#e5e7eb"/>` +
        (knot
          ? `<rect x="46" y="62" width="8" height="8" rx="1.5" fill="${tie}"/><path d="M44 70 h12 l-3 22 h-6 z" fill="${tie}"/>`
          : `<path d="M50 60 l7 8 -7 24 -7 -24 z" fill="${tie}"/>`),
      `hsl(${hue(seed, "bbg")} 30% 16%)`,
    );
  },
};

/** Fantasy — wizard hat + gem. */
export const fantasyEngine: AvatarEngine = {
  id: "fantasy",
  generate(seed: string): string {
    const h = hashStringToUint32(`fantasy:${seed}`);
    const robe = `hsl(${hue(seed, "fr")} 60% 35%)`;
    const gem = `hsl(${(hue(seed, "fg") + 150) % 360} 90% 60%)`;
    const tilt = (h % 21) - 10;
    return svg(
      `<g transform="rotate(${tilt} 50 50)"><path d="M50 6 L74 52 H26 Z" fill="${robe}"/><circle cx="50" cy="52" r="34" fill="none" stroke="${robe}" stroke-width="0"/></g>` +
        `<ellipse cx="50" cy="66" rx="22" ry="24" fill="#ffdfc4"/>` +
        `<circle cx="42" cy="64" r="3.4" fill="#1f2937"/><circle cx="58" cy="64" r="3.4" fill="#1f2937"/>` +
        `<rect x="30" y="46" width="40" height="8" rx="4" fill="${robe}"/>` +
        `<circle cx="50" cy="30" r="5" fill="${gem}"/>`,
      "#1e1b4b",
    );
  },
};

/** Gaming — controller on dark. */
export const gamingEngine: AvatarEngine = {
  id: "gaming",
  generate(seed: string): string {
    const h = hashStringToUint32(`gaming:${seed}`);
    const pad = `hsl(${hue(seed, "gp")} 70% 45%)`;
    const btn = ["#facc15", "#f472b6", "#34d399", "#60a5fa"];
    const bx = [62, 68, 62, 56];
    const by = [52, 58, 64, 58];
    let buttons = "";
    for (let i = 0; i < 4; i++) {
      buttons += `<circle cx="${bx[i]}" cy="${by[i]}" r="3.4" fill="${btn[(h + i) % 4]}"/>`;
    }
    return svg(
      `<rect x="20" y="42" width="60" height="30" rx="15" fill="${pad}"/>` +
        `<path d="M34 50 h10 M39 45 v10" stroke="#0f172a" stroke-width="3.4" stroke-linecap="round"/>` +
        buttons,
      "#0b1220",
    );
  },
};

/** Cyberpunk — neon visor + scanlines. */
export const cyberpunkEngine: AvatarEngine = {
  id: "cyberpunk",
  generate(seed: string): string {
    const h = hashStringToUint32(`cyberpunk:${seed}`);
    const neon = `hsl(${hue(seed, "cn")} 100% 60%)`;
    let lines = "";
    for (let y = 8; y < 100; y += 8) {
      lines += `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="#000" stroke-width="1" opacity="0.5"/>`;
    }
    return svg(
      `<ellipse cx="50" cy="52" rx="26" ry="30" fill="#1f2937"/>` +
        `<rect x="26" y="42" width="48" height="16" rx="8" fill="${neon}" opacity="0.9"/>` +
        `<rect x="30" y="45" width="${14 + (h % 20)}" height="4" rx="2" fill="#fff" opacity="0.85"/>` +
        `<path d="M40 78 h20" stroke="${neon}" stroke-width="3" stroke-linecap="round"/>` + lines,
      "#050510",
    );
  },
};

/** Abstract — hash-driven bezier blobs. */
export const abstractEngine: AvatarEngine = {
  id: "abstract",
  generate(seed: string): string {
    const h = hashStringToUint32(`abstract:${seed}`);
    const hue0 = hue(seed, "ab");
    const pt = (i: number, scale: number): string =>
      String(15 + (hashStringToUint32(`${seed}:p${i}`) % scale));
    const blob = (k: number, fill: string, op: string) =>
      `<path d="M${pt(k, 70)} ${pt(k + 1, 70)} C ${pt(k + 2, 90)} ${pt(k + 3, 30)}, ${pt(k + 4, 30)} ${pt(k + 5, 90)}, ${pt(k + 6, 70)} ${pt(k + 7, 70)} C ${pt(k + 8, 90)} ${pt(k + 9, 40)}, ${pt(k + 10, 40)} ${pt(k + 11, 90)}, ${pt(k, 70)} ${pt(k + 1, 70)} Z" fill="${fill}" opacity="${op}"/>`;
    return svg(
      blob(0, `hsl(${hue0} 75% 55%)`, "0.9") +
        blob(20, `hsl(${(hue0 + 60) % 360} 75% 55%)`, "0.7") +
        `<circle cx="${pt(40, 80)}" cy="${pt(41, 80)}" r="${6 + (h % 8)}" fill="hsl(${(hue0 + 180) % 360} 80% 65%)"/>`,
      `hsl(${hue0} 30% 10%)`,
    );
  },
};

/** Animals — cat face with variant ears/markings. */
export const animalsEngine: AvatarEngine = {
  id: "animals",
  generate(seed: string): string {
    const h = hashStringToUint32(`animals:${seed}`);
    const fur = `hsl(${25 + (h % 20)} 45% ${45 + (h % 25)}%)`;
    const inner = "#fda4af";
    const ears = h % 2 === 0
      ? `<path d="M28 34 L32 12 L48 26 Z" fill="${fur}"/><path d="M72 34 L68 12 L52 26 Z" fill="${fur}"/><path d="M32 28 L34 18 L42 25 Z" fill="${inner}"/><path d="M68 28 L66 18 L58 25 Z" fill="${inner}"/>`
      : `<ellipse cx="30" cy="24" rx="9" ry="12" fill="${fur}"/><ellipse cx="70" cy="24" rx="9" ry="12" fill="${fur}"/><ellipse cx="30" cy="25" rx="4" ry="6" fill="${inner}"/><ellipse cx="70" cy="25" rx="4" ry="6" fill="${inner}"/>`;
    return svg(
      `${ears}<ellipse cx="50" cy="58" rx="26" ry="24" fill="${fur}"/>` +
        (h % 3 === 0 ? `<path d="M50 36 q-4 10 0 20 q4 -10 0 -20" stroke="#92400e" stroke-width="3" fill="none"/>` : "") +
        `<circle cx="40" cy="56" r="4.5" fill="#166534"/><circle cx="60" cy="56" r="4.5" fill="#166534"/><circle cx="41.5" cy="54.5" r="1.5" fill="#fff"/><circle cx="61.5" cy="54.5" r="1.5" fill="#fff"/>` +
        `<path d="M46 66 h8 l-4 4 z" fill="#f472b6"/>` +
        `<path d="M28 62 h10 M28 68 l10 -2 M72 62 h-10 M72 68 l-10 -2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`,
      `hsl(${hue(seed, "nbg")} 40% 12%)`,
    );
  },
};
