// The four sample people (all AI-generated). A = with their hair, B = hair gone.
// Hair colours are PRECOMPUTED, not sampled at runtime: the median of hand-picked hair-only boxes
// on each A image (x, y, w, h in the 821x1024 file), checked by eye so no wall, skin or ear is inside.
// Precomputing keeps the ranking stable and testable; a runtime sample of a sample person would
// only re-measure a photo that never changes. A real photo is sampled in the browser (sampleColours).
import type { HairLossStage } from "@/lib/types";

export type SampleId = "P1" | "P2" | "P3" | "P4";

export interface SamplePerson {
  id: SampleId;
  label: string;
  /** Short plain description for alt text and the picker. */
  description: string;
  hair: string;
  /** Hair-only boxes the colour was measured from (x, y, w, h). */
  hairBoxes: [number, number, number, number][];
  length: "pixie" | "chin" | "shoulder" | "long";
}

export const SAMPLE_PEOPLE: SamplePerson[] = [
  { id: "P1", label: "Sample person 1", description: "a woman with shoulder-length grey curls", hair: "#888585", hairBoxes: [[145, 320, 75, 220], [270, 150, 260, 70]], length: "shoulder" },
  { id: "P2", label: "Sample person 2", description: "a woman with a straight ash-brown bob", hair: "#6E5A4A", hairBoxes: [[195, 250, 60, 360], [330, 165, 200, 50]], length: "shoulder" },
  { id: "P3", label: "Sample person 3", description: "a woman with black coily hair", hair: "#1D1C21", hairBoxes: [[330, 135, 200, 70]], length: "chin" },
  { id: "P4", label: "Sample person 4", description: "a woman with straight black hair to the shoulders", hair: "#191B21", hairBoxes: [[278, 340, 28, 300]], length: "shoulder" },
];

export function getSample(id: string | null | undefined): SamplePerson | undefined {
  return SAMPLE_PEOPLE.find((p) => p.id === id);
}

export const beforeImage = (id: SampleId) => `/personas/${id}A.jpg`;
export const goneImage = (id: SampleId) => `/personas/${id}B.jpg`;

/** The photo we show as "you" on the results screen. */
export function heroImage(id: SampleId, stage: HairLossStage): string {
  return stage === "gone" ? goneImage(id) : beforeImage(id);
}

/**
 * The face sent to the try-on API. Recordings exist for the B (hair gone) photos only, and a wig
 * covers the head either way, so every stage renders on B for now. Change here if A recordings land.
 */
export function tryOnFace(id: SampleId): string {
  return `${id}B`;
}
