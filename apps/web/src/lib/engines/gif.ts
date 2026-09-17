/**
 * Minimal GIF89a encoder (pure TS, no deps). Built for procedural avatar
 * frames: small dimensions, tiny palettes, full-frame updates. Output is
 * deterministic given the same input — byte-cacheable like everything else.
 */

export interface GifFrame {
  width: number;
  height: number;
  /** Row-major palette indices, length === width * height. */
  pixels: Uint8Array;
  /** Frame delay in centiseconds. */
  delayCs: number;
}

export type Rgb = [number, number, number];

function ceilLog2(n: number): number {
  let b = 0;
  let v = 1;
  while (v < n) {
    v <<= 1;
    b++;
  }
  return b;
}

/** Standard LZW compressor with clear-code resets, codes up to 12 bits.
 * Growth rule: the code size grows right after the table gains the entry at
 * index 2^size (nextCode passes 2^size). A standard decoder grows at the
 * mirror point (table length reaches 2^size), so both sides stay bit-aligned.
 * Verified by omggif round-trips in engines.test.ts — do not "fix" the `>`
 * into `===` without re-running those tests. */
function lzwCompress(minCodeSize: number, pixels: Uint8Array): number[] {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoi + 1;
  const dict = new Map<number, number>();
  const out: number[] = [];
  let bits = 0;
  let bitLen = 0;
  const emit = (code: number, size: number) => {
    bits |= code << bitLen;
    bitLen += size;
    while (bitLen >= 8) {
      out.push(bits & 0xff);
      bits >>= 8;
      bitLen -= 8;
    }
  };
  emit(clear, codeSize);
  let prefix: number | null = null;
  for (let i = 0; i < pixels.length; i++) {
    const k = pixels[i]!;
    if (prefix === null) {
      prefix = k;
      continue;
    }
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix, codeSize);
    if (nextCode >= 4096) {
      emit(clear, codeSize);
      dict.clear();
      codeSize = minCodeSize + 1;
      nextCode = eoi + 1;
      prefix = k;
      continue;
    }
    dict.set(key, nextCode++);
    if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
    prefix = k;
  }
  if (prefix !== null) emit(prefix, codeSize);
  emit(eoi, codeSize);
  if (bitLen > 0) out.push(bits & 0xff);
  return out;
}

function subBlocks(data: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

export function encodeGif(frames: GifFrame[], palette: Rgb[], loopForever = true): Uint8Array {
  if (frames.length === 0) throw new Error("encodeGif needs at least one frame");
  const { width, height } = frames[0]!;
  for (const f of frames) {
    if (f.width !== width || f.height !== height) throw new Error("all GIF frames must share dimensions");
    if (f.pixels.length !== width * height) throw new Error("frame pixel count mismatch");
  }
  const colorBits = Math.max(1, ceilLog2(Math.max(2, palette.length)));
  const tableSize = 1 << colorBits;
  const minCodeSize = Math.max(2, colorBits);

  const out: number[] = [];
  const ascii = (s: string) => {
    for (const c of s) out.push(c.charCodeAt(0));
  };
  const u16 = (v: number) => {
    out.push(v & 0xff, (v >> 8) & 0xff);
  };

  ascii("GIF89a");
  u16(width);
  u16(height);
  out.push(0x80 | ((colorBits - 1) << 4) | (colorBits - 1)); // GCT flag + resolution + size
  out.push(0); // background index
  out.push(0); // pixel aspect
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] ?? [0, 0, 0];
    out.push(c[0] & 0xff, c[1] & 0xff, c[2] & 0xff);
  }

  if (frames.length > 1 && loopForever) {
    ascii("\x21\xFF\x0BNETSCAPE2.0");
    out.push(3, 1, 0, 0, 0); // loop count 0 = forever
  }

  for (const f of frames) {
    out.push(0x21, 0xf9, 4); // graphics control extension
    out.push(0x04); // disposal method 1 (leave in place), no transparency
    u16(Math.max(0, Math.min(65535, Math.round(f.delayCs))));
    out.push(0, 0); // transparent index + terminator
    out.push(0x2c); // image descriptor
    u16(0);
    u16(0);
    u16(width);
    u16(height);
    out.push(0); // no local table, non-interlaced
    out.push(minCodeSize);
    out.push(...subBlocks(lzwCompress(minCodeSize, f.pixels)));
  }
  out.push(0x3b); // trailer
  return Uint8Array.from(out);
}
