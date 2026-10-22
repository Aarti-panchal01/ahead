// Feature compositing (brows: port of reference/killtest/brow_composite.py).
// makeup-vto lightens the whole face (~+5 L*), so only the feature is taken from the render, with the global shift
// (median RGB difference on a skin ring around the feature) removed, blended onto the original. Everything else stays
// the original's pixels.
// - brows: each brow polygon grown ~35% around its centre, Gaussian-feathered (~1.2% of face width).
// - lashes: a thin band along each upper and lower lid line (out from the eye, longer on the upper lid, tapering to
//   the inner corner, a little into the lid), lightly feathered; the skin ring is around the eyes, eyes themselves left out.

import type { FeatureKind } from "@/lib/types";
import {
  BROW_LEFT,
  BROW_RIGHT,
  LID_LOWER_LEFT,
  LID_LOWER_RIGHT,
  LID_UPPER_LEFT,
  LID_UPPER_RIGHT,
  faceWidth,
  hasFace,
  scaledPolygon,
  toPixels,
  type Landmarks,
} from "./landmarks";
import { channelsOf, fillPolygon, gaussianBlur, median, resize, type Point, type RawImage, type RawImageOut } from "./raw";

export const BROW_COMPOSITE = {
  /** Brow polygon growth around its own centre. */
  grow: 1.35,
  /** Gaussian feather sigma, fraction of face width. */
  feather: 0.012,
  /** The skin ring for the global shift: brow polygons grown this much, minus the (feathered) brow mask. */
  ring: 2.2,
} as const;

export const LASH_COMPOSITE = {
  /** Upper lashes: band reaches this far out from the lid (fraction of face width) at the middle of the lid. */
  upperOut: 0.05,
  /** Lower lashes: shorter. */
  lowerOut: 0.03,
  /** The band also covers this much of the lid itself (into the eye), for the lash roots and liner line. */
  inset: 0.006,
  /** Share of the band length kept at the inner corner (full length at the outer corner, where lashes flare). */
  cornerTaper: 0.35,
  /** Gaussian feather sigma, fraction of face width. Wide enough that the lid edge (sharp, and resampled differently by YouCam) leaves no seam. */
  feather: 0.014,
  /** The skin ring for the global shift: the eye outline grown this much, minus the eye and the lash band. */
  ring: 2.4,
} as const;

/** Band along a lid line: out from the eye centre by `out` (tapering to the inner corner), into it by `inset`. Pixels. */
function lidBand(px: readonly Point[], lid: readonly number[], centre: Point, out: number, inset: number): Point[] {
  const n = lid.length;
  const outer: Point[] = [], inner: Point[] = [];
  for (let k = 0; k < n; k++) {
    const p = px[lid[k]];
    const dx = p[0] - centre[0], dy = p[1] - centre[1];
    const len = Math.hypot(dx, dy) || 1;
    const taper = 1 - (1 - LASH_COMPOSITE.cornerTaper) * (k / (n - 1)) ** 1.5; // lid lines run outer -> inner corner
    outer.push([p[0] + (dx / len) * out * taper, p[1] + (dy / len) * out * taper]);
    inner.push([p[0] - (dx / len) * inset, p[1] - (dy / len) * inset]);
  }
  return [...outer, ...inner.reverse()];
}

/** Hard feature mask, feather sigma and skin ring (0/1, outside the feathered mask is left out later), W x H. */
function featureMasks(feature: FeatureKind, px: readonly Point[], W: number, H: number): { hard: Uint8Array; sigma: number; ring: Uint8Array } {
  const fw = faceWidth(px);
  const hard = new Uint8Array(W * H), ring = new Uint8Array(W * H);
  if (feature === "brows") {
    for (const idx of [BROW_LEFT, BROW_RIGHT]) fillPolygon(scaledPolygon(px, idx, BROW_COMPOSITE.grow), W, H, hard);
    for (const idx of [BROW_LEFT, BROW_RIGHT]) fillPolygon(scaledPolygon(px, idx, BROW_COMPOSITE.ring), W, H, ring);
    return { hard, sigma: fw * BROW_COMPOSITE.feather, ring };
  }
  for (const [upper, lower] of [[LID_UPPER_LEFT, LID_LOWER_LEFT], [LID_UPPER_RIGHT, LID_LOWER_RIGHT]] as const) {
    const eye = [...upper, ...[...lower].reverse()];
    let cx = 0, cy = 0;
    for (const i of eye) {
      cx += px[i][0];
      cy += px[i][1];
    }
    const centre: Point = [cx / eye.length, cy / eye.length];
    // The hard band is grown by the feather so the blurred mask still reaches ~1 on the lashes themselves.
    const grow = LASH_COMPOSITE.feather * fw;
    fillPolygon(lidBand(px, upper, centre, LASH_COMPOSITE.upperOut * fw + grow, LASH_COMPOSITE.inset * fw + grow / 2), W, H, hard);
    fillPolygon(lidBand(px, lower, centre, LASH_COMPOSITE.lowerOut * fw + grow, LASH_COMPOSITE.inset * fw + grow / 2), W, H, hard);
    const grown = new Uint8Array(W * H), inside = new Uint8Array(W * H);
    fillPolygon(scaledPolygon(px, eye, LASH_COMPOSITE.ring), W, H, grown);
    fillPolygon(eye.map((i) => px[i]), W, H, inside);
    for (let i = 0; i < ring.length; i++) if (grown[i] && !inside[i]) ring[i] = 1;
  }
  return { hard, sigma: fw * LASH_COMPOSITE.feather, ring };
}

export interface FeatureComposite {
  image: RawImageOut;
  /** Feather mask used (0..1), at the render's size. */
  mask: Float32Array;
  /** Global RGB shift removed from the render (render minus original, median on the skin ring). */
  shift: [number, number, number];
}

/**
 * Paste only `feature` from a makeup-vto render back onto the original. Output is at the render's size (the frame
 * YouCam saw), with the render's channel count. Landmarks are the original's, normalised.
 */
export function compositeFeatureDetailed(original: RawImage, result: RawImage, feature: FeatureKind, landmarks: Landmarks): FeatureComposite {
  if (feature !== "brows" && feature !== "lashes") throw new Error(`Unknown feature: ${String(feature)}`);
  if (!hasFace(landmarks)) throw new Error(`No face landmarks for the ${feature} composite`);
  const { width: W, height: H } = result;
  const o = original.width === W && original.height === H ? original : resize(original, W, H);
  const co = channelsOf(o), cr = channelsOf(result);
  const px = toPixels(landmarks, W, H);

  const { hard, sigma, ring } = featureMasks(feature, px, W, H);
  const mask = gaussianBlur(Float32Array.from(hard), W, H, sigma);

  const diffs: [number[], number[], number[]] = [[], [], []];
  for (let i = 0; i < ring.length; i++) {
    if (!ring[i] || mask[i] >= 10 / 255) continue;
    for (let c = 0; c < 3; c++) diffs[c].push(result.data[i * cr + c] - o.data[i * co + c]);
  }
  const shift: [number, number, number] = diffs[0].length ? [median(diffs[0]), median(diffs[1]), median(diffs[2])] : [0, 0, 0];

  const out = new Uint8ClampedArray(W * H * cr);
  for (let i = 0; i < W * H; i++) {
    const a = mask[i];
    for (let c = 0; c < 3; c++) {
      const r = Math.min(255, Math.max(0, result.data[i * cr + c] - shift[c]));
      out[i * cr + c] = o.data[i * co + c] * (1 - a) + r * a;
    }
    if (cr === 4) out[i * 4 + 3] = 255;
  }
  return { image: { data: out, width: W, height: H }, mask, shift };
}

/** compositeFeature(original, result, "brows" | "lashes", landmarks): the composited image only. */
export function compositeFeature(original: RawImage, result: RawImage, feature: FeatureKind, landmarks: Landmarks): RawImageOut {
  return compositeFeatureDetailed(original, result, feature, landmarks).image;
}
