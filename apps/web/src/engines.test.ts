import { EngineTypeSchema } from "@nicebear/shared-types";
import { GifReader } from "omggif";
import { describe, expect, it } from "vitest";
import { encodeGif, type Rgb } from "./lib/engines/gif";
import { getAnimated, getEngine, listAnimated, listEngines } from "./lib/engines/registry";

/** Decode all frames to RGBA with the independent omggif implementation. */
function decodeAll(gif: Uint8Array): { width: number; height: number; frames: Uint8ClampedArray[] } {
  const reader = new GifReader(Buffer.from(gif));
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < reader.numFrames(); i++) {
    const rgba = new Uint8ClampedArray(reader.width * reader.height * 4);
    reader.decodeAndBlitFrameRGBA(i, rgba);
    frames.push(rgba);
  }
  return { width: reader.width, height: reader.height, frames };
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("engine registry (§6)", () => {
  it("implements every engine_type in the shared schema", () => {
    const registered = new Set([...listEngines(), ...listAnimated()]);
    for (const id of EngineTypeSchema.options) {
      expect(registered.has(id), `missing engine: ${id}`).toBe(true);
    }
  });

  it("generates deterministic, well-formed SVG for every svg engine", () => {
    for (const id of listEngines()) {
      const engine = getEngine(id)!;
      const a = engine.generate("e2e-seed");
      const b = engine.generate("e2e-seed");
      expect(a, id).toBe(b);
      expect(a.startsWith("<svg"), id).toBe(true);
      expect(a.endsWith("</svg>"), id).toBe(true);
      expect(a.length, id).toBeGreaterThan(100);
      expect(a, `${id} has unsubstituted values`).not.toMatch(/NaN|undefined/);
    }
  });

  it("generates deterministic GIFs that omggif decodes frame-perfect", () => {
    for (const id of listAnimated()) {
      const engine = getAnimated(id)!;
      const a = engine.generate("e2e-seed");
      const b = engine.generate("e2e-seed");
      expect(Buffer.from(a).equals(Buffer.from(b)), `${id} deterministic`).toBe(true);
      const { width, height, frames } = decodeAll(a);
      expect([width, height], `${id} dimensions`).toEqual([64, 64]);
      expect(frames.length, `${id} animates`).toBeGreaterThan(1);
      // Every pixel must be opaque (our frames have no transparency).
      for (const [i, rgba] of frames.entries()) {
        for (let p = 3; p < rgba.length; p += 4) {
          expect(rgba[p], `${id} frame ${i} alpha`).toBe(255);
        }
      }
      // Frames actually differ (not a static image in a GIF container).
      const first = Buffer.from(frames[0]!);
      expect(frames.slice(1).some((f) => !Buffer.from(f).equals(first)), `${id} varies`).toBe(true);
    }
  });

  it("round-trips random frames pixel-exact through omggif", () => {
    // Exercises LZW growth, clears, and multi-frame framing across alphabets.
    for (let trial = 0; trial < 12; trial++) {
      const rand = mulberry(1234 + trial);
      const colors = 2 + Math.floor(rand() * 14);
      const palette: Rgb[] = Array.from({ length: colors }, () => [
        Math.floor(rand() * 256),
        Math.floor(rand() * 256),
        Math.floor(rand() * 256),
      ]);
      const w = 8 + Math.floor(rand() * 56);
      const h = 8 + Math.floor(rand() * 56);
      const nFrames = 1 + Math.floor(rand() * 4);
      // Mix compressible runs with noise to stress clear-code paths.
      const frames = Array.from({ length: nFrames }, (_, f) => {
        const pixels = new Uint8Array(w * h);
        for (let i = 0; i < pixels.length; i++) {
          pixels[i] = rand() < 0.6 ? (i + f) % colors : Math.floor(rand() * colors);
        }
        return { width: w, height: h, pixels, delayCs: 10 };
      });
      const gif = encodeGif(frames, palette);
      const decoded = decodeAll(gif);
      expect(decoded.frames.length, `trial ${trial} frame count`).toBe(nFrames);
      decoded.frames.forEach((rgba, f) => {
        const want = frames[f]!;
        for (let i = 0; i < want.pixels.length; i++) {
          const c = palette[want.pixels[i]!]!;
          expect([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]], `trial ${trial} frame ${f} px ${i}`).toEqual(c);
        }
      });
    }
  });

  it("mixed picks deterministically per seed", () => {
    const m = getEngine("mixed")!;
    expect(m.generate("s1")).toBe(m.generate("s1"));
    // Across many seeds, mixed exercises more than one base engine.
    const outs = new Set(Array.from({ length: 20 }, (_, i) => m.generate(`seed-${i}`)));
    expect(outs.size).toBeGreaterThan(1);
  });

  it("snapshots every svg engine (catches accidental geometry changes)", () => {
    const shots: Record<string, string> = {};
    for (const id of listEngines()) {
      shots[id] = getEngine(id)!.generate("snapshot-seed");
    }
    expect(shots).toMatchSnapshot();
  });
});
