// Catalogue ranking for one person (local, 0 units). Nothing is special-cased by id.
//
// Who competes: a sample person ranks only among the wigs and wraps recorded on her own face
// (personas.json recordedWigs / recordedWraps), so every card shows her wearing it. An own photo ranks across
// the whole catalogue.
//
// Wigs: score = TEXTURE_STEP_PENALTY x texture steps + LENGTH_STEP_PENALTY x length steps + ΔE2000(hair, wig).
// Texture weighs most, then length, then colour (owner's order): one texture step (30) costs as much as the
// whole length range (3 steps = 30), and one length step (10) outweighs a colour gap that still reads as the
// same family. Colour then decides between wigs of the same shape.
// The 3 lowest scores are "closest"; then 1 "something new": a different length, in the closest colour, with
// a bigger change of length rewarded.
// A real photo gives us a colour only (length and texture are unknown), so it is ranked on colour alone.
// Wraps are not matched to hair; they are listed in colour order, closest first.
import { deltaE2000, hexToLab } from "@/lib/client/image";
import type { CatalogueItem, RankedItem } from "@/lib/types";

export const LENGTHS = ["pixie", "chin", "shoulder", "long"] as const;
export type HairLength = (typeof LENGTHS)[number];

/** Ordered from straightest to tightest curl, so "steps" is meaningful. */
export const TEXTURES = ["straight", "wavy", "curly", "coily"] as const;
export type HairTexture = (typeof TEXTURES)[number];

/** Score added per step of texture difference (straight -> wavy is one step). The heaviest term. */
export const TEXTURE_STEP_PENALTY = 30;
/** Score added per step of length difference (pixie -> chin is one step). */
export const LENGTH_STEP_PENALTY = 10;

/**
 * Colour part of "close": ΔE2000 under 5.
 * ΔE2000 of about 1 is the smallest difference most people see with two patches side by side, and 2 is where we
 * call skin "changed" in the integrity check. Hair is not one flat colour and our reading of it from a photo is
 * approximate (docs/api-truth-table.md row 9), so a much stricter bar would promise more than we measure. Around 5
 * and above, two hair swatches stop reading as the same shade: the pairs we would stand behind are 1.0 to 4.6, and
 * the first pair that looks visibly different is 5.6 (P2's ash brown against W03, a greyer salt and pepper).
 */
export const CLOSE_DELTA_E = 5;

/**
 * Texture part of "close": the same family or the next one along straight - wavy - curly - coily.
 * Neighbours are close because a stylist can bridge one step (a wave can be set straighter or curlier, loose
 * curls and coils share a care routine and silhouette). Two or more steps apart (straight vs curly, wavy vs
 * coily, and always straight vs coily) is a different look, so it is never called close.
 */
export function texturesClose(a?: string, b?: string): boolean {
  const i = TEXTURES.indexOf(a as HairTexture), j = TEXTURES.indexOf(b as HairTexture);
  return i >= 0 && j >= 0 && Math.abs(i - j) <= 1;
}

export interface RankInput {
  /** Measured hair colour, "#RRGGBB". Missing when there is no hair to read. */
  hair?: string;
  /** Known for sample people; unknown for a real photo. */
  length?: HairLength;
  texture?: HairTexture;
  /** Sample people: only these ids compete (her recordings). Unset for an own photo: the whole catalogue. */
  pool?: { wigs: string[]; wraps: string[] };
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

const usable = (items: CatalogueItem[], kind: CatalogueItem["kind"], ids?: string[]) =>
  items.filter((x) => x.kind === kind && x.usableAsReference && (!ids || ids.includes(x.id)));

const byId = (a: CatalogueItem, b: CatalogueItem) => a.id.localeCompare(b.id);

export function rankCatalogue(catalogue: CatalogueItem[], input: RankInput): Ranking {
  const wigs = usable(catalogue, "wig", input.pool?.wigs);
  const wraps = usable(catalogue, "wrap", input.pool?.wraps);
  const dist = (x: CatalogueItem) => (input.hair ? deltaE2000(input.hair, x.colour) : 0);

  let closest: CatalogueItem[];
  if (input.hair) {
    const score = (x: CatalogueItem) =>
      TEXTURE_STEP_PENALTY * textureSteps(input.texture, x.texture) + LENGTH_STEP_PENALTY * lengthSteps(input.length, x.length) + dist(x);
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

/** "close": colour and texture both close. "colour": an own photo, where only the colour can be checked. */
export type MatchLabel = "close" | "colour" | "neutral" | "new";

/**
 * Which chip a wig card gets. "close" only when the colour is under CLOSE_DELTA_E AND the texture is the same
 * or a neighbour. With no known texture (an own photo) the most we can say is that the colour is close.
 */
export function matchLabel(r: RankedItem, person: { hair?: string; texture?: string }): MatchLabel {
  if (r.reason === "something_new") return "new";
  if (!person.hair || r.colourDistance >= CLOSE_DELTA_E) return "neutral";
  if (!person.texture) return "colour";
  return texturesClose(person.texture, r.item.texture) ? "close" : "neutral";
}

/** The chip text. `whose` is "your" for an own photo, "her" for a sample person. */
export function matchLabelText(label: MatchLabel, whose: "your" | "her"): string {
  if (label === "close") return `Close to ${whose} hair`;
  if (label === "colour") return `Close to ${whose} hair colour`;
  if (label === "new") return "Something new";
  return "Worth a look";
}
