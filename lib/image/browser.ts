// Thin browser adapter for the image lab: MediaPipe Tasks Vision (FaceLandmarker + ImageSegmenter hair class) produces
// landmarks and hair masks; the pure core (integrity.ts, composite.ts, sample.ts) does the maths; this file turns the
// corrected pixels into data URLs. Zero YouCam units: everything runs on the device.
//
// Assets: WASM from the jsdelivr CDN at the pinned package version; models served by the app from /models
// (public/models, Apache-2.0, licence alongside). Browser-only: call from client components. Nothing here runs at
// import time, so importing it from shared code is safe.

import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import type { FeatureKind, IntegrityReport, SampledColours } from "@/lib/types";
import { compositeFeature } from "./composite";
import { integrityCheck, type IntegrityOptions } from "./integrity";
import type { Landmarks } from "./landmarks";
import { channelsOf, resizeMask, type RawImage } from "./raw";
import { hairMaskFromCategories, sampleColours } from "./sample";

/** Must equal the exact version of @mediapipe/tasks-vision in package.json (a test checks this). */
export const MEDIAPIPE_VERSION = "1.0.1";
export const MEDIAPIPE_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
export const MODEL_BASE = "/models";
/** Refuse decode bombs. */
export const MAX_PIXELS = 40_000_000;

export interface AssetPaths {
  wasmBase?: string;
  modelBase?: string;
}

interface Models {
  landmarker: FaceLandmarker;
  segmenter: ImageSegmenter;
}
let models: Promise<Models> | null = null;

/** Load (once) the WASM fileset and both models, CPU delegate like the Python helper that made the test fixtures. */
export function getModels(paths: AssetPaths = {}): Promise<Models> {
  if (typeof window === "undefined") return Promise.reject(new Error("The image lab models run only in a browser"));
  models ??= (async () => {
    const { FaceLandmarker, FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(paths.wasmBase ?? MEDIAPIPE_WASM_BASE);
    const base = paths.modelBase ?? MODEL_BASE;
    const [landmarker, segmenter] = await Promise.all([
      FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${base}/face_landmarker.task`, delegate: "CPU" },
        runningMode: "IMAGE",
        numFaces: 1,
      }),
      ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${base}/selfie_multiclass_256x256.tflite`, delegate: "CPU" },
        runningMode: "IMAGE",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      }),
    ]);
    return { landmarker, segmenter };
  })();
  models.catch(() => {
    models = null; // a failed load (offline, 404) can be retried
  });
  return models;
}

/** Free the models (e.g. when leaving the try-on screen). */
export async function closeModels(): Promise<void> {
  const m = models;
  models = null;
  if (!m) return;
  const { landmarker, segmenter } = await m;
  landmarker.close();
  segmenter.close();
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

function ctx2d(c: AnyCanvas): Ctx2D {
  const ctx = c.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" }) as Ctx2D | null;
  if (!ctx) throw new Error("This browser has no 2D canvas");
  return ctx;
}

/** Anything the browser can draw, or a URL (same-origin, data:, blob:, or CORS-enabled). */
export type ImageSource = Blob | ImageBitmap | HTMLImageElement | HTMLCanvasElement | ImageData | string;

/** Decode to sRGB RGBA pixels with EXIF orientation applied. */
export async function loadPixels(src: ImageSource): Promise<RawImage & { data: Uint8ClampedArray }> {
  if (typeof src === "string") {
    const res = await fetch(src);
    if (!res.ok) throw new Error("That image could not be loaded. Try again.");
    src = await res.blob();
  }
  if (typeof ImageData !== "undefined" && src instanceof ImageData) return { data: src.data, width: src.width, height: src.height };
  const owned = src instanceof Blob;
  const bmp = owned ? await createImageBitmap(src as Blob, { imageOrientation: "from-image" }) : (src as ImageBitmap | HTMLImageElement | HTMLCanvasElement);
  try {
    const w = "naturalWidth" in bmp ? bmp.naturalWidth : bmp.width;
    const h = "naturalHeight" in bmp ? bmp.naturalHeight : bmp.height;
    if (!w || !h) throw new Error("That file could not be read as an image. Try a JPG or PNG photo.");
    if (w * h > MAX_PIXELS) throw new Error("That photo is too large. Try one under 40 megapixels.");
    const c = makeCanvas(w, h);
    const ctx = ctx2d(c);
    ctx.drawImage(bmp, 0, 0);
    const id = ctx.getImageData(0, 0, w, h);
    return { data: id.data, width: w, height: h };
  } finally {
    if (owned) (bmp as ImageBitmap).close();
  }
}

function toImageData(img: RawImage): ImageData {
  const n = img.width * img.height;
  const ch = channelsOf(img);
  const rgba = new Uint8ClampedArray(n * 4);
  if (ch === 4) rgba.set(img.data);
  else
    for (let i = 0; i < n; i++) {
      rgba[i * 4] = img.data[i * 3];
      rgba[i * 4 + 1] = img.data[i * 3 + 1];
      rgba[i * 4 + 2] = img.data[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  return new ImageData(rgba, img.width, img.height);
}

/** Encode pixels as a data URL (JPEG by default; the corrected render is a photo). */
export async function toDataUrl(img: RawImage, type = "image/jpeg", quality = 0.92): Promise<string> {
  const c = makeCanvas(img.width, img.height);
  ctx2d(c).putImageData(toImageData(img), 0, 0);
  if ("toDataURL" in c) return c.toDataURL(type, quality);
  const blob = await c.convertToBlob({ type, quality });
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not encode the image"));
    r.readAsDataURL(blob);
  });
}

/** What MediaPipe found in one image. */
export interface FaceRead {
  image: RawImage & { data: Uint8ClampedArray };
  /** 478 normalised points [x, y, z], or null when no face was found. */
  landmarks: Landmarks | null;
  /** 0/1 hair mask at the image size. */
  hairMask: Uint8Array;
}

async function hairMaskOf(segmenter: ImageSegmenter, data: ImageData): Promise<Uint8Array> {
  const seg = segmenter.segment(data);
  try {
    const cm = seg.categoryMask;
    if (!cm) throw new Error("The segmenter returned no category mask");
    const raw = cm.getAsUint8Array();
    const cats = cm.width === data.width && cm.height === data.height ? Uint8Array.from(raw) : resizeMask(raw, cm.width, cm.height, data.width, data.height);
    return hairMaskFromCategories(cats);
  } finally {
    seg.close();
  }
}

/** Landmarks + hair mask for a photo. Read the user's photo once and pass the result to the calls below. */
export async function readFace(src: ImageSource | FaceRead, paths: AssetPaths = {}): Promise<FaceRead> {
  if (typeof src === "object" && "hairMask" in src) return src;
  const image = await loadPixels(src);
  const { landmarker, segmenter } = await getModels(paths);
  const data = toImageData(image);
  const hairMask = await hairMaskOf(segmenter, data);
  const face = landmarker.detect(data).faceLandmarks[0];
  const landmarks = face && face.length ? face.map((p) => [p.x, p.y, p.z]) : null;
  return { image, landmarks, hairMask };
}

/**
 * The integrity check on a YouCam render, in the browser. `original` is the exact photo sent to YouCam (for a full
 * look, the brow-composited photo); pass its FaceRead to avoid reading it again. The corrected image is a data URL.
 */
export async function checkRender(
  original: ImageSource | FaceRead,
  result: ImageSource,
  options: Pick<IntegrityOptions, "threshold"> & AssetPaths = {},
): Promise<IntegrityReport> {
  const o = await readFace(original, options);
  const r = await loadPixels(result);
  const { segmenter } = await getModels(options);
  const resultHair = await hairMaskOf(segmenter, toImageData(r));
  const rep = integrityCheck(o.image, r, o.landmarks, { threshold: options.threshold, hairMasks: { original: o.hairMask, result: resultHair } });
  const { correctedImage, ...rest } = rep;
  return correctedImage ? { ...rest, correctedImage: await toDataUrl(correctedImage) } : rest;
}

/** Paste only the feature (brows) of a makeup-vto render back onto the original. Returns a data URL. */
export async function compositeFeatureInBrowser(original: ImageSource | FaceRead, result: ImageSource, feature: FeatureKind, paths: AssetPaths = {}): Promise<string> {
  const o = await readFace(original, paths);
  if (!o.landmarks) throw new Error("We could not find a face in your photo. Try a brighter, front-facing photo.");
  const r = await loadPixels(result);
  return toDataUrl(compositeFeature(o.image, r, feature, o.landmarks));
}

/** Hair and brow colour from the user's own photo (0 units). */
export async function sampleColoursInBrowser(photo: ImageSource | FaceRead, paths: AssetPaths = {}): Promise<SampledColours> {
  const p = await readFace(photo, paths);
  return sampleColours(p.image, p.landmarks, p.hairMask);
}
