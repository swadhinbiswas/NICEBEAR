import { blinkEngine, orbEngine, rainEngine } from "./animated";
import { bauhausEngine, droidsEngine, orbitsEngine, ringsEngine, wavesEngine } from "./gallery";
import { geometricEngine } from "./geometric";
import { identiconEngine } from "./identicon";
import { pixelArtEngine } from "./pixel-art";
import {
  abstractEngine,
  animeEngine,
  animalsEngine,
  businessEngine,
  cyberpunkEngine,
  fantasyEngine,
  gamingEngine,
  minimalEngine,
} from "./procedural";
import {
  cartoonEngineV2,
  inkwellEngine,
  notionalEngine,
  personasEngineV2,
  questsEngine,
  robotsEngineV2,
} from "./studio";
import { hashStringToUint32 } from "../rotation/hash";
import type { AnimatedEngine, AvatarEngine } from "./types";

/**
 * Pluggable registry (§6). Add a new engine by dropping a file in engines/
 * and registering it here — no rotation/storage changes needed.
 */
const engines = new Map<string, AvatarEngine>([
  [identiconEngine.id, identiconEngine],
  [pixelArtEngine.id, pixelArtEngine],
  [geometricEngine.id, geometricEngine],
  [robotsEngineV2.id, robotsEngineV2],
  [cartoonEngineV2.id, cartoonEngineV2],
  [animeEngine.id, animeEngine],
  [minimalEngine.id, minimalEngine],
  [businessEngine.id, businessEngine],
  [fantasyEngine.id, fantasyEngine],
  [gamingEngine.id, gamingEngine],
  [cyberpunkEngine.id, cyberpunkEngine],
  [abstractEngine.id, abstractEngine],
  [animalsEngine.id, animalsEngine],
  [personasEngineV2.id, personasEngineV2],
  [questsEngine.id, questsEngine],
  [inkwellEngine.id, inkwellEngine],
  [notionalEngine.id, notionalEngine],
  [droidsEngine.id, droidsEngine],
  [bauhausEngine.id, bauhausEngine],
  [ringsEngine.id, ringsEngine],
  [wavesEngine.id, wavesEngine],
  [orbitsEngine.id, orbitsEngine],
]);

const BASE_IDS = [...engines.keys()];

/** `mixed`: deterministic per-seed pick across all base engines. */
export const mixedEngine: AvatarEngine = {
  id: "mixed",
  kind: "svg",
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

const animated = new Map<string, AnimatedEngine>([
  [blinkEngine.id, blinkEngine],
  [orbEngine.id, orbEngine],
  [rainEngine.id, rainEngine],
]);

export function registerAnimated(engine: AnimatedEngine): void {
  animated.set(engine.id, engine);
}

export function getAnimated(id: string): AnimatedEngine | undefined {
  return animated.get(id);
}

export function listAnimated(): string[] {
  return [...animated.keys()];
}

export function listEngines(): string[] {
  return [...engines.keys()];
}

export function engineCacheKey(engine: string, seed: string, options?: Record<string, unknown>): string {
  const optHash = options ? JSON.stringify(options) : "";
  return `engine:${engine}:${seed}:${optHash}`;
}
