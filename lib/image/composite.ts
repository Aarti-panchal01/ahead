// Feature compositing (port of reference/killtest/brow_composite.py).
// makeup-vto lightens the whole face (~+5 L*), so only the feature is taken from the render: each brow polygon grown
// ~35% around its centre, Gaussian-feathered (~1.2% of face width), with the global shift (median RGB difference on a
// skin ring around the brows) removed, blended onto the original. Everything else stays the original's pixels.

import type { FeatureKind } from "@/lib/types";
import { BROW_LEFT, BROW_RIGHT, faceWidth, hasFace, scaledPolygon, toPixels, type Landmarks } from "./landmarks";
import { channelsOf, fillPolygon, gaussianBlur, median, resize, type RawImage, type RawImageOut } from "./raw";

export const BROW_COMPOSITE = {
  /** Brow polygon growth around its own centre. */
  grow: 1.35,
  /** Gaussian feather sigma, fraction of face width. */
  feather: 0.012,
  /** The skin ring for the global shift: brow polygons grown this much, minus the (feathered) brow mask. */
  ring: 2.2,
} as const;

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
  if (feature === "lashes") throw new Error("Compositing lashes is not supported yet");
  if (feature !== "brows") throw new Error(`Unknown feature: ${String(feature)}`);
  if (!hasFace(landmarks)) throw new Error("No face landmarks for the brow composite");
  const { width: W, height: H } = result;
  const o = original.width === W && original.height === H ? original : resize(original, W, H);
  const co = channelsOf(o), cr = channelsOf(result);
  const px = toPixels(landmarks, W, H);
  const fw = faceWidth(px);

  const hard = new Uint8Array(W * H);
  for (const idx of [BROW_LEFT, BROW_RIGHT]) fillPolygon(scaledPolygon(px, idx, BROW_COMPOSITE.grow), W, H, hard);
  const mask = gaussianBlur(Float32Array.from(hard), W, H, fw * BROW_COMPOSITE.feather);

  const ring = new Uint8Array(W * H);
  for (const idx of [BROW_LEFT, BROW_RIGHT]) fillPolygon(scaledPolygon(px, idx, BROW_COMPOSITE.ring), W, H, ring);
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

/** compositeFeature(original, result, "brows", landmarks): the composited image only. "lashes" throws for now. */
export function compositeFeature(original: RawImage, result: RawImage, feature: FeatureKind, landmarks: Landmarks): RawImageOut {
  return compositeFeatureDetailed(original, result, feature, landmarks).image;
}
