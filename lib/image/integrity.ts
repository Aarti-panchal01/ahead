// The integrity check (CLAUDE.md "Core rule: integrity on every render").
// Measure skin on both cheeks, the nose bridge and the chin of the original and of the YouCam render (median Lab of a
// small patch, CIEDE2000 and delta L*). Above ΔE2000 2, paste the original inner face back onto the render with a
// feathered mask that stays clear of the hairline, re-measure, and say in plain words what was corrected.
// Pure: raw pixels in, raw pixels out. lib/image/browser.ts turns the corrected pixels into a data URL.

import type { IntegrityRegionResult, IntegrityReport } from "@/lib/types";
import { deltaE2000, rgbToLab, type Lab } from "./colour";
import {
  BROW_TOP,
  CHIN,
  FACE_LEFT,
  FACE_OVAL,
  FACE_RIGHT,
  INTEGRITY_REGIONS,
  faceWidth,
  hasFace,
  skinSamplePoints,
  toPixels,
  type Landmarks,
} from "./landmarks";
import {
  channelsOf,
  clipHalfPlane,
  convexHull,
  gaussianBlur,
  median,
  rampPolygon,
  resize,
  resizeMask,
  type Point,
  type RawImage,
  type RawImageOut,
} from "./raw";

/** CLAUDE.md: above ΔE2000 2 we correct. */
export const INTEGRITY_THRESHOLD = 2;
/** Patch radius as a fraction of face width (234 to 454). */
export const PATCH_RADIUS = 0.04;
/** A patch must keep at least this share of its pixels after hair is left out, or the region is not measured. */
export const MIN_SKIN_SHARE = 0.25;

/** Inner-face paste mask shape, as fractions of face width. */
export const PASTE = {
  /** Shrink the face outline across the face (towards the centre) so side hair and wig edges are left alone. */
  shrinkAcross: 0.9,
  /** Shrink along the face (chin side); small, the chin must stay inside. */
  shrinkAlong: 0.97,
  /** The mask stops this far above the top of the brows: the forehead above may be under hair. */
  aboveBrows: 0.02,
  /** Width of the smooth edge, inside the mask. */
  feather: 0.05,
  /** Blur of the hair masks before hair is cut out of the paste (the cut fades in over about 2 blur widths). */
  hairBlur: 0.02,
} as const;

export const PLAIN = {
  unchanged: "Skin tone check: unchanged",
  darkened: "Corrected: the try-on darkened your skin slightly, restored",
  lightened: "Corrected: the try-on lightened your skin slightly, restored",
  noFace: "Skin tone check: we could not find your face in this photo, so it was not checked",
  covered: "Skin tone check: not enough skin showing to check this render",
  notRestored: "Skin tone check: the try-on changed your skin tone and we could not fully restore it",
} as const;

/** IntegrityReport with the corrected image still as raw pixels (the browser adapter makes the URL). */
export interface IntegrityCoreReport extends Omit<IntegrityReport, "correctedImage"> {
  correctedImage?: RawImageOut;
}

/** Optional hair masks (nonzero = hair), each the size of its own image. */
export interface HairMasks {
  /** Hair of the original photo (its own hair near the face is not pasted onto the render). */
  original?: Uint8Array;
  /** Hair of the render (a wig's strands over the face are never pasted over). */
  result?: Uint8Array;
}

export interface IntegrityOptions {
  /** Hair pixels are left out of the skin patches and out of the paste. Recommended for every wig render. */
  hairMasks?: HairMasks;
  /** Defaults to INTEGRITY_THRESHOLD. */
  threshold?: number;
}

/**
 * Median Lab of a disc of radius r around pt (clipped to the image), leaving out pixels where `exclude` is nonzero.
 * Null if fewer than MIN_SKIN_SHARE of the disc is usable (off the image, or under hair).
 */
export function patchLab(img: RawImage, pt: Point, r: number, exclude?: Uint8Array): Lab | null {
  const ch = channelsOf(img);
  const { width: w, height: h, data } = img;
  const x0 = Math.max(0, Math.floor(pt[0] - r)), x1 = Math.min(w - 1, Math.ceil(pt[0] + r));
  const y0 = Math.max(0, Math.floor(pt[1] - r)), y1 = Math.min(h - 1, Math.ceil(pt[1] + r));
  const L: number[] = [], A: number[] = [], B: number[] = [];
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - pt[0], dy = y + 0.5 - pt[1];
      if (dx * dx + dy * dy > r2) continue;
      if (exclude && exclude[y * w + x]) continue;
      const o = (y * w + x) * ch;
      const lab = rgbToLab(data[o], data[o + 1], data[o + 2]);
      L.push(lab[0]);
      A.push(lab[1]);
      B.push(lab[2]);
    }
  }
  if (L.length === 0 || L.length < MIN_SKIN_SHARE * Math.PI * r2) return null;
  return [median(L), median(A), median(B)];
}

function checkMask(mask: Uint8Array | undefined, img: RawImage, name: string) {
  if (mask && mask.length !== img.width * img.height) throw new Error(`The ${name} hair mask must be the size of the ${name} image`);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Skin change between the original and the render, per region: ΔE2000 and ΔL* (render minus original; negative =
 * darker). The images may differ in size (YouCam returns the long side <= 1024): the normalised landmarks are scaled
 * to each image, and the patch radius is 4% of the face width in each. Landmarks are the original's.
 * With hair masks, hair pixels are left out of the patches, and a region mostly under hair is left out of the list.
 */
export function measureSkin(original: RawImage, result: RawImage, landmarks: Landmarks, hairMasks: HairMasks = {}): IntegrityRegionResult[] {
  if (!hasFace(landmarks)) throw new Error("No face landmarks to measure");
  checkMask(hairMasks.original, original, "original");
  checkMask(hairMasks.result, result, "result");
  const po = toPixels(landmarks, original.width, original.height);
  const pr = toPixels(landmarks, result.width, result.height);
  const so = skinSamplePoints(po), sr = skinSamplePoints(pr);
  const ro = Math.max(2, faceWidth(po) * PATCH_RADIUS), rr = Math.max(2, faceWidth(pr) * PATCH_RADIUS);
  const out: IntegrityRegionResult[] = [];
  for (const region of INTEGRITY_REGIONS) {
    const a = patchLab(original, so[region], ro, hairMasks.original);
    const b = patchLab(result, sr[region], rr, hairMasks.result);
    if (a && b) out.push({ region, deltaE2000: round2(deltaE2000(a, b)), deltaL: round2(b[0] - a[0]) });
  }
  return out;
}

/**
 * The paste mask for the inner face, at width x height: the face outline shrunk across the face, cut off just above
 * the brows, with a smooth edge that lies entirely inside (so nothing outside the outline is touched). Hair (optional,
 * a 0/nonzero mask at width x height) is cut out with a soft edge that reaches 0 before the hair starts. Values 0..1.
 */
export function innerFaceMask(landmarks: Landmarks, width: number, height: number, hairMask?: Uint8Array): Float32Array {
  const px = toPixels(landmarks, width, height);
  const fw = faceWidth(px);
  // Face frame: u across the face (image left to right), v down the face (towards the chin).
  const ux0 = px[FACE_RIGHT][0] - px[FACE_LEFT][0], uy0 = px[FACE_RIGHT][1] - px[FACE_LEFT][1];
  const ul = Math.hypot(ux0, uy0) || 1;
  const u: Point = [ux0 / ul, uy0 / ul];
  let v: Point = [-u[1], u[0]];
  let cx = 0, cy = 0;
  for (const i of FACE_OVAL) {
    cx += px[i][0];
    cy += px[i][1];
  }
  cx /= FACE_OVAL.length;
  cy /= FACE_OVAL.length;
  if ((px[CHIN][0] - cx) * v[0] + (px[CHIN][1] - cy) * v[1] < 0) v = [-v[0], -v[1]];

  const shrunk = FACE_OVAL.map((i): Point => {
    const dx = px[i][0] - cx, dy = px[i][1] - cy;
    const a = (dx * u[0] + dy * u[1]) * PASTE.shrinkAcross;
    const b = (dx * v[0] + dy * v[1]) * PASTE.shrinkAlong;
    return [cx + a * u[0] + b * v[0], cy + a * u[1] + b * v[1]];
  });
  let top = Infinity;
  for (const i of BROW_TOP) top = Math.min(top, (px[i][0] - cx) * v[0] + (px[i][1] - cy) * v[1]);
  top -= PASTE.aboveBrows * fw;
  const poly = clipHalfPlane(convexHull(shrunk), [cx + top * v[0], cy + top * v[1]], v);
  const alpha = rampPolygon(poly, width, height, Math.max(1, PASTE.feather * fw));

  if (hairMask) {
    if (hairMask.length !== width * height) throw new Error("The hair mask must be the size of the render");
    const hair = new Float32Array(hairMask.length);
    for (let i = 0; i < hair.length; i++) hair[i] = hairMask[i] ? 1 : 0;
    const soft = gaussianBlur(hair, width, height, Math.max(0.5, PASTE.hairBlur * fw));
    // soft is 0.5 on a straight hair edge and falls off outside it: full paste at soft 0, none from soft 0.25 up.
    for (let i = 0; i < alpha.length; i++) {
      if (!(alpha[i] > 0)) continue;
      const t = Math.min(1, soft[i] * 4);
      alpha[i] *= 1 - t * t * (3 - 2 * t);
    }
  }
  return alpha;
}

/** out = base * (1 - alpha) + top * alpha, at base's size and channel count (top must be the same size). */
export function blend(base: RawImage, top: RawImage, alpha: Float32Array): RawImageOut {
  const cb = channelsOf(base), ct = channelsOf(top);
  if (top.width !== base.width || top.height !== base.height) throw new Error("blend: images differ in size");
  const out = new Uint8ClampedArray(base.data);
  const n = base.width * base.height;
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    if (!(a > 0)) continue;
    for (let c = 0; c < 3; c++) out[i * cb + c] = base.data[i * cb + c] * (1 - a) + top.data[i * ct + c] * a;
  }
  return { data: out, width: base.width, height: base.height };
}

/** Paste the original inner face onto the render (at the render size). Used by integrityCheck; exported for tests. */
export function restoreInnerFace(
  original: RawImage,
  result: RawImage,
  landmarks: Landmarks,
  hairMasks: HairMasks = {},
): { image: RawImageOut; mask: Float32Array } {
  const { width: W, height: H } = result;
  checkMask(hairMasks.original, original, "original");
  checkMask(hairMasks.result, result, "result");
  const base = original.width === W && original.height === H ? original : resize(original, W, H);
  let hair: Uint8Array | undefined;
  if (hairMasks.original || hairMasks.result) {
    const o = hairMasks.original && resizeMask(hairMasks.original, original.width, original.height, W, H);
    const r = hairMasks.result;
    hair = new Uint8Array(W * H);
    for (let i = 0; i < hair.length; i++) hair[i] = (o && o[i]) || (r && r[i]) ? 1 : 0;
  }
  const mask = innerFaceMask(landmarks, W, H, hair);
  return { image: blend(result, base, mask), mask };
}

const worst = (rs: IntegrityRegionResult[]) => Math.max(...rs.map((r) => r.deltaE2000));

/**
 * Check one render against the photo it was made from. `original` must be the exact image sent to YouCam (for a full
 * look, the brow-composited photo, so the paste keeps the new brows). Landmarks are the original's, normalised.
 */
export function integrityCheck(
  original: RawImage,
  result: RawImage,
  landmarks: Landmarks | null | undefined,
  options: IntegrityOptions = {},
): IntegrityCoreReport {
  const threshold = options.threshold ?? INTEGRITY_THRESHOLD;
  if (!hasFace(landmarks)) return { status: "failed", regions: [], plainText: PLAIN.noFace };
  const masks = options.hairMasks ?? {};
  const regions = measureSkin(original, result, landmarks, masks);
  if (regions.length === 0) return { status: "failed", regions, plainText: PLAIN.covered };
  if (worst(regions) <= threshold) return { status: "unchanged", regions, plainText: PLAIN.unchanged };

  const corrected = restoreInnerFace(original, result, landmarks, masks).image;
  const after = measureSkin(original, corrected, landmarks, masks);
  if (after.length === 0 || worst(after) > threshold) return { status: "failed", regions, after, plainText: PLAIN.notRestored };

  const tripped = regions.filter((r) => r.deltaE2000 > threshold);
  const meanDL = tripped.reduce((s, r) => s + r.deltaL, 0) / tripped.length;
  return {
    status: "corrected",
    regions,
    after,
    plainText: meanDL > 0 ? PLAIN.lightened : PLAIN.darkened,
    correctedImage: corrected,
  };
}
