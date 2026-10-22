// Catalogue ranking for one person (local, 0 units).
// Wigs: the 3 closest to the person's hair (colour distance plus a length penalty), then
// 1 "something new": the furthest length from theirs, in the closest colour among the rest.
// Wraps are not matched to hair; they are listed in colour order, closest first.
import { deltaE2000, hexToLab } from "@/lib/client/image";
import type { CatalogueItem, RankedItem } from "@/lib/types";

export const LENGTHS = ["pixie", "chin", "shoulder", "long"] as const;
export type HairLength = (typeof LENGTHS)[number];

/** ΔE units added per step of length difference (pixie -> chin is one step). */
export const LENGTH_STEP_PENALTY = 6;

export interface RankInput {
  /** Measured hair colour, "#RRGGBB". Missing when there is no hair to read. */
  hair?: string;
  length?: HairLength;
  /**
   * Sample people only: the catalogue was curated per person (CatalogueItem.matches) and the demo
   * recordings exist for those wigs, so the 3 closest are ranked WITHIN that person's curated wigs.
   * Leave unset for a real photo: then all wigs compete on colour and length.
   */
  curatedFor?: "P1" | "P2" | "P3" | "P4";
}

export interface Ranking {
  wigs: RankedItem[];
  wraps: RankedItem[];
}

const steps = (a?: string, b?: string) => {
  const i = LENGTHS.indexOf(a as HairLength), j = LENGTHS.indexOf(b as HairLength);
  return i < 0 || j < 0 ? 0 : Math.abs(i - j);
};

const usable = (items: CatalogueItem[], kind: CatalogueItem["kind"]) =>
  items.filter((x) => x.kind === kind && x.usableAsReference);

export function rankCatalogue(catalogue: CatalogueItem[], input: RankInput): Ranking {
  const wigs = usable(catalogue, "wig");
  const wraps = usable(catalogue, "wrap");
  const dist = (x: CatalogueItem) => (input.hair ? deltaE2000(input.hair, x.colour) : 0);
  const byId = (a: CatalogueItem, b: CatalogueItem) => a.id.localeCompare(b.id);

  let closest: CatalogueItem[];
  const curated = input.curatedFor ? wigs.filter((x) => x.matches === input.curatedFor) : [];
  if (input.hair) {
    const pool = curated.length ? curated : wigs;
    const score = (x: CatalogueItem) => dist(x) + LENGTH_STEP_PENALTY * steps(input.length, x.length);
    closest = [...pool].sort((a, b) => score(a) - score(b) || byId(a, b)).slice(0, 3);
  } else {
    // No hair colour to match: a spread from dark to light so there is something for everyone.
    const byL = [...wigs].sort((a, b) => hexToLab(a.colour).L - hexToLab(b.colour).L || byId(a, b));
    const n = byL.length;
    closest = n <= 3 ? byL : [byL[0], byL[Math.floor(n / 2)], byL[n - 1]];
  }

  const rest = wigs.filter((x) => !closest.includes(x));
  const far = (x: CatalogueItem) => steps(input.length ?? closest[0]?.length, x.length);
  const fresh = [...rest].sort((a, b) => far(b) - far(a) || dist(a) - dist(b) || byId(a, b))[0];

  const ranked: RankedItem[] = closest.map((item) => ({ item, colourDistance: dist(item), reason: "closest" }));
  if (fresh) ranked.push({ item: fresh, colourDistance: dist(fresh), reason: "something_new" });

  return {
    wigs: ranked,
    wraps: [...wraps]
      .sort((a, b) => dist(a) - dist(b) || byId(a, b))
      .map((item) => ({ item, colourDistance: dist(item), reason: "closest" as const })),
  };
}
