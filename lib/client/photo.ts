// Turns a camera frame or an uploaded file into an in-memory photo: an object URL plus the hair colour
// sampled locally (0 units). Nothing is uploaded here.
import { sampleColours } from "./image";

export interface LocalPhoto { url: string; hair?: string }

const MAX = 1024;
/** Fewer hair pixels than this and we don't trust the sample. */
export const MIN_HAIR_PIXELS = 500;

export async function photoFromSource(source: CanvasImageSource & { width: number; height: number }, blob: Blob): Promise<LocalPhoto> {
  const scale = Math.min(1, MAX / Math.max(source.width, source.height));
  const w = Math.round(source.width * scale), h = Math.round(source.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let hair: string | undefined;
  if (ctx) {
    ctx.drawImage(source, 0, 0, w, h);
    const s = await sampleColours(ctx.getImageData(0, 0, w, h)).catch(() => ({ hairPixels: 0, browPixels: 0 }) as { hair?: string; hairPixels: number; browPixels: number });
    if (s.hair && s.hairPixels >= MIN_HAIR_PIXELS) hair = s.hair;
  }
  return { url: URL.createObjectURL(blob), hair };
}

export async function photoFromFile(file: Blob): Promise<LocalPhoto> {
  const bmp = await createImageBitmap(file);
  try { return await photoFromSource(bmp, file); } finally { bmp.close(); }
}

export async function photoFromVideo(video: HTMLVideoElement): Promise<LocalPhoto> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  // Mirror back to how the person saw themselves in the preview.
  ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("no blob"))), "image/jpeg", 0.92));
  return photoFromSource(canvas, blob);
}
