// Upload pipeline: validate, then re-encode as a JPG with long side at most 1024 and no metadata.
import sharp from "sharp";
import { YoucamError } from "./errors";
import { messageFor } from "./messages";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_SIDE = 1024;
const MIN_SIDE = 256;
const MAX_INPUT_PIXELS = 48_000_000;
const OK_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "tiff"]);

const err = (code: string) => new YoucamError(code, messageFor(code));

/**
 * Orients by EXIF, resizes, flattens transparency and re-encodes. sharp drops EXIF, GPS and ICC
 * metadata unless asked to keep it, so nothing from the original file survives.
 */
export async function prepareUpload(bytes: Buffer): Promise<Buffer> {
  if (!bytes.length) throw err("empty_upload");
  if (bytes.length > MAX_UPLOAD_BYTES) throw err("too_large");
  let meta: sharp.Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw err("not_image");
  }
  if (!meta.format || !OK_FORMATS.has(meta.format) || !meta.width || !meta.height) throw err("not_image");
  if (Math.max(meta.width, meta.height) < MIN_SIDE) throw err("too_small");
  try {
    return await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, pages: 1 })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 93 })
      .toBuffer();
  } catch {
    throw err("not_image");
  }
}

/** Reads an uploaded File from a multipart form, refusing oversize files before reading them. */
export async function readUpload(file: File): Promise<Buffer> {
  if (file.size > MAX_UPLOAD_BYTES) throw err("too_large");
  return prepareUpload(Buffer.from(await file.arrayBuffer()));
}
