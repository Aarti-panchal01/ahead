// The four sample people (all AI-generated). A = with their hair, B = hair gone.
// Hair and brow colours, length and texture come from catalogue/personas.json (measured once on the A photos by
// the lab, so the ranking stays stable and testable). A real photo is sampled in the browser (sampleColours).
import raw from "@/catalogue/personas.json";
import type { HairLossStage } from "@/lib/types";
import type { HairLength, HairTexture } from "@/lib/rank";

export type SampleId = "P1" | "P2" | "P3" | "P4";

interface PersonaJson {
  id: SampleId;
  name: string;
  hairColour: string;
  browColour: string;
  browDefault: string;
  length: HairLength;
  texture: HairTexture;
}

export interface SamplePerson {
  id: SampleId;
  label: string;
  /** Short plain description for alt text and the picker. */
  description: string;
  /** Measured hair colour on the A photo, "#RRGGBB". */
  hair: string;
  /** Measured brow colour on the A photo. */
  brows: string;
  /** The brow colour the brows render used (her own brow colour, about 10 L* darker). */
  browDefault: string;
  length: HairLength;
  texture: HairTexture;
  /**
   * A hair-only square on the A photo (x, y, size in the 821x1024 file) for the match card.
   * Picked by eye and checked as a crop: no skin, wall or ear inside.
   */
  hairCrop: [number, number, number];
}

const EXTRA: Record<SampleId, { description: string; hairCrop: [number, number, number] }> = {
  P1: { description: "a woman with long grey curls", hairCrop: [580, 440, 80] },
  P2: { description: "a woman with a straight ash-brown bob", hairCrop: [170, 420, 90] },
  P3: { description: "a woman with black coily hair", hairCrop: [400, 130, 80] },
  P4: { description: "a woman with a straight black bob", hairCrop: [600, 520, 65] },
};

export const SAMPLE_PEOPLE: SamplePerson[] = (raw as PersonaJson[]).map((p) => ({
  id: p.id,
  label: p.name,
  description: EXTRA[p.id].description,
  hair: p.hairColour,
  brows: p.browColour,
  browDefault: p.browDefault,
  length: p.length,
  texture: p.texture,
  hairCrop: EXTRA[p.id].hairCrop,
}));

export function getSample(id: string | null | undefined): SamplePerson | undefined {
  return SAMPLE_PEOPLE.find((p) => p.id === id);
}

export const PERSONA_SIZE = { width: 821, height: 1024 } as const;

export const beforeImage = (id: SampleId) => `/personas/${id}A.jpg`;
export const goneImage = (id: SampleId) => `/personas/${id}B.jpg`;

/** Her photo with hair gone and brows drawn at her own brow colour (makeup-vto, composited: skin unchanged). */
export function browsImage(id: SampleId): string {
  return id === "P1" ? "/api/fixtures/hero__P1B__browsB" : `/api/fixtures/rec__${id}B__browsB`;
}

/** The photo we show on the results screen. With hair gone, brows are on by default (see lib/client/brows.ts). */
export function heroImage(id: SampleId, stage: HairLossStage, brows = false): string {
  if (stage !== "gone") return beforeImage(id);
  return brows ? browsImage(id) : goneImage(id);
}

/**
 * The face sent to the try-on API. Recordings exist for the B (hair gone) photos only, and a wig
 * covers the head either way, so every stage renders on B. Brows are added afterwards in the browser.
 */
export function tryOnFace(id: SampleId): string {
  return `${id}B`;
}
