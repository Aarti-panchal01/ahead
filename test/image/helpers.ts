// Fixture loading for the image-lab tests (Node only: sharp decodes the JPGs).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { RawImage } from "@/lib/image/raw";
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
