import { hashStringToUint32 } from "../rotation/hash";
import type { AvatarEngine } from "./types";

function hue(seed: string, salt: string): number {
  return hashStringToUint32(`${salt}:${seed}`) % 360;
}

/** 5x5 mirrored identicon — deterministic per seed. */
export const identiconEngine: AvatarEngine = {
  id: "identicons",
  kind: "svg",
  generate(seed: string): string {
    const h = hashStringToUint32(`identicon:${seed}`);
    const bg = hue(seed, "bg");
    const fg = hue(seed, "fg");
    const cells: string[] = [];
    const S = 100;
    const cell = S / 5;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 3; x++) {
        const bit = (h >> ((y * 3 + x) % 31)) & 1;
        if (!bit) continue;
        const rx = x * cell;
        const mx = (4 - x) * cell;
        cells.push(`<rect x="${rx}" y="${y * cell}" width="${cell}" height="${cell}"/>`);
        if (mx !== rx) cells.push(`<rect x="${mx}" y="${y * cell}" width="${cell}" height="${cell}"/>`);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="hsl(${bg} 60% 92%)"/><g fill="hsl(${fg} 65% 45%)">${cells.join("")}</g></svg>`;
  },
};
