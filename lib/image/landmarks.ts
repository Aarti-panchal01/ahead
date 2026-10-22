// MediaPipe face mesh (478 points) indices the lab uses, and helpers to turn normalised landmarks into pixels.
// "Left"/"right" are image left/right (MediaPipe's own naming), not the person's.

import type { IntegrityRegion } from "@/lib/types";
import type { Point } from "./raw";

/** Normalised landmarks as MediaPipe returns them: [x, y] or [x, y, z], x and y in 0..1 of the image. */
export type Landmarks = ReadonlyArray<ReadonlyArray<number>>;

/** Brow outlines (upper and lower edge). */
export const BROW_LEFT = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46] as const;
export const BROW_RIGHT = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276] as const;
/** Upper edge of each brow, used as the top of the inner-face paste mask. */
export const BROW_TOP = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300] as const;

/** Eyelid lines (FACEMESH eye contours), each running from one eye corner to the other. */
export const LID_UPPER_LEFT = [33, 246, 161, 160, 159, 158, 157, 173, 133] as const;
export const LID_LOWER_LEFT = [33, 7, 163, 144, 145, 153, 154, 155, 133] as const;
export const LID_UPPER_RIGHT = [263, 466, 388, 387, 386, 385, 384, 398, 362] as const;
export const LID_LOWER_RIGHT = [263, 249, 390, 373, 374, 380, 381, 382, 362] as const;

export const CHEEK_LEFT = 50;
export const CHEEK_RIGHT = 280;
export const NOSE_BRIDGE = 6;
export const NOSE_BRIDGE_UPPER = 168;
export const NOSE_TIP = 1;
/** Bottom of the chin, on the face outline. */
export const CHIN = 152;
/** Bottom edge of the lower lip. */
export const LOWER_LIP_BOTTOM = 17;
/** Face width is measured between these two (outline at cheekbone level). */
export const FACE_LEFT = 234;
export const FACE_RIGHT = 454;

/** Face outline (FACEMESH_FACE_OVAL), clockwise from the top of the forehead. */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;

/** How far up from the chin outline (towards the lower lip) the chin is sampled: 152 itself sits on the jaw edge. */
export const CHIN_INSET = 0.4;

/** True when there is a usable 468/478-point face mesh. */
export function hasFace(lm: Landmarks | null | undefined): lm is Landmarks {
  if (!lm || lm.length < 468) return false;
  for (const i of [...FACE_OVAL, ...BROW_LEFT, ...BROW_RIGHT, CHEEK_LEFT, CHEEK_RIGHT, NOSE_BRIDGE, LOWER_LIP_BOTTOM]) {
    const p = lm[i];
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return false;
  }
  return true;
}

/** Landmarks scaled to an image of this size (the same normalised points fit any resize of the same frame). */
export function toPixels(lm: Landmarks, width: number, height: number): Point[] {
  return lm.map((p) => [p[0] * width, p[1] * height] as const);
}

export function faceWidth(px: readonly Point[]): number {
  const a = px[FACE_LEFT], b = px[FACE_RIGHT];
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * Where the integrity check samples skin: both cheeks, the nose bridge and the chin (just above the jaw edge).
 * Never the forehead: hair or a wrap may cover it.
 */
export function skinSamplePoints(px: readonly Point[]): Record<IntegrityRegion, Point> {
  return {
    cheek_left: px[CHEEK_LEFT],
    cheek_right: px[CHEEK_RIGHT],
    nose_bridge: px[NOSE_BRIDGE],
    chin: lerp(px[CHIN], px[LOWER_LIP_BOTTOM], CHIN_INSET),
  };
}

export const INTEGRITY_REGIONS: readonly IntegrityRegion[] = ["cheek_left", "cheek_right", "nose_bridge", "chin"];

/** A polygon of landmark points grown (scale > 1) or shrunk around its own centre. */
export function scaledPolygon(px: readonly Point[], idx: readonly number[], scale: number): Point[] {
  let cx = 0, cy = 0;
  for (const i of idx) {
    cx += px[i][0];
    cy += px[i][1];
  }
  cx /= idx.length;
  cy /= idx.length;
  return idx.map((i) => [cx + (px[i][0] - cx) * scale, cy + (px[i][1] - cy) * scale] as const);
}
