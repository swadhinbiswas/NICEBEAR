import { hashStringToUint32 } from "../rotation/hash";
import { encodeGif, type GifFrame, type Rgb } from "./gif";
import type { AnimatedEngine } from "./types";

const W = 64;
const H = 64;

type Px = Uint8Array;

function blank(fill = 0): Px {
  return new Uint8Array(W * H).fill(fill);
}

function setPx(px: Px, x: number, y: number, c: number): void {
  if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c;
}

function fillCircle(px: Px, cx: number, cy: number, r: number, c: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPx(px, x, y, c);
    }
  }
}

function fillRect(px: Px, x0: number, y0: number, w: number, h: number, c: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(px, x, y, c);
}

function frame(pixels: Px, delayCs: number): GifFrame {
  return { width: W, height: H, pixels, delayCs };
}

/** Blinking identicon face: open, open, shut, open. */
export const blinkEngine: AnimatedEngine = {
  id: "blink",
  kind: "gif",
  generate(seed: string): Uint8Array {
    const h = hashStringToUint32(`blink:${seed}`);
    const bg: Rgb = [15 + (h % 20), 20 + (h % 20), 40 + (h % 30)];
    const fg: Rgb = [(h >> 3) % 256, (h >> 5) % 200 + 40, (h >> 7) % 200 + 40];
    const eye: Rgb = [240, 240, 245];
    const palette: Rgb[] = [bg, fg, eye];
    const open = (): Px => {
      const px = blank(0);
      fillCircle(px, 32, 34, 22, 1);
      fillRect(px, 20, 28, 8, 10, 2);
      fillRect(px, 36, 28, 8, 10, 2);
      fillRect(px, 26, 48, 12, 3, 0);
      return px;
    };
    const shut = (): Px => {
      const px = blank(0);
      fillCircle(px, 32, 34, 22, 1);
      fillRect(px, 20, 32, 8, 2, 2);
      fillRect(px, 36, 32, 8, 2, 2);
      fillRect(px, 26, 48, 12, 3, 0);
      return px;
    };
    return encodeGif(
      [frame(open(), 60), frame(open(), 8), frame(shut(), 10), frame(open(), 90)],
      palette,
    );
  },
};

/** Rotating dashed orb: 8 frames of a sweeping arc. */
export const orbEngine: AnimatedEngine = {
  id: "orb",
  kind: "gif",
  generate(seed: string): Uint8Array {
    const h = hashStringToUint32(`orb:${seed}`);
    const base = h % 360;
    const bg: Rgb = [8, 8, 18];
    const ring: Rgb = [120 + (h % 100), 90 + (h % 80), 255];
    void base;
    const palette: Rgb[] = [bg, ring, [255, 255, 255]];
    const frames: GifFrame[] = [];
    for (let f = 0; f < 8; f++) {
      const px = blank(0);
      fillCircle(px, 32, 32, 9, 2);
      for (let a = 0; a < 360; a += 6) {
        const on = ((a + f * 45) % 90) < 45;
        if (!on) continue;
        const rad = (a * Math.PI) / 180;
        setPx(px, Math.round(32 + 20 * Math.cos(rad)), Math.round(32 + 20 * Math.sin(rad)), 1);
        setPx(px, Math.round(32 + 21 * Math.cos(rad)), Math.round(32 + 21 * Math.sin(rad)), 1);
      }
      frames.push(frame(px, 9));
    }
    return encodeGif(frames, palette);
  },
};

/** Pixel rain: drops falling through a starfield, 6 frames looping. */
export const rainEngine: AnimatedEngine = {
  id: "rain",
  kind: "gif",
  generate(seed: string): Uint8Array {
    const h = hashStringToUint32(`rain:${seed}`);
    const bg: Rgb = [10 + (h % 15), 14 + (h % 15), 26 + (h % 20)];
    const drop: Rgb = [80 + (h % 60), 180 + (h % 60), 255];
    const star: Rgb = [70, 90, 130];
    const palette: Rgb[] = [bg, drop, star];
    const cols = [8 + (h % 8), 22 + (h % 8), 36 + (h % 8), 50 + (h % 6)];
    const frames: GifFrame[] = [];
    for (let f = 0; f < 6; f++) {
      const px = blank(0);
      for (let y = 0; y < H; y += 6) {
        for (let x = 0; x < W; x += 6) {
          if ((x * 7 + y * 13 + h) % 11 === 0) setPx(px, x, y, 2);
        }
      }
      cols.forEach((cx, i) => {
        const y = (f * 11 + i * 17) % (H + 10);
        fillRect(px, cx, y - 8, 4, 10, 1);
        setPx(px, cx + 1, y + 3, 1);
      });
      frames.push(frame(px, 11));
    }
    return encodeGif(frames, palette);
  },
};
