// shortlist: local, 0 units. Reuses ui's ranking (lib/rank.ts): every usable wig scored by ΔE2000 to the
// person's hair colour plus length and texture penalties, 3 closest + 1 "something new"; wraps in colour order.
// A sample person's known length and texture are used; preferences override them. Returns ids, best first.
import personasRaw from "@/catalogue/personas.json";
import { CATALOGUE } from "@/lib/catalogue";
import { LENGTHS, rankCatalogue, TEXTURES, type HairLength, type HairTexture } from "@/lib/rank";
import type { CatalogueItem, PlanRequest, RankedItem } from "@/lib/types";

export interface Persona {
  id: "P1" | "P2" | "P3" | "P4";
  hairColour: string;
  browColour: string;
  browDefault: string;
  length: string;
  texture: string;
  /** The wigs and wraps this sample person has saved recordings for: her whole catalogue. */
  recordedWigs: string[];
  recordedWraps: string[];
}
export const PERSONAS = personasRaw as unknown as Persona[];
export const getPersona = (id?: string) => PERSONAS.find((p) => p.id === id);

/**
 * The catalogue this person may see. A sample person: ONLY her recorded wigs and wraps (every try-on is a saved
 * recording, so nothing else can be shown). An own photo: the whole catalogue.
 */
export function catalogueFor(req: Pick<PlanRequest, "personaId">, catalogue: CatalogueItem[] = CATALOGUE): CatalogueItem[] {
  const persona = getPersona(req.personaId);
  if (!persona) return catalogue;
  const ids = new Set([...persona.recordedWigs, ...persona.recordedWraps]);
  return catalogue.filter((x) => ids.has(x.id));
}

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
const isTexture = (s?: string): s is HairTexture => !!s && (TEXTURES as readonly string[]).includes(s);

export function shortlistFor(req: PlanRequest, opts: ShortlistOptions = {}, catalogue: CatalogueItem[] = catalogueFor(req)): Shortlist {
  const persona = getPersona(req.personaId);
  const hair = req.hairColour ?? persona?.hairColour;
  const wantLength = opts.length ?? req.preferences?.length;
  const length = isLength(wantLength) ? wantLength : isLength(persona?.length) ? persona.length : undefined;
  const wantTexture = (opts.texture ?? req.preferences?.texture)?.toLowerCase();
  const texture = isTexture(wantTexture) ? wantTexture : isTexture(persona?.texture) ? persona.texture : undefined;
  const wantsWraps = opts.wantsWraps ?? req.preferences?.wantsWraps ?? false;

  const { wigs, wraps } = rankCatalogue(catalogue, { hair, length, texture });
  const closest = wigs.filter((w) => w.reason === "closest");
  const fresh = wigs.filter((w) => w.reason === "something_new");
  const ranked = [...closest, ...fresh, ...(wantsWraps ? wraps.slice(0, WRAPS_IN_SHORTLIST) : [])];
  return { ranked, ids: ranked.map((r) => r.item.id), hairColour: hair };
}
