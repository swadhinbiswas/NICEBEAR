/**
 * Studio engines: layered vector portraits at illustration quality.
 *
 * Everything here is original procedural artwork built from the same
 * compositional skeleton DiceBear-style portrait sets use:
 *
 *   background → back hair → torso/collar → neck → ears → face →
 *   brows → eyes → nose → mouth → blush → front hair → accessory
 *
 * One composer drives several visual languages via `mode`:
 *   - "flat"  → filled colour illustration (personas, quests)
 *   - "line"  → ink line art on paper (inkwell, notional)
 *
 * Determinism: every feature is selected from a seeded PRNG, so the same
 * seed always yields the identical portrait on every platform.
 */

import { hashStringToUint32 } from "../rotation/hash";
import type { AvatarEngine } from "./types";

// ------------------------------------------------------------------ rng

function rng(seed: string, salt: string): () => number {
  let a = hashStringToUint32(`${salt}:${seed}`);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length) % arr.length]!;
}

function chance(rnd: () => number, p: number): boolean {
  return rnd() < p;
}

// --------------------------------------------------------------- tokens

interface Tone {
  base: string;
  shade: string;
}

const SKINS: readonly Tone[] = [
  { base: "#f6ddc8", shade: "#ecc3a6" },
  { base: "#f1cdaa", shade: "#e0b48c" },
  { base: "#e6b98d", shade: "#d09d6d" },
  { base: "#c98d5f", shade: "#b1734a" },
  { base: "#a86a42", shade: "#8f5533" },
  { base: "#7d4a2e", shade: "#643a23" },
  { base: "#54321f", shade: "#422718" },
];

const HAIRS: readonly Tone[] = [
  { base: "#2b2b33", shade: "#17171d" },
  { base: "#4a3728", shade: "#33241a" },
  { base: "#7b4a2d", shade: "#5d3720" },
  { base: "#b3742f", shade: "#8f5a20" },
  { base: "#d9a441", shade: "#b5842c" },
  { base: "#e5c98b", shade: "#c9ab6c" },
  { base: "#a63d40", shade: "#832e31" },
  { base: "#d95d7a", shade: "#b84361" },
  { base: "#7b4ea8", shade: "#5f3a86" },
  { base: "#3f6fb5", shade: "#2f5590" },
  { base: "#2f8f83", shade: "#226e65" },
  { base: "#5c8a3c", shade: "#466b2c" },
  { base: "#8d8d97", shade: "#6f6f77" },
  { base: "#c96a3a", shade: "#a3522a" },
];

const SHIRTS: readonly Tone[] = [
  { base: "#e8e6e1", shade: "#d2cfc8" },
  { base: "#2f3e5c", shade: "#243049" },
  { base: "#3f7d6a", shade: "#30604f" },
  { base: "#b5462f", shade: "#943826" },
  { base: "#d9a441", shade: "#b9862f" },
  { base: "#5b6bb0", shade: "#48569a" },
  { base: "#8c5a8e", shade: "#704872" },
  { base: "#3e3e46", shade: "#2d2d34" },
  { base: "#c97fa2", shade: "#a96686" },
  { base: "#5f9ea0", shade: "#4a8082" },
];

const BGS: readonly string[] = [
  "#f4e9db",
  "#e7eef7",
  "#e6f0e4",
  "#f7e6ea",
  "#f0e9f7",
  "#f7f0dd",
  "#e3f0f0",
  "#eceae6",
];

const IRISES: readonly Tone[] = [
  { base: "#4a3222", shade: "#33210f" },
  { base: "#3f5d2f", shade: "#2c4420" },
  { base: "#3b5a86", shade: "#294267" },
  { base: "#7a5a2f", shade: "#5c4020" },
  { base: "#4a4a52", shade: "#33333a" },
];

const PAPER = { base: "#ffffff", shade: "#f2f0ec" } as const;
const INK = "#191a1f";

// -------------------------------------------------------- canvas helpers

interface Ctx {
  rnd: () => number;
  mode: "flat" | "line";
  skin: Tone;
  hair: Tone;
  shirt: Tone;
  bg: string;
  /** Unique-per-avatar value used to build clipPath ids. */
  idSalt: string;
}

/** Stroke applied only in line mode; keeps flat mode purely filled. */
function ink(ctx: Ctx, width = 2.2): string {
  return ctx.mode === "line" ? ` stroke="${INK}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"` : "";
}

function faceTop(ctx: Ctx): string {
  return ctx.mode === "line" ? PAPER.base : ctx.skin.base;
}

// ------------------------------------------------------------- features

/** Egg-shaped head: rounded crown, tapered jaw. `rounder` gives the
 * friendlier cartoon skull with a fuller jaw. */
function head(ctx: Ctx, rounder = false): string {
  const d = rounder
    ? "M50 19.5 C63.5 19.5 72.5 30 72.5 46.5 C72.5 62 62.5 72 50 72 C37.5 72 27.5 62 27.5 46.5 C27.5 30 36.5 19.5 50 19.5 Z"
    : "M28.5 45 C28.5 28.5 37.5 19.5 50 19.5 C62.5 19.5 71.5 28.5 71.5 45 C71.5 59.5 61.5 71 50 71 C38.5 71 28.5 59.5 28.5 45 Z";
  return `<path d="${d}" fill="${faceTop(ctx)}"${ink(ctx)}/>`;
}

function ears(ctx: Ctx): string {
  const { skin, mode } = ctx;
  return (
    `<ellipse cx="28" cy="49" rx="4.6" ry="6.2" fill="${mode === "line" ? PAPER.base : skin.base}"${ink(ctx)}/>` +
    `<ellipse cx="72" cy="49" rx="4.6" ry="6.2" fill="${mode === "line" ? PAPER.base : skin.base}"${ink(ctx)}/>`
  );
}

function neckAndShoulders(ctx: Ctx): string {
  const { skin, shirt, mode } = ctx;
  const skinFill = mode === "line" ? PAPER.base : skin.shade;
  const shoulder = `M50 66 C40 66 31.5 70 27.5 76 C23.5 82 21 92 20.5 100 L79.5 100 C79 92 76.5 82 72.5 76 C68.5 70 60 66 50 66 Z`;
  const collar = `M42.5 67.5 L50 78 L57.5 67.5 L53.5 66.5 L50 72.5 L46.5 66.5 Z`;
  return (
    `<rect x="44" y="56" width="12" height="14" rx="4.5" fill="${skinFill}"${ink(ctx)}/>` +
    `<path d="${shoulder}" fill="${mode === "line" ? PAPER.base : shirt.base}"${ink(ctx)}/>` +
    `<path d="${collar}" fill="${mode === "line" ? PAPER.base : shirt.shade}"${ink(ctx, 1.8)}/>`
  );
}

/** Back hair sits behind ears/neck; only used by long styles. */
function backHair(ctx: Ctx): string {
  const { hair, mode } = ctx;
  const fill = mode === "line" ? INK : hair.base;
  const style = Math.floor(ctx.rnd() * 4);
  switch (style) {
    case 0: // long straight, past shoulders
      return `<path d="M25 44 C22 26 34 16 50 16 C66 16 78 26 75 44 L77 88 L65 84 L63 52 L37 52 L35 84 L23 88 Z" fill="${fill}"${ink(ctx)}/>`;
    case 1: // twin puffs
      return (
        `<circle cx="24" cy="52" r="10.5" fill="${fill}"${ink(ctx)}/>` +
        `<circle cx="76" cy="52" r="10.5" fill="${fill}"${ink(ctx)}/>` +
        `<path d="M28 44 C26 26 36 17 50 17 C64 17 74 26 72 44 L72 56 L28 56 Z" fill="${fill}"${ink(ctx)}/>`
      );
    case 2: // low bun
      return (
        `<circle cx="50" cy="14" r="8" fill="${fill}"${ink(ctx)}/>` +
        `<path d="M28 46 C26 27 36 18 50 18 C64 18 74 27 72 46 C72 40 68 34 62 32 L38 32 C32 34 28 40 28 46 Z" fill="${fill}"${ink(ctx)}/>`
      );
    default: // bob volume
      return `<path d="M26 46 C23 26 35 15 50 15 C65 15 77 26 74 46 C74 56 72 62 68 66 L68 44 C66 36 60 32 50 32 C40 32 34 36 32 44 L32 66 C28 62 26 56 26 46 Z" fill="${fill}"${ink(ctx)}/>`;
  }
}

/** Front hair: the style-defining layer. 8 silhouettes with strand lines
 * clipped to the silhouette so they never spill onto the forehead. */
function frontHair(ctx: Ctx): string {
  const { hair, mode } = ctx;
  const fill = mode === "line" ? INK : hair.base;
  const strand = mode === "line" ? "rgba(255,255,255,.35)" : hair.shade;
  const style = Math.floor(ctx.rnd() * 8);
  const clipId = `nbh${hashStringToUint32(ctx.idSalt)}`;
  const cap = (d: string, strands: string[]) =>
    `<defs><clipPath id="${clipId}"><path d="${d}"/></clipPath></defs>` +
    `<path d="${d}" fill="${fill}"${ink(ctx)}/>` +
    `<g clip-path="url(#${clipId})">${strands
      .map((s) => `<path d="${s}" stroke="${strand}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`)
      .join("")}</g>`;

  switch (style) {
    case 0: // straight fringe
      return cap(
        "M27.5 46 C25 26 36 16 50 16 C64 16 75 26 72.5 46 C71 37 68.5 32.5 65 30.5 C57 35 43 35 35 30.5 C31.5 32.5 29 37 27.5 46 Z",
        ["M39 29 q4 6 3.2 12", "M50 31 q0 6 .5 11", "M61 29 q-4 6 -3.2 12"],
      );
    case 1: // side part, swept
      return cap(
        "M27.5 47 C24 26 36 15 50 15 C64 15 76 26 72.5 47 C72 34 69 27 61 24.5 C52 31 40 32 33.5 27.5 C29.5 30.5 28 37 27.5 47 Z",
        ["M58 25 q6 6 7 16", "M48 29 q10 2 16 8", "M38 29 q6 4 8 10"],
      );
    case 2: // middle part
      return cap(
        "M27.5 46 C25 26 36 16 50 16 C64 16 75 26 72.5 46 C70.5 36 68 30.5 62 28 C56 33 44 33 38 28 C32 30.5 29.5 36 27.5 46 Z",
        ["M44 28 q-5 7 -6 15", "M56 28 q5 7 6 15"],
      );
    case 3: // bob with full fringe
      return cap(
        "M26 48 C23 25 35 14 50 14 C65 14 77 25 74 48 C74 54 72.5 60 70 64 L69 44 C68 34 60 29 50 29 C40 29 32 34 31 44 L30 64 C27.5 60 26 54 26 48 Z",
        ["M37 30 q-2 8 -1.5 16", "M50 29 q0 9 .5 15", "M63 30 q2 8 1.5 16"],
      );
    case 4: // quiff — crown-safe outer edge, swoosh drawn inside
      return (
        cap(
          "M27.5 47 C25 28 29 15 39 13 C45 11 55 11 61 13.5 C68 16.5 72.5 26 72.5 47 C71 36 68 30 62 27.5 C52 32 40 32 34 28.5 C30 31.5 28 38 27.5 47 Z",
          ["M42 14.5 q-1.5 6 -5.5 9", "M56 13 q4 4 6.5 10"],
        ) +
        `<path d="M39 13 C41 19 45.5 21.5 51 20.5 C46 18.5 43.5 15.5 43 12 Z" fill="${strand}"/>`
      );
    case 5: // short crop / buzz — crown-safe
      return cap(
        "M28 46 C26.5 28 35 16.5 50 16.5 C65 16.5 73.5 28 72 46 C70 36 66.5 31.5 60 29.5 C53 33.5 47 33.5 40 29.5 C33.5 31.5 30 36 28 46 Z",
        ["M38 29 q3 5 2.5 9", "M62 29 q-3 5 -2.5 9"],
      );
    case 6: // wavy shoulder-length with centre locks
      return cap(
        "M25.5 48 C22.5 25 34 13 50 13 C66 13 77.5 25 74.5 48 C73 40 71 34 67 31 C64 40 58 44 50 44 C42 44 36 40 33 31 C29 34 27 40 25.5 48 Z",
        ["M34 33 q-3 12 -1 24", "M50 44 q0 8 .5 14", "M66 33 q3 12 1 24"],
      );
    default: // long swept with face-framing locks
      return cap(
        "M25 50 C21 24 34 12 50 12 C66 12 79 24 75 50 C74 42 72 36 68 33 C62 40 54 43 45 42 C37 41 32 38 30 33 C27 36 26 42 25 50 Z",
        ["M31 36 q-2 10 -1 20", "M47 36 q8 1 13 -2", "M69 37 q3 10 2 20"],
      );
  }
}

type EyeStyle = "round" | "almond" | "happy" | "wink" | "sleepy" | "wide" | "dot";

function eyes(ctx: Ctx, expressive: boolean): { svg: string; iris: Tone } {
  // Line mode is monochrome ink: irises go black (colored iris on white
  // line art reads as muddied).
  const iris: Tone = ctx.mode === "line" ? { base: INK, shade: INK } : pick(ctx.rnd, IRISES);
  const style: EyeStyle =
    expressive
      ? pick(ctx.rnd, ["wide", "wide", "almond", "wink", "happy"] as const)
      : pick(ctx.rnd, ["round", "almond", "happy", "wink", "sleepy", "dot", "round", "almond"] as const);
  const dx = 10;
  const y = 48.5;

  const one = (cx: number, which: "l" | "r"): string => {
    // "wink" is two eyes: open on the left, happy-arc on the right.
    const s: Exclude<EyeStyle, "wink"> =
      style === "wink" ? (which === "r" ? "happy" : "almond") : style;
    switch (s) {
      case "round":
        return `<circle cx="${cx}" cy="${y}" r="3.6" fill="${INK}"/><circle cx="${cx + 1.1}" cy="${y - 1.2}" r="1.1" fill="#fff"/>`;
      case "dot":
        return `<circle cx="${cx}" cy="${y}" r="2.4" fill="${INK}"/>`;
      case "almond":
        return (
          `<path d="M${cx - 5.2} ${y} q5.2 -5.6 10.4 0 q-5.2 4.6 -10.4 0 Z" fill="#fff"${ink(ctx, 1.6)}/>` +
          `<circle cx="${cx}" cy="${y - 0.3}" r="2.9" fill="${iris.base}"/><circle cx="${cx}" cy="${y - 0.3}" r="1.5" fill="${INK}"/>` +
          `<circle cx="${cx - 0.9}" cy="${y - 1.4}" r="0.9" fill="#fff"/>`
        );
      case "wide":
        return (
          `<ellipse cx="${cx}" cy="${y}" rx="5.4" ry="6" fill="#fff"${ink(ctx, 1.6)}/>` +
          `<circle cx="${cx}" cy="${y + 0.4}" r="3.6" fill="${iris.base}"/><circle cx="${cx}" cy="${y + 0.4}" r="1.9" fill="${INK}"/>` +
          `<circle cx="${cx - 1.2}" cy="${y - 1.2}" r="1.2" fill="#fff"/><circle cx="${cx + 1.3}" cy="${y + 1.6}" r="0.7" fill="#fff"/>`
        );
      case "happy":
        return `<path d="M${cx - 5} ${y + 1.4} q5 -6.4 10 0" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`;
      case "sleepy":
        return (
          `<path d="M${cx - 5} ${y - 1.6} q5 5.2 10 -0.4" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>` +
          `<path d="M${cx - 3.6} ${y + 2.4} l2.4 .8" stroke="${INK}" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>`
        );
    }
  };

  return { svg: one(50 - dx, "l") + one(50 + dx, "r"), iris };
}

function brows(ctx: Ctx): string {
  const { hair, mode } = ctx;
  const c = mode === "line" ? INK : hair.shade;
  const variant = Math.floor(ctx.rnd() * 4);
  const brow = (cx: number, flip: 1 | -1): string => {
    switch (variant) {
      case 0:
        return `<path d="M${cx - 5} 39.5 q5 -3.4 10 -0.6" stroke="${c}" stroke-width="2.3" fill="none" stroke-linecap="round"/>`;
      case 1:
        return `<path d="M${cx - 5} 40 q5 -4 10 0.4" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
      case 2:
        return `<path d="M${cx - 4.6} 40.6 q4.6 -5 9.6 -1.6" stroke="${c}" stroke-width="2.1" fill="none" stroke-linecap="round"/>`;
      default:
        return `<path d="M${cx - 5} 39 q5 ${-2.6 * flip} 10 0" stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    }
  };
  return brow(40, 1) + brow(60, -1);
}

function nose(ctx: Ctx): string {
  const { skin, mode } = ctx;
  const c = mode === "line" ? INK : skin.shade;
  switch (Math.floor(ctx.rnd() * 3)) {
    case 0:
      return `<path d="M50 52 q-2.2 4.6 1.4 4.8" stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
    case 1:
      return `<ellipse cx="50" cy="55.5" rx="2.4" ry="1.7" fill="${c}" opacity="${mode === "line" ? "1" : ".85"}"/>`;
    default:
      return `<path d="M48.6 51.5 q-1.8 4.4 1.2 4.9 q2.4 .4 1.6 -1" stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  }
}

function mouth(ctx: Ctx, doodle: boolean, smileBias = false): string {
  const { rnd, mode } = ctx;
  const lip = mode === "line" ? INK : "#8c4038";
  const variant = smileBias ? pick(rnd, [1, 1, 0, 0, 4] as const) : Math.floor(rnd() * (doodle ? 5 : 6));
  switch (variant) {
    case 0: // soft smile
      return `<path d="M43.5 62 q6.5 5.4 13 0" stroke="${lip}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
    case 1: // open grin with teeth
      return (
        `<path d="M42 60.5 q8 3 16 0 q-3.2 8.4 -8 8.4 q-4.8 0 -8 -8.4 Z" fill="${mode === "line" ? PAPER.base : "#7b3330"}"${ink(ctx, 1.8)}/>` +
        `<path d="M44.4 61.3 q5.6 1.8 11.2 0 l-1 2.6 q-4.6 1.2 -9.2 0 Z" fill="#ffffff"${mode === "line" ? ` stroke="${INK}" stroke-width="1.2"` : ""}/>`
      );
    case 2: // neutral
      return `<path d="M44.5 63.5 h11" stroke="${lip}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 3: // smirk
      return `<path d="M44 63 q6.5 3.6 12.5 -2" stroke="${lip}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 4: // small o
      return `<ellipse cx="50" cy="63.5" rx="3.2" ry="3.8" fill="${mode === "line" ? PAPER.base : "#7b3330"}"${ink(ctx, 1.8)}/>`;
    default: // lips
      return (
        `<path d="M43.5 62.5 q6.5 -3.4 13 0 q-6.5 6 -13 0 Z" fill="${mode === "line" ? PAPER.base : "#b0555d"}"${ink(ctx, 1.8)}/>` +
        `<path d="M44.5 62.4 q5.5 1.4 11 0" stroke="${mode === "line" ? "#ffffff" : "#8c4038"}" stroke-width="1.1" fill="none"/>`
      );
  }
}

function blush(ctx: Ctx): string {
  if (!chance(ctx.rnd, 0.4)) return "";
  const c = ctx.mode === "line" ? "rgba(0,0,0,.10)" : "rgba(226,120,120,.32)";
  return `<ellipse cx="35.5" cy="57" rx="4.6" ry="2.7" fill="${c}"/><ellipse cx="64.5" cy="57" rx="4.6" ry="2.7" fill="${c}"/>`;
}

function freckles(ctx: Ctx): string {
  if (!chance(ctx.rnd, 0.35)) return "";
  const c = ctx.mode === "line" ? "rgba(0,0,0,.35)" : "rgba(150,90,60,.45)";
  const dots: string[] = [];
  for (const cx of [37, 40, 60, 63]) {
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * 2.4 + (ctx.rnd() - 0.5);
      const y = 55 + (i % 2) * 2.2 + (ctx.rnd() - 0.5);
      dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.75" fill="${c}"/>`);
    }
  }
  return dots.join("");
}

function accessory(ctx: Ctx): string {
  const roll = ctx.rnd();
  const { mode } = ctx;
  if (roll < 0.62) return "";
  if (roll < 0.78) {
    // round glasses
    const frame = mode === "line" ? INK : "#2c2c33";
    return (
      `<circle cx="40" cy="48.5" r="7.4" fill="${mode === "line" ? PAPER.base : "rgba(255,255,255,.28)"}" stroke="${frame}" stroke-width="1.9"/>` +
      `<circle cx="60" cy="48.5" r="7.4" fill="${mode === "line" ? PAPER.base : "rgba(255,255,255,.28)"}" stroke="${frame}" stroke-width="1.9"/>` +
      `<path d="M47.4 48.5 h5.2" stroke="${frame}" stroke-width="1.9"/>`
    );
  }
  if (roll < 0.9) {
    // headphones
    const band = mode === "line" ? INK : "#3a3a44";
    const cup = mode === "line" ? PAPER.base : "#e4585f";
    return (
      `<path d="M27 44 C27 22 38 14 50 14 C62 14 73 22 73 44" fill="none" stroke="${band}" stroke-width="3.6" stroke-linecap="round"/>` +
      `<rect x="22.5" y="42" width="9" height="13" rx="4.5" fill="${cup}"${ink(ctx)}/>` +
      `<rect x="68.5" y="42" width="9" height="13" rx="4.5" fill="${cup}"${ink(ctx)}/>`
    );
  }
  // cap
  const cap = mode === "line" ? INK : pick(ctx.rnd, ["#c94f43", "#3f6fb5", "#3f7d6a", "#d9a441"] as const);
  return (
    `<path d="M28 38 C28 22 38 14 50 14 C62 14 72 22 72 38 L72 41 L28 41 Z" fill="${cap}"${ink(ctx)}/>` +
    `<path d="M72 38 C78 38 82 39.5 82 41.5 L72 44 Z" fill="${cap}"${ink(ctx, 1.8)}/>` +
    `<path d="M28 41 h44" stroke="${mode === "line" ? INK : "rgba(0,0,0,.25)"}" stroke-width="1.4"/>`
  );
}

// ------------------------------------------------------------ composer

interface PortraitOpts {
  mode: "flat" | "line";
  expressive?: boolean;
  doodle?: boolean;
  /** Fuller jaw + big-smile bias (cartoon flavour). */
  rounder?: boolean;
}

function portrait(seed: string, salt: string, opts: PortraitOpts): string {
  const rand = rng(seed, salt);
  const ctx: Ctx = {
    rnd: rand,
    mode: opts.mode,
    skin: pick(rand, SKINS),
    hair: pick(rand, HAIRS),
    shirt: pick(rand, SHIRTS),
    bg: pick(rand, BGS),
    idSalt: `${salt}-${seed}`,
  };
  const bgFill = opts.mode === "line" ? (chance(rand, 0.35) ? PAPER.shade : PAPER.base) : ctx.bg;
  const hasBack = chance(rand, opts.mode === "line" ? 0.5 : 0.45);
  const eyePair = eyes(ctx, !!opts.expressive);

  const body =
    (hasBack ? backHair(ctx) : "") +
    neckAndShoulders(ctx) +
    ears(ctx) +
    head(ctx, !!opts.rounder) +
    brows(ctx) +
    eyePair.svg +
    nose(ctx) +
    mouth(ctx, !!opts.doodle, !!opts.rounder) +
    blush(ctx) +
    (opts.expressive ? freckles(ctx) : "") +
    frontHair(ctx) +
    accessory(ctx);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bgFill}"/>${body}</svg>`;
}

// -------------------------------------------------------------- engines

export const personasEngineV2: AvatarEngine = {
  id: "personas",
  kind: "svg",
  generate: (seed) => portrait(seed, "personas", { mode: "flat" }),
};

export const questsEngine: AvatarEngine = {
  id: "quests",
  kind: "svg",
  generate: (seed) => portrait(seed, "quests", { mode: "flat", expressive: true }),
};

export const cartoonEngineV2: AvatarEngine = {
  id: "cartoon",
  kind: "svg",
  generate: (seed) => portrait(seed, "cartoon", { mode: "flat", rounder: true, expressive: true }),
};

export const inkwellEngine: AvatarEngine = {
  id: "inkwell",
  kind: "svg",
  generate: (seed) => portrait(seed, "inkwell", { mode: "line" }),
};

export const notionalEngine: AvatarEngine = {
  id: "notional",
  kind: "svg",
  generate: (seed) => portrait(seed, "notional", { mode: "line", doodle: true }),
};

// ---------------------------------------------------------------- robots

/** Bottts-grade robot: antenna array, side modules, visor with gloss. */
export const robotsEngineV2: AvatarEngine = {
  id: "robots",
  kind: "svg",
  generate(seed: string): string {
    const rand = rng(seed, "robots");
    const families = [
      { base: "#5aa9c9", dark: "#3d7f9c", light: "#a8d8e8" },
      { base: "#d97b4f", dark: "#b05c36", light: "#f2c3a4" },
      { base: "#7f8fd9", dark: "#5d6bb0", light: "#c3caf2" },
      { base: "#63b58a", dark: "#458e68", light: "#b3e0c8" },
      { base: "#d95f8a", dark: "#b04368", light: "#f2b3cb" },
      { base: "#c9a94f", dark: "#a3862f", light: "#ead9a0" },
    ];
    const fam = pick(rand, families);
    const bg = pick(rand, ["#0d1420", "#141020", "#101a18", "#1a1216", "#101418"] as const);
    const antenna = Array.from({ length: 3 }, (_, i) => {
      const x = 38 + i * 12;
      const h = 6 + Math.floor(rand() * 5);
      return (
        `<rect x="${x}" y="${30 - h}" width="4" height="${h}" rx="2" fill="${fam.light}" opacity=".9"/>` +
        `<rect x="${x - 1.5}" y="${28 - h}" width="7" height="3.5" rx="1.75" fill="${fam.dark}"/>`
      );
    }).join("");
    const gear = chance(rand, 0.85)
      ? `<rect x="14" y="52" width="10" height="24" rx="5" fill="${fam.dark}"/><rect x="76" y="52" width="10" height="24" rx="5" fill="${fam.dark}"/>`
      : "";
    const mouthVents = Array.from({ length: 5 }, (_, i) => `<rect x="${36 + i * 6}" y="76" width="3.4" height="6.5" rx="1.7" fill="#0d0f14"/>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/>${antenna}${gear}<path d="M26 38 h48 a6 6 0 0 1 6 6 v26 a8 8 0 0 1 -8 8 h-44 a8 8 0 0 1 -8 -8 v-26 a6 6 0 0 1 6 -6 Z" fill="${fam.base}"/><path d="M20 60 h60 v10 a8 8 0 0 1 -8 8 h-44 a8 8 0 0 1 -8 -8 Z" fill="${fam.dark}" opacity=".55"/><rect x="28" y="46" width="44" height="17" rx="8.5" fill="#0d0f14"/><rect x="31" y="49" width="15" height="4.6" rx="2.3" fill="#ffffff" opacity=".85"/><circle cx="62" cy="54.5" r="3.2" fill="${fam.light}"/>${mouthVents}</svg>`;
  },
};
