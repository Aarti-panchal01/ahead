// Brows on a wig or wrap render (brows are on by default when the user says their hair is gone).
// Wig and wrap renders are made from the bald photo, so they have no brows. The user's brows photo (makeup-vto brows,
// already composited back onto the bald photo by compositeFeature) holds the brows. applyBrows moves only the brow
// region of that photo onto the render:
// - brow polygons from the render's landmarks, grown like compositeFeature (BROW_COMPOSITE), Gaussian-feathered;
// - the brows photo aligned to the render by a similarity transform fitted on brow and eye landmarks (the two photos
//   can differ in size and framing by a few pixels);
// - the global colour shift between the two photos (median RGB difference on a skin ring around the brows, render cover
//   left out) removed, so the pasted brows sit on the render's skin tone;
// - darken only: where the brows photo is not darker than the render (hair-transfer sometimes draws its own, darker
//   brows; a wig's shadow at the temple), the render is kept, so pasting never lightens anything;
// - zero weight wherever the render is not skin (hair, a wrap, glasses; see coverMaskFromCategories): a wig fringe or a
//   wrap over a brow always wins.
// Pure: raw pixels in, raw pixels out. Only a small crop around the brows is processed.

import { BROW_COMPOSITE } from "./composite";
import { BROW_LEFT, BROW_RIGHT, faceWidth, hasFace, scaledPolygon, toPixels, type Landmarks } from "./landmarks";
import { channelsOf, fillPolygon, gaussianBlur, median, type Point, type RawImage, type RawImageOut } from "./raw";

/** Eye outlines (upper and lower lid), used with the brows to align the two photos. */
export const EYE_LEFT = [33, 160, 159, 158, 133, 153, 145, 144] as const;
export const EYE_RIGHT = [362, 385, 386, 387, 263, 373, 374, 380] as const;
const ALIGN_POINTS = [...BROW_LEFT, ...BROW_RIGHT, ...EYE_LEFT, ...EYE_RIGHT];

export const BROW_APPLY = {
  /** Blur of the render's cover mask (fraction of face width); the weight fades to 0 before the cover starts. */
  coverBlur: 0.02,
  /**
   * Darken-only gate on the luma difference (render minus shifted brows photo, 0..255 levels): no paste at or below
   * the first value (the brows photo would lighten), full paste from the second up, smooth in between.
   */
  darkenRamp: [-1, 2] as const,
  /** Blur of the luma difference before gating, as a fraction of the feather sigma. */
  gateBlur: 0.5,
  /** Fewer usable skin-ring pixels than this and no shift is removed (the brows are almost all under hair anyway). */
  minRingPixels: 50,
} as const;

/** dst = [a -b; b a] * src + [tx, ty]: maps a render pixel to the matching brows-photo pixel. */
export interface Similarity {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

/** Least-squares similarity transform (rotation, uniform scale, translation) taking src points onto dst points. */
export function fitSimilarity(src: readonly Point[], dst: readonly Point[]): Similarity {
  const n = Math.min(src.length, dst.length);
  if (n < 2) throw new Error("Need at least two points to align the photos");
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    sx += src[i][0];
    sy += src[i][1];
    dx += dst[i][0];
    dy += dst[i][1];
  }
  sx /= n;
  sy /= n;
  dx /= n;
  dy /= n;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const px = src[i][0] - sx, py = src[i][1] - sy, qx = dst[i][0] - dx, qy = dst[i][1] - dy;
    num1 += px * qx + py * qy;
    num2 += px * qy - py * qx;
    den += px * px + py * py;
  }
  if (!(den > 0)) throw new Error("The landmarks are degenerate");
  const a = num1 / den, b = num2 / den;
  return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
}

export interface BrowsApplied {
  image: RawImageOut;
  /** Final blend weight (0..1) at the render's size: feathered brow mask, darken-only gate, cover cut out. */
  mask: Float32Array;
  /** Global RGB shift removed from the brows photo (brows photo minus render, median on the skin ring). */
  shift: [number, number, number];
  /** Render pixel -> brows-photo pixel. */
  transform: Similarity;
}

/**
 * Transfer the brows from `brows` (the user's brow-composited photo) onto `render` (a wig or wrap render made from the
 * bald photo). Landmarks are each image's own, normalised. `renderCover` (0/nonzero, render size) marks what in the
 * render is not skin (hair, a wrap: coverMaskFromCategories): the weight there is exactly 0, so a fringe or a wrap over
 * a brow stays as it is. Output is at the render's size
 * and channel count; pixels outside the feathered brow mask are the render's, unchanged.
 */
export function applyBrowsDetailed(
  render: RawImage,
  brows: RawImage,
  renderLandmarks: Landmarks | null | undefined,
  browsLandmarks: Landmarks | null | undefined,
  renderCover?: Uint8Array,
): BrowsApplied {
  if (!hasFace(renderLandmarks)) throw new Error("No face landmarks in the try-on render");
  if (!hasFace(browsLandmarks)) throw new Error("No face landmarks in the brows photo");
  const { width: W, height: H } = render;
  if (renderCover && renderCover.length !== W * H) throw new Error("The cover mask must be the size of the render");
  const cr = channelsOf(render), cb = channelsOf(brows);
  const pr = toPixels(renderLandmarks, W, H);
  const pb = toPixels(browsLandmarks, brows.width, brows.height);
  const T = fitSimilarity(
    ALIGN_POINTS.map((i) => pr[i]),
    ALIGN_POINTS.map((i) => pb[i]),
  );
  const fw = faceWidth(pr);
  const sigma = Math.max(0.5, fw * BROW_COMPOSITE.feather);

  // Work in a crop around the skin ring, with room for the feather and cover blur.
  const ringPolys = [BROW_LEFT, BROW_RIGHT].map((idx) => scaledPolygon(pr, idx, BROW_COMPOSITE.ring));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of ringPolys)
    for (const [x, y] of poly) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  const pad = Math.ceil(3 * Math.max(sigma, fw * BROW_APPLY.coverBlur)) + 2;
  const cx0 = Math.max(0, Math.floor(x0) - pad), cy0 = Math.max(0, Math.floor(y0) - pad);
  const cx1 = Math.min(W, Math.ceil(x1) + pad + 1), cy1 = Math.min(H, Math.ceil(y1) + pad + 1);
  const out = new Uint8ClampedArray(render.data);
  const mask = new Float32Array(W * H);
  const cw = cx1 - cx0, ch = cy1 - cy0;
  if (cw <= 0 || ch <= 0) return { image: { data: out, width: W, height: H }, mask, shift: [0, 0, 0], transform: T };
  const shiftPts = (poly: Point[]): Point[] => poly.map(([x, y]) => [x - cx0, y - cy0] as const);

  const hard = new Uint8Array(cw * ch);
  for (const idx of [BROW_LEFT, BROW_RIGHT]) fillPolygon(shiftPts(scaledPolygon(pr, idx, BROW_COMPOSITE.grow)), cw, ch, hard);
  const weight = gaussianBlur(Float32Array.from(hard), cw, ch, sigma);
  const ring = new Uint8Array(cw * ch);
  for (const poly of ringPolys) fillPolygon(shiftPts(poly), cw, ch, ring);

  // Cover (hair, wrap) in the crop, and a soft version that reaches 0 before the cover starts.
  let cover: Uint8Array | null = null, soft: Float32Array | null = null;
  if (renderCover) {
    cover = new Uint8Array(cw * ch);
    let any = false;
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++)
        if (renderCover[(y + cy0) * W + x + cx0]) {
          cover[y * cw + x] = 1;
          any = true;
        }
    if (any) soft = gaussianBlur(Float32Array.from(cover), cw, ch, Math.max(0.5, fw * BROW_APPLY.coverBlur));
    else cover = null;
  }

  // The brows photo, sampled (bilinear) at the render's crop pixels.
  const sampled = new Float32Array(cw * ch * 3);
  const need = (i: number) => weight[i] > 1e-4 || ring[i] === 1;
  const bw = brows.width, bh = brows.height, bd = brows.data;
  for (let y = 0; y < ch; y++) {
    const ry = y + cy0 + 0.5;
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      if (!need(i)) continue;
      const rx = x + cx0 + 0.5;
      const sx = T.a * rx - T.b * ry + T.tx - 0.5, sy = T.b * rx + T.a * ry + T.ty - 0.5;
      const fx = Math.min(bw - 1, Math.max(0, sx)), fy = Math.min(bh - 1, Math.max(0, sy));
      const ix = Math.min(bw - 2, Math.floor(fx)), iy = Math.min(bh - 2, Math.floor(fy));
      const tx = fx - ix, ty = fy - iy;
      const o00 = (iy * bw + ix) * cb, o10 = o00 + cb, o01 = o00 + bw * cb, o11 = o01 + cb;
      for (let c = 0; c < 3; c++) {
        const top = bd[o00 + c] * (1 - tx) + bd[o10 + c] * tx;
        const bot = bd[o01 + c] * (1 - tx) + bd[o11 + c] * tx;
        sampled[i * 3 + c] = top * (1 - ty) + bot * ty;
      }
    }
  }

  // Global shift on the skin ring: outside the feathered brows, away from the render's hair or wrap.
  const diffs: [number[], number[], number[]] = [[], [], []];
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      if (!ring[i] || weight[i] >= 10 / 255 || (soft && soft[i] > 0.02)) continue;
      const o = ((y + cy0) * W + x + cx0) * cr;
      for (let c = 0; c < 3; c++) diffs[c].push(sampled[i * 3 + c] - render.data[o + c]);
    }
  const shift: [number, number, number] =
    diffs[0].length >= BROW_APPLY.minRingPixels ? [median(diffs[0]), median(diffs[1]), median(diffs[2])] : [0, 0, 0];

  // Darken only: brows add darkness. Where the shifted brows photo is not darker than the render (hair-transfer's own,
  // darker brows; a wig's shadow at the temple that the bald photo doesn't have), the render stays. The luma
  // difference is blurred a little first so the gate is smooth, not speckled by skin texture.
  const darker = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      if (!(weight[i] > 1e-4)) continue;
      const o = ((y + cy0) * W + x + cx0) * cr;
      const yr = 0.299 * render.data[o] + 0.587 * render.data[o + 1] + 0.114 * render.data[o + 2];
      const yp = 0.299 * (sampled[i * 3] - shift[0]) + 0.587 * (sampled[i * 3 + 1] - shift[1]) + 0.114 * (sampled[i * 3 + 2] - shift[2]);
      darker[i] = yr - yp;
    }
  const gate = gaussianBlur(darker, cw, ch, Math.max(0.5, sigma * BROW_APPLY.gateBlur));

  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      let a = weight[i];
      if (!(a > 1e-4)) continue;
      if (cover && cover[i]) continue; // the render's hair or wrap always wins
      const [g0, g1] = BROW_APPLY.darkenRamp;
      const d = Math.min(1, Math.max(0, (gate[i] - g0) / (g1 - g0)));
      a *= d * d * (3 - 2 * d);
      if (!(a > 1e-4)) continue;
      if (soft) {
        const t = Math.min(1, soft[i] * 4);
        a *= 1 - t * t * (3 - 2 * t);
        if (!(a > 1e-4)) continue;
      }
      const g = (y + cy0) * W + x + cx0;
      mask[g] = a;
      const o = g * cr;
      for (let c = 0; c < 3; c++) {
        const v = Math.min(255, Math.max(0, sampled[i * 3 + c] - shift[c]));
        out[o + c] = render.data[o + c] * (1 - a) + v * a;
      }
    }
  return { image: { data: out, width: W, height: H }, mask, shift, transform: T };
}

/** applyBrows(render, brows, renderLandmarks, browsLandmarks, renderCover?): the render with the user's brows. */
export function applyBrows(
  render: RawImage,
  brows: RawImage,
  renderLandmarks: Landmarks | null | undefined,
  browsLandmarks: Landmarks | null | undefined,
  renderCover?: Uint8Array,
): RawImageOut {
  return applyBrowsDetailed(render, brows, renderLandmarks, browsLandmarks, renderCover).image;
}
