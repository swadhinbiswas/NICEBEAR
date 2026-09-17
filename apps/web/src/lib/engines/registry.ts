import { geometricEngine } from "./geometric";
import { identiconEngine } from "./identicon";
import { pixelArtEngine } from "./pixel-art";
import {
  abstractEngine,
  animeEngine,
  animalsEngine,
  businessEngine,
  cartoonEngine,
  cyberpunkEngine,
  fantasyEngine,
  gamingEngine,
  minimalEngine,
  robotsEngine,
} from "./procedural";
import { hashStringToUint32 } from "../rotation/hash";
import type { AvatarEngine } from "./types";

/**
 * Pluggable registry (§6). Add a new engine by dropping a file in engines/
 * and registering it here — no rotation/storage changes needed.
 */
const engines = new Map<string, AvatarEngine>([
  [identiconEngine.id, identiconEngine],
  [pixelArtEngine.id, pixelArtEngine],
  [geometricEngine.id, geometricEngine],
  [robotsEngine.id, robotsEngine],
  [cartoonEngine.id, cartoonEngine],
  [animeEngine.id, animeEngine],
  [minimalEngine.id, minimalEngine],
  [businessEngine.id, businessEngine],
  [fantasyEngine.id, fantasyEngine],
  [gamingEngine.id, gamingEngine],
  [cyberpunkEngine.id, cyberpunkEngine],
  [abstractEngine.id, abstractEngine],
  [animalsEngine.id, animalsEngine],
]);

const BASE_IDS = [...engines.keys()];

/** `mixed`: deterministic per-seed pick across all base engines. */
export const mixedEngine: AvatarEngine = {
  id: "mixed",
  generate(seed: string, options?: Record<string, unknown>): string {
    const pick = BASE_IDS[hashStringToUint32(`mixed:${seed}`) % BASE_IDS.length]!;
    return engines.get(pick)!.generate(seed, options);
  },
};
engines.set(mixedEngine.id, mixedEngine);

export function registerEngine(engine: AvatarEngine): void {
  engines.set(engine.id, engine);
}

export function getEngine(id: string): AvatarEngine | undefined {
  return engines.get(id);
}

export function listEngines(): string[] {
  return [...engines.keys()];
}

export function engineCacheKey(engine: string, seed: string, options?: Record<string, unknown>): string {
  const optHash = options ? JSON.stringify(options) : "";
  return `engine:${engine}:${seed}:${optHash}`;
}
