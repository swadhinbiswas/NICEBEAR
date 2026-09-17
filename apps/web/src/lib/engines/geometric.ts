import { hashStringToUint32 } from "../rotation/hash";
import type { AvatarEngine } from "./types";

/** Concentric geometric composition — deterministic per seed. */
export const geometricEngine: AvatarEngine = {
  id: "geometric",
  generate(seed: string): string {
    const h = hashStringToUint32(`geo:${seed}`);
    const hue = h % 360;
    const shapes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = 46 - i * 8;
      const rot = (h >> (i * 3)) % 360;
      const fill = i % 2 === 0 ? `hsl(${hue} 70% ${55 - i * 6}%)` : "transparent";
      const stroke = i % 2 === 0 ? "transparent" : `hsl(${(hue + 40) % 360} 70% 55%)`;
      shapes.push(
        `<circle cx="50" cy="50" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="3" transform="rotate(${rot} 50 50)"/>`,
      );
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="hsl(${hue} 30% 12%)"/>${shapes.join("")}</svg>`;
  },
};
