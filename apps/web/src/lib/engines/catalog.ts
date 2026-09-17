/**
 * Style catalog: the single source of truth for browsing UIs (landing page,
 * /styles index, /styles/[id] detail). Engine behaviour still lives in
 * registry.ts — this only adds human-facing metadata.
 */

export type StyleCategory = "characters" | "line" | "abstract" | "pixel" | "animated";
export type StyleKind = "svg" | "gif";

export interface StyleMeta {
  id: string;
  kind: StyleKind;
  category: StyleCategory;
  name: string;
  description: string;
  formats: Array<"svg" | "png" | "gif">;
}

function s(
  id: string,
  category: StyleCategory,
  name: string,
  description: string,
  kind: StyleKind = "svg",
): StyleMeta {
  return {
    id,
    kind,
    category,
    name,
    description,
    formats: kind === "gif" ? ["gif"] : ["svg", "png"],
  };
}

export const STYLES: readonly StyleMeta[] = [
  // Characters — layered illustration
  s("personas", "characters", "Personas", "Friendly illustrated portraits with layered hair, expressive eyes and varied outfits."),
  s("quests", "characters", "Quests", "Adventurer-style characters with big expressive eyes, freckles and bold hair."),
  s("cartoon", "characters", "Cartoon", "Simple cartoon faces with a playful smile and hair variety."),
  s("anime", "characters", "Anime", "Large-eyed anime faces with blush and layered fringe."),
  s("robots", "characters", "Robots", "Bots with antenna arrays, side modules and glossy visors."),
  s("droids", "characters", "Droids", "Rounded dome bots with visors and antenna."),
  s("animals", "characters", "Animals", "Cat-like creatures with whiskers, ear shapes and markings."),
  s("fantasy", "characters", "Fantasy", "Wizards and wanderers with pointed hats and glowing gems."),
  s("business", "characters", "Business", "Shirt-and-tie portraits for professional contexts."),
  s("gaming", "characters", "Gaming", "Controllers and buttons for player identities."),
  s("cyberpunk", "characters", "Cyberpunk", "Neon visors and scanlines for sci-fi identities."),
  // Line art
  s("inkwell", "line", "Inkwell", "High-contrast ink illustrations: filled hair, fine lines, no colour noise."),
  s("notional", "line", "Notional", "Hand-drawn outline doodles with a notebook feel."),
  // Abstract & geometric
  s("geometric", "abstract", "Geometric", "Concentric geometric compositions."),
  s("abstract", "abstract", "Abstract", "Layered bezier blobs in complementary hues."),
  s("bauhaus", "abstract", "Bauhaus", "Quarter-circle compositions in primary colours."),
  s("rings", "abstract", "Rings", "Patterned concentric rings with a centre glyph."),
  s("waves", "abstract", "Waves", "Layered sine-wave bands."),
  s("orbits", "abstract", "Orbits", "Planets, rings and moons placed by hash."),
  s("minimal", "abstract", "Minimal", "Duotone discs and bars — quiet and small."),
  // Pixel & retro
  s("pixel-art", "pixel", "Pixel Art", "Crisp 8×8 sprites, retro-game ready."),
  s("identicons", "pixel", "Identicons", "Mirrored 5×5 blocks derived from the seed."),
  s("mixed", "pixel", "Mixed", "A deterministic pick across the static styles — variety per seed."),
  // Animated
  s("blink", "animated", "Blink", "A pixel face that blinks, looping forever.", "gif"),
  s("orb", "animated", "Orb", "A dashed ring sweeping around a glowing core.", "gif"),
  s("rain", "animated", "Rain", "Drops falling through a starfield.", "gif"),
];

export const CATEGORY_LABELS: Record<StyleCategory, string> = {
  characters: "Characters",
  line: "Line art",
  abstract: "Abstract & geometric",
  pixel: "Pixel & retro",
  animated: "Animated",
};

export const CATEGORY_ORDER: StyleCategory[] = ["characters", "line", "abstract", "pixel", "animated"];

export function stylesByCategory(): Array<{ category: StyleCategory; label: string; styles: StyleMeta[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    styles: STYLES.filter((x) => x.category === category),
  })).filter((g) => g.styles.length > 0);
}

export function findStyle(id: string): StyleMeta | undefined {
  return STYLES.find((x) => x.id === id);
}

export const STYLE_COUNT = STYLES.length;
export const SVG_STYLE_COUNT = STYLES.filter((x) => x.kind === "svg").length;
export const GIF_STYLE_COUNT = STYLES.filter((x) => x.kind === "gif").length;
