// Catalogue ranking for one person (local, 0 units). Every usable wig competes; nothing is special-cased.
//
// Wigs: score = ΔE2000(hair, wig colour) + a penalty per step of length difference + a penalty per step of
// texture difference. The 3 lowest scores are "closest"; then 1 "something new": a different length (when we
// know theirs), chosen as the closest colour with the biggest change of shape.
// A real photo gives us a colour only (length and texture are unknown), so it is ranked on colour alone.
// Wraps are not matched to hair; they are listed in colour order, closest first.
import { deltaE2000, hexToLab } from "@/lib/client/image";
import type { CatalogueItem, RankedItem } from "@/lib/types";

export const LENGTHS = ["pixie", "chin", "shoulder", "long"] as const;
export type HairLength = (typeof LENGTHS)[number];

/** Ordered from straightest to tightest curl, so "steps" is meaningful. */
export const TEXTURES = ["straight", "wavy", "curly", "coily"] as const;
export type HairTexture = (typeof TEXTURES)[number];

/** ΔE2000 units added per step of length difference (pixie -> chin is one step). */
export const LENGTH_STEP_PENALTY = 6;
/** ΔE2000 units added per step of texture difference (straight -> wavy is one step). */
export const TEXTURE_STEP_PENALTY = 4;

/**
 * "Close to your hair" only below this ΔE2000.
 * Why 6: ΔE2000 of about 1 is the smallest difference most people see with two patches side by side, and 2 is
 * where we call skin "changed" in the integrity check. Hair is not one flat colour and our reading of it from a
 * photo is approximate (docs/api-truth-table.md row 9), so a stricter bar would promise more than we can measure.
 * Up to about 6 the two swatches read as the same shade with a small shift; past 10 they read as a different
 * colour. In our catalogue the matches we would stand behind are 1.0 to 4.6, the next nearest is 5.6 (an ash brown
 * against a salt-and-pepper wig, visibly greyer), so 6 keeps "close" honest. Anything above gets a neutral label.
 */
export const CLOSE_DELTA_E = 6;

export interface RankInput {
  /** Measured hair colour, "#RRGGBB". Missing when there is no hair to read. */
  hair?: string;
  /** Known for sample people; unknown for a real photo. */
  length?: HairLength;
  texture?: HairTexture;
}

export interface Ranking {
  wigs: RankedItem[];
  wraps: RankedItem[];
  /** True when length and texture were part of the match (sample people), false for colour only. */
  usedShape: boolean;
}

const steps = <T extends string>(order: readonly T[], a?: string, b?: string) => {
  const i = order.indexOf(a as T), j = order.indexOf(b as T);
  return i < 0 || j < 0 ? 0 : Math.abs(i - j);
};
const lengthSteps = (a?: string, b?: string) => steps(LENGTHS, a, b);
const textureSteps = (a?: string, b?: string) => steps(TEXTURES, a, b);

const usable = (items: CatalogueItem[], kind: CatalogueItem["kind"]) =>
  items.filter((x) => x.kind === kind && x.usableAsReference);

const byId = (a: CatalogueItem, b: CatalogueItem) => a.id.localeCompare(b.id);

export function rankCatalogue(catalogue: CatalogueItem[], input: RankInput): Ranking {
  const wigs = usable(catalogue, "wig");
  const wraps = usable(catalogue, "wrap");
  const dist = (x: CatalogueItem) => (input.hair ? deltaE2000(input.hair, x.colour) : 0);

  let closest: CatalogueItem[];
  if (input.hair) {
    const score = (x: CatalogueItem) =>
      dist(x) + LENGTH_STEP_PENALTY * lengthSteps(input.length, x.length) + TEXTURE_STEP_PENALTY * textureSteps(input.texture, x.texture);
    closest = [...wigs].sort((a, b) => score(a) - score(b) || byId(a, b)).slice(0, 3);
  } else {
    // No hair colour to match: a spread from dark to light so there is something for everyone.
    const byL = [...wigs].sort((a, b) => hexToLab(a.colour).L - hexToLab(b.colour).L || byId(a, b));
    const n = byL.length;
    closest = n <= 3 ? byL : [byL[0], byL[Math.floor(n / 2)], byL[n - 1]];
  }

  // Something new: a different length from theirs (or from the top match when we don't know theirs). Among those,
  // the colour stays close and a bigger change of length is rewarded, at the same rate it is penalised above.
  const base = input.length ?? closest[0]?.length;
  const rest = wigs.filter((x) => !closest.includes(x));
  const different = rest.filter((x) => lengthSteps(base, x.length) > 0);
  const pool = different.length ? different : rest;
  const newness = (x: CatalogueItem) => dist(x) - LENGTH_STEP_PENALTY * lengthSteps(base, x.length);
  const fresh = [...pool].sort((a, b) => newness(a) - newness(b) || byId(a, b))[0];

  const ranked: RankedItem[] = closest.map((item) => ({ item, colourDistance: dist(item), reason: "closest" }));
  if (fresh) ranked.push({ item: fresh, colourDistance: dist(fresh), reason: "something_new" });

  return {
    wigs: ranked,
    wraps: [...wraps]
      .sort((a, b) => dist(a) - dist(b) || byId(a, b))
      .map((item) => ({ item, colourDistance: dist(item), reason: "closest" as const })),
    usedShape: Boolean(input.length || input.texture),
  };
}

export type MatchLabel = "close" | "neutral" | "new";

/** Which chip a wig card gets. "close" only when the colour really is close (CLOSE_DELTA_E), never by rank alone. */
export function matchLabel(r: RankedItem, hasHair: boolean): MatchLabel {
  if (r.reason === "something_new") return "new";
  return hasHair && r.colourDistance < CLOSE_DELTA_E ? "close" : "neutral";
}

/** The chip text. `whose` is "your" for an own photo, "her" for a sample person. */
export function matchLabelText(label: MatchLabel, whose: "your" | "her"): string {
  if (label === "close") return `Close to ${whose} hair`;
  if (label === "new") return "Something new";
  return "Worth a look";
}
