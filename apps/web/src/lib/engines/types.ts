export type SVGString = string;

export interface AvatarEngine {
  id: string;
  generate(seed: string, options?: Record<string, unknown>): SVGString;
}
