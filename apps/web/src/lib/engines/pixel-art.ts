import { hashStringToUint32 } from "../rotation/hash";
import type { AvatarEngine } from "./types";

const PALETTES = [
  ["#0ea5e9", "#f472b6", "#facc15", "#34d399"],
  ["#8b5cf6", "#22d3ee", "#f97316", "#eab308"],
  ["#10b981", "#3b82f6", "#ef4444", "#f59e0b"],
];

/** 8x8 pixel-art face-ish sprite — deterministic per seed. */
export const pixelArtEngine: AvatarEngine = {
  id: "pixel-art",
  kind: "svg",
  generate(seed: string): string {
    const h = hashStringToUint32(`pixel:${seed}`);
    const palette = PALETTES[h % PALETTES.length];
    const bg = palette[(h >>> 2) % palette.length]!;
    const fg = palette[(h >>> 5) % palette.length]!;
    const S = 160;
    const cell = S / 8;
    let rects = "";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        const bit = (h >> ((y * 4 + x + (y % 3)) % 24)) & 1;
        if (!bit && (x + y) % 3 !== 0) continue;
        const color = (x + y) % 2 === 0 ? fg : bg;
        const rx = x * cell;
        const mx = (7 - x) * cell;
        rects += `<rect x="${rx}" y="${y * cell}" width="${cell}" height="${cell}" fill="${color}"/>`;
        if (mx !== rx) rects += `<rect x="${mx}" y="${y * cell}" width="${cell}" height="${cell}" fill="${color}"/>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" shape-rendering="crispEdges"><rect width="160" height="160" fill="#0f172a"/>${rects}</svg>`;
  },
};
