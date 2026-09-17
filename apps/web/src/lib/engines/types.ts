export type SVGString = string;

export interface AvatarEngine {
  id: string;
  kind: "svg";
  generate(seed: string, options?: Record<string, unknown>): SVGString;
}

/** Procedural animated engine: renders GIF bytes directly (no SVG step). */
export interface AnimatedEngine {
  id: string;
  kind: "gif";
  generate(seed: string, options?: Record<string, unknown>): Uint8Array;
}
