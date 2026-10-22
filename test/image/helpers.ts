// Fixture loading for the image-lab tests (Node only: sharp decodes the JPGs).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { RawImage } from "@/lib/image/raw";
import { deltaE2000, rgbToLab } from "@/lib/image/colour";
import type { Landmarks } from "@/lib/image/landmarks";

export const ROOT = path.resolve(__dirname, "..", "..");
export const FIXTURES = path.join(__dirname, "fixtures");

/** Decode an image to RGB pixels (alpha dropped). Path relative to the repo root. */
export async function loadImage(rel: string): Promise<RawImage> {
  const { data, info } = await sharp(path.join(ROOT, rel)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

/** Landmarks made by youcam-hackathon/lookshift/scripts/reader-masks.py, named after the image (no extension). */
export function loadLandmarks(name: string): { width: number; height: number; landmarks: Landmarks } {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));
}

/** The selfie-multiclass category mask written next to the landmarks (0 bg, 1 hair, 2 body, 3 face, 4 clothes, 5 other). */
export async function loadCategories(name: string): Promise<{ data: Uint8Array; width: number; height: number }> {
  const { data, info } = await sharp(path.join(FIXTURES, `${name}.mask.png`)).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

const lab = (im: RawImage, i: number) => {
  const c = im.data.length / (im.width * im.height);
  return rgbToLab(im.data[i * c], im.data[i * c + 1], im.data[i * c + 2]);
};

/**
 * Seam score over a paste's soft edge (0 < mask < 1): for each pair of neighbouring pixels, the colour step in the
 * output minus the largest step in any source picture (all at the output's size). A positive value is an edge the paste
 * made that none of the pictures has, which is what a visible seam is. Returns the max and 99.9th percentile.
 */
export function seamScore(out: RawImage, sources: RawImage[], mask: Float32Array) {
  const W = out.width, H = out.height;
  const vals: number[] = [];
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      if (!(mask[i] > 0 && mask[i] < 1)) continue;
      for (const j of [i + 1, i + W]) {
        const made = deltaE2000(lab(out, i), lab(out, j));
        const had = Math.max(...sources.map((s) => deltaE2000(lab(s, i), lab(s, j))));
        vals.push(made - had);
      }
    }
  }
  vals.sort((a, b) => a - b);
  return { max: vals[vals.length - 1], p999: vals[Math.floor(vals.length * 0.999)], n: vals.length };
}
