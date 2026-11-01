// Turns a camera frame or an uploaded file into an in-memory photo: an object URL plus the hair colour
// sampled locally (0 units). Nothing is uploaded here.
import { sampleColours } from "./image";

export interface LocalPhoto { url: string; hair?: string; hairPromise?: Promise<string | undefined> }

const MAX = 1024;
/** Fewer hair pixels than this and we don't trust the sample. */
export const MIN_HAIR_PIXELS = 500;

export async function photoFromSource(source: CanvasImageSource & { width: number; height: number }): Promise<LocalPhoto> {
  const scale = Math.min(1, MAX / Math.max(source.width, source.height));
  const w = Math.round(source.width * scale), h = Math.round(source.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("photo-canvas");
  let hair: string | undefined;
  ctx.drawImage(source, 0, 0, w, h);
  // Start colour sampling in parallel; it must not hold the photo picker hostage while MediaPipe loads.
  const hairPromise = sampleColours(ctx.getImageData(0, 0, w, h))
    .then((s) => s.hair && s.hairPixels >= MIN_HAIR_PIXELS ? s.hair : undefined)
    .catch(() => undefined);
  const normalized = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("photo-encode")), "image/jpeg", 0.92);
  });
  return { url: URL.createObjectURL(normalized), hair, hairPromise };
}

export type PhotoFileError = "too-large" | "unsupported" | "unreadable";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function decodeWithImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("photo-decode")); };
    image.src = url;
  });
}

export async function photoFromFile(file: File): Promise<LocalPhoto> {
  if (file.size > MAX_FILE_BYTES) throw new Error("too-large" satisfies PhotoFileError);
  if (!file.type.startsWith("image/")) throw new Error("unsupported" satisfies PhotoFileError);

  // createImageBitmap is fast, but support differs for HEIC and some phone exports.
  // Fall back to the browser's image decoder so uploads don't fail on a single API gap.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      try { return await photoFromSource(bitmap); } finally { bitmap.close(); }
    } catch { /* Try HTMLImageElement below. */ }
  }
  try {
    const image = await decodeWithImage(file);
    return await photoFromSource(image);
  } catch {
    throw new Error("unreadable" satisfies PhotoFileError);
  }
}

export async function photoFromVideo(video: HTMLVideoElement): Promise<LocalPhoto> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  // Mirror back to how the person saw themselves in the preview.
  ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  return photoFromSource(canvas);
}

/** Vercel rejects request bodies over 4.5 MB; a 1024 px JPEG is well under 1 MB. */
export const UPLOAD_LONG_SIDE = 1024;

/** The user's photo, made ready to send for a live try-on: long side at most 1024 px, JPEG. Browser only. */
export async function downscaleForUpload(src: Blob | string, longSide = UPLOAD_LONG_SIDE, quality = 0.9): Promise<Blob> {
  const blob = typeof src === "string" ? await fetch(src).then((r) => r.blob()) : src;
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, longSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bmp, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("no blob"))), "image/jpeg", quality));
  } finally {
    bmp.close();
  }
}
