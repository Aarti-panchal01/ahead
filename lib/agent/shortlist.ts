// shortlist: local, 0 units. Reuses ui's ranking (lib/rank.ts): ΔE2000 to the person's hair colour plus a
// length penalty, 3 closest wigs + 1 "something new"; wraps in colour order. A texture preference moves
// matching wigs up within the closest three. Returns catalogue ids, best first.
import personasRaw from "@/catalogue/personas.json";
import { CATALOGUE } from "@/lib/catalogue";
import { LENGTHS, rankCatalogue, type HairLength } from "@/lib/rank";
import type { CatalogueItem, PlanRequest, RankedItem } from "@/lib/types";

export interface Persona {
  id: "P1" | "P2" | "P3" | "P4";
  hairColour: string;
  browColour: string;
  browDefault: string;
  length: string;
  texture: string;
}
export const PERSONAS = personasRaw as unknown as Persona[];
export const getPersona = (id?: string) => PERSONAS.find((p) => p.id === id);

/** Wraps listed when the person asks for them. */
export const WRAPS_IN_SHORTLIST = 2;

export interface ShortlistOptions {
  length?: string;
  texture?: string;
  wantsWraps?: boolean;
}

export interface Shortlist {
  ranked: RankedItem[];
  ids: string[];
  hairColour?: string;
}

const isLength = (s?: string): s is HairLength => !!s && (LENGTHS as readonly string[]).includes(s);

export function shortlistFor(req: PlanRequest, opts: ShortlistOptions = {}, catalogue: CatalogueItem[] = CATALOGUE): Shortlist {
  const persona = getPersona(req.personaId);
  const hair = req.hairColour ?? persona?.hairColour;
  const wantLength = opts.length ?? req.preferences?.length;
  const length = isLength(wantLength) ? wantLength : isLength(persona?.length) ? persona.length : undefined;
  const texture = (opts.texture ?? req.preferences?.texture)?.toLowerCase();
  const wantsWraps = opts.wantsWraps ?? req.preferences?.wantsWraps ?? false;

  // Curated demo wigs only for a sample person with their own recorded colour (no override).
  const curatedFor = persona && !req.hairColour ? persona.id : undefined;
  const { wigs, wraps } = rankCatalogue(catalogue, { hair, length, curatedFor });

  let closest = wigs.filter((w) => w.reason === "closest");
  const fresh = wigs.filter((w) => w.reason === "something_new");
  if (texture) {
    const match = (r: RankedItem) => (r.item.texture === texture ? 0 : 1);
    closest = closest.map((r, i) => ({ r, i })).sort((a, b) => match(a.r) - match(b.r) || a.i - b.i).map((x) => x.r);
  }
  const ranked = [...closest, ...fresh, ...(wantsWraps ? wraps.slice(0, WRAPS_IN_SHORTLIST) : [])];
  return { ranked, ids: ranked.map((r) => r.item.id), hairColour: hair };
}
