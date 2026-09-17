declare module "omggif" {
  export class GifReader {
    constructor(data: Uint8Array | Buffer);
    width: number;
    height: number;
    numFrames(): number;
    decodeAndBlitFrameRGBA(frame: number, pixels: Uint8ClampedArray | Uint8Array): void;
  }
}
