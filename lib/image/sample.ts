// Colours read locally from the user's photo (0 units): hair (from the hair mask) and brows (from the brow polygons).

import type { SampledColours } from "@/lib/types";
import { hexToLab, labToHex, rgbToLab, type Lab } from "./colour";
import { BROW_LEFT, BROW_RIGHT, faceWidth, hasFace, scaledPolygon, toPixels, type Landmarks } from "./landmarks";
import { channelsOf, fillPolygon, median, percentile, type RawImage } from "./raw";

export const SAMPLING = {
  /** Hair: keep pixels between these lightness percentiles (drops highlights and deep shadow). */
  hairTrim: [15, 85] as const,
  /** Hair: fewer pixels than this x face width squared means "not enough hair to read" (a bald head). */
  minHairArea: 0.05,
  /** Brows: the darkest band of brow-polygon pixels, as lightness percentiles. */
  browBand: [10, 30] as const,
  /** Brows: the band must be at least this much darker (L*) than the skin ring around the brows to count as brow. */
  minBrowContrast: 6,
  /** Brows: polygons grown this much for the skin ring. */
  browRing: 2.2,
  /** browDefault: this much darker in L*. */
  browDarken: 10,
} as const;

/** Category-mask class for hair (selfie_multiclass_256x256). */
export const HAIR_CLASS = 1;

/** A 0/1 hair mask from a selfie-multiclass category mask. */
export function hairMaskFromCategories(category: Uint8Array): Uint8Array {
  const out = new Uint8Array(category.length);
  for (let i = 0; i < category.length; i++) out[i] = category[i] === HAIR_CLASS ? 1 : 0;
  return out;
}

function medianLab(labs: Lab[]): Lab {
  return [median(labs.map((l) => l[0])), median(labs.map((l) => l[1])), median(labs.map((l) => l[2]))];
}

/**
 * Hair colour: median Lab of hair-mask pixels whose L* lies in the 15th to 85th percentile.
 * Brow colour: median Lab of the darkest 10 to 30% of the pixels inside the brow outlines, only when that band is
 * clearly darker than the skin just around the brows (otherwise there is no brow to read).
 * hairMask: same size as the photo, nonzero = hair (see hairMaskFromCategories). Landmarks normalised.
 */
export function sampleColours(photo: RawImage, landmarks: Landmarks | null | undefined, hairMask?: Uint8Array | null): SampledColours {
  const ch = channelsOf(photo);
  const { width: W, height: H, data } = photo;
  const lab = (i: number) => rgbToLab(data[i * ch], data[i * ch + 1], data[i * ch + 2]);
  const face = hasFace(landmarks) ? toPixels(landmarks, W, H) : null;
  const out: SampledColours = { hairPixels: 0, browPixels: 0 };

  if (hairMask) {
    if (hairMask.length !== W * H) throw new Error("The hair mask must be the size of the photo");
    const labs: Lab[] = [];
    for (let i = 0; i < hairMask.length; i++) if (hairMask[i]) labs.push(lab(i));
    out.hairPixels = labs.length;
    // Without a face we cannot judge "enough"; fall back to 0.5% of the photo.
    const minArea = face ? SAMPLING.minHairArea * faceWidth(face) ** 2 : 0.005 * W * H;
    if (labs.length >= Math.max(1, minArea)) {
      const Ls = labs.map((l) => l[0]);
      const lo = percentile(Ls, SAMPLING.hairTrim[0]), hi = percentile(Ls, SAMPLING.hairTrim[1]);
      const kept = labs.filter((l) => l[0] >= lo && l[0] <= hi);
      out.hair = labToHex(medianLab(kept.length ? kept : labs));
    }
  }

  if (face) {
    const brow = new Uint8Array(W * H);
    for (const idx of [BROW_LEFT, BROW_RIGHT]) fillPolygon(scaledPolygon(face, idx, 1), W, H, brow);
    const ring = new Uint8Array(W * H);
    for (const idx of [BROW_LEFT, BROW_RIGHT]) fillPolygon(scaledPolygon(face, idx, SAMPLING.browRing), W, H, ring);
    const browLabs: Lab[] = [];
    const skinL: number[] = [];
    for (let i = 0; i < brow.length; i++) {
      if (brow[i]) browLabs.push(lab(i));
      else if (ring[i] && !(hairMask && hairMask[i])) skinL.push(lab(i)[0]);
    }
    if (browLabs.length) {
      const Ls = browLabs.map((l) => l[0]);
      const lo = percentile(Ls, SAMPLING.browBand[0]), hi = percentile(Ls, SAMPLING.browBand[1]);
      const band = browLabs.filter((l) => l[0] >= lo && l[0] <= hi);
      const colour = medianLab(band.length ? band : browLabs);
      const skin = skinL.length ? median(skinL) : NaN;
      // Brow pixels = pixels in the outline clearly darker than the skin around it.
      const cut = Number.isFinite(skin) ? skin - SAMPLING.minBrowContrast : -Infinity;
      out.browPixels = Ls.filter((L) => L <= cut).length;
      if (!Number.isFinite(skin) || colour[0] <= cut) out.brows = labToHex(colour);
    }
  }
  return out;
}

/** CLAUDE.md brow default: the user's own brow colour, same hue (a*, b* kept), about 10 L* darker. */
export function browDefault(browHex: string): string {
  const [L, a, b] = hexToLab(browHex);
  return labToHex([Math.max(0, L - SAMPLING.browDarken), a, b]);
}
