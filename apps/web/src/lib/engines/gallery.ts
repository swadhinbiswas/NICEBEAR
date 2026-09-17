import { hashStringToUint32 } from "../rotation/hash";
import type { AvatarEngine } from "./types";

/**
 * Second gallery: DiceBear-grade variety, all original procedural artwork.
 * personas / droids / bauhaus / rings / waves / initials.
 */

function hue(seed: string, salt: string): number {
  return hashStringToUint32(`${salt}:${seed}`) % 360;
}

function svg(inner: string, bg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/>${inner}</svg>`;
}

/** Flat-style person: skin, hair, eyes, smile, shirt. */
export const droidsEngine: AvatarEngine = {
  id: "droids",
  kind: "svg",
  generate(seed: string): string {
    const h = hashStringToUint32(`droids:${seed}`);
    const body = `hsl(${hue(seed, "db")} 55% 55%)`;
    const dark = `hsl(${hue(seed, "db")} 40% 28%)`;
    const glow = h % 2 === 0 ? "#fde047" : "#67e8f9";
    return svg(
      `<line x1="50" y1="8" x2="50" y2="20" stroke="${dark}" stroke-width="4"/><circle cx="50" cy="7" r="3.5" fill="${glow}"/>` +
        `<path d="M28 44 a22 20 0 0 1 44 0 z" fill="${body}"/>` +
        `<rect x="28" y="44" width="44" height="10" fill="${dark}"/>` +
        `<rect x="33" y="46" width="34" height="6" rx="3" fill="${glow}" opacity="0.9"/>` +
        `<rect x="32" y="58" width="36" height="26" rx="8" fill="${body}"/>` +
        `<circle cx="50" cy="68" r="6" fill="${dark}"/><circle cx="50" cy="68" r="3" fill="${glow}"/>` +
        `<rect x="18" y="56" width="8" height="20" rx="4" fill="${dark}"/><rect x="74" y="56" width="8" height="20" rx="4" fill="${dark}"/>`,
      `hsl(${hue(seed, "dbg")} 35% 12%)`,
    );
  },
};

/** Bauhaus composition: quarter-circles, bars, dot. */
export const bauhausEngine: AvatarEngine = {
  id: "bauhaus",
  kind: "svg",
  generate(seed: string): string {
    const h = hashStringToUint32(`bauhaus:${seed}`);
    const c1 = `hsl(${hue(seed, "b1")} 75% 55%)`;
    const c2 = `hsl(${(hue(seed, "b1") + 120) % 360} 75% 50%)`;
    const c3 = `hsl(${(hue(seed, "b1") + 240) % 360} 80% 60%)`;
    const rot = h % 4;
    return svg(
      `<g transform="rotate(${rot * 90} 50 50)">` +
        `<path d="M50 50 L50 10 A40 40 0 0 1 90 50 Z" fill="${c1}"/>` +
        `<path d="M50 50 L90 50 A40 40 0 0 1 50 90 Z" fill="${c2}"/>` +
        `<rect x="14" y="44" width="24" height="12" fill="${c3}"/>` +
        `<circle cx="50" cy="50" r="9" fill="#111827"/>` +
        `</g>`,
      "#fafaf9",
    );
  },
};

/** Concentric patterned rings + center glyph. */
export const ringsEngine: AvatarEngine = {
  id: "rings",
  kind: "svg",
  generate(seed: string): string {
    const h = hashStringToUint32(`rings:${seed}`);
    const hue0 = hue(seed, "rg");
    let rings = "";
    for (let i = 0; i < 4; i++) {
      const r = 42 - i * 9;
      const dashed = (h >> i) & 1 ? ` stroke-dasharray="${4 + ((h >> (i + 2)) % 8)} ${3 + ((h >> (i + 4)) % 6)}"` : "";
      rings += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="hsl(${(hue0 + i * 28) % 360} 70% ${55 - i * 5}%)" stroke-width="6"${dashed}/>`;
    }
    const glyphs = [
      `<circle cx="50" cy="50" r="7" fill="hsl(${hue0} 80% 55%)"/>`,
      `<rect x="43" y="43" width="14" height="14" rx="3" transform="rotate(${h % 90} 50 50)" fill="hsl(${hue0} 80% 55%)"/>`,
      `<path d="M50 41 L58 59 H42 Z" fill="hsl(${hue0} 80% 55%)"/>`,
    ];
    return svg(rings + glyphs[h % glyphs.length]!, `hsl(${hue0} 30% 10%)`);
  },
};

/** Layered sine-wave bands. */
export const wavesEngine: AvatarEngine = {
  id: "waves",
  kind: "svg",
  generate(seed: string): string {
    const h = hashStringToUint32(`waves:${seed}`);
    const hue0 = hue(seed, "wv");
    let bands = "";
    for (let i = 0; i < 5; i++) {
      const yBase = 18 + i * 15;
      const amp = 5 + ((h >> (i * 2)) % 9);
      const phase = ((h >> (i * 3)) % 62) / 10;
      let d = `M0 ${yBase} `;
      for (let x = 0; x <= 100; x += 5) {
        d += `L${x} ${(yBase + amp * Math.sin(x / 14 + phase + i)).toFixed(1)} `;
      }
      d += "L100 100 L0 100 Z";
      bands += `<path d="${d}" fill="hsl(${(hue0 + i * 22) % 360} 65% ${60 - i * 6}%)" opacity="0.92"/>`;
    }
    return svg(bands, `hsl(${hue0} 40% 12%)`);
  },
};

/** Orbital system: planet, ring, and moons placed by hash. */
export const orbitsEngine: AvatarEngine = {
  id: "orbits",
  kind: "svg",
  generate(seed: string): string {
    const h = hashStringToUint32(`orbits:${seed}`);
    const hue0 = hue(seed, "ob");
    const planet = `hsl(${(hue0 + 180) % 360} 65% 55%)`;
    let moons = "";
    const n = 2 + (h % 3);
    for (let i = 0; i < n; i++) {
      const ang = (((h >> (i * 5)) % 360) * Math.PI) / 180;
      const dist = 26 + ((h >> (i * 3)) % 14);
      const mx = 50 + dist * Math.cos(ang);
      const my = 50 + dist * Math.sin(ang) * 0.55;
      const mr = 3 + ((h >> (i * 2)) % 5);
      moons += `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="${mr}" fill="hsl(${(hue0 + i * 40) % 360} 75% 70%)"/>`;
    }
    return svg(
      `<ellipse cx="50" cy="50" rx="38" ry="21" fill="none" stroke="hsl(${hue0} 60% 60%)" stroke-width="3" transform="rotate(${(h % 60) - 30} 50 50)"/>` +
        `<circle cx="50" cy="50" r="14" fill="${planet}"/>` +
        `<circle cx="45" cy="45" r="4" fill="#ffffff" opacity="0.35"/>` +
        moons,
      `hsl(${hue0} 45% 8%)`,
    );
  },
};
