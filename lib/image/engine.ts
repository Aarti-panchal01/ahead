// The image lab's browser engine: MediaPipe Tasks Vision (FaceLandmarker + ImageSegmenter) produces landmarks and
// masks; the pure core (integrity.ts, composite.ts, brows.ts, sample.ts) does the maths; this file decodes and
// encodes pixels. It runs the same in a Web Worker (worker.ts, the normal path) and on the main thread (the fallback
// browser.ts uses when workers are unavailable). Zero YouCam units: everything runs on the device.
//
// Assets: WASM from the jsdelivr CDN at the pinned package version; models served by the app from /models
// (public/models, Apache-2.0, licence alongside). Nothing here runs at import time.

import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import type { FeatureKind, IntegrityReport, SampledColours } from "@/lib/types";
import { applyBrows } from "./brows";
import { compositeFeature } from "./composite";
import { integrityCheck, type IntegrityCoreReport, type IntegrityOptions } from "./integrity";
import type { Landmarks } from "./landmarks";
import { channelsOf, resizeMask, type RawImage, type RawImageOut } from "./raw";
import { coverMaskFromCategories, hairMaskFromCategories, sampleColours } from "./sample";

/** Must equal the exact version of @mediapipe/tasks-vision in package.json (a test checks this). */
export const MEDIAPIPE_VERSION = "1.0.1";
export const MEDIAPIPE_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
export const MODEL_BASE = "/models";
/** Refuse decode bombs. */
export const MAX_PIXELS = 40_000_000;

export interface AssetPaths {
  wasmBase?: string;
  modelBase?: string;
  /**
   * "GPU" (default) runs both models on WebGL, about 10x faster than "CPU" on a laptop and what keeps a check under
   * 1.5 s on a mid-range phone; if the GPU delegate cannot start, the CPU is used. Only the first getModels call counts.
   */
  delegate?: "GPU" | "CPU";
}

// ---------- MediaPipe's chatter ----------

/**
 * MediaPipe's WASM prints its INFO and WARNING log lines (TFLite delegate, GL context, glog "I1023 ..." / "W1023 ..."
 * lines) through console.error, which shows up as console errors (Lighthouse flags them). While a MediaPipe call is
 * running, lines matching these known prefixes are dropped. Everything else, and every glog error line ("E..."),
 * still goes through.
 */
export const MEDIAPIPE_NOISE: readonly RegExp[] = [
  /^(INFO|WARNING|VERBOSE): /,
  /^[IW]\d{4} \d\d:\d\d:\d\d/, // glog info / warning: I1023 12:00:00.000000  1234 file.cc:12] ...
  /^Created TensorFlow Lite/,
  /^(gl_context|GL version|OpenGL error checking|Graph successfully started|Successfully)/,
];

let quietDepth = 0;
let patched = false;
const isNoise = (args: unknown[]) => typeof args[0] === "string" && MEDIAPIPE_NOISE.some((re) => re.test(args[0] as string));

/** Run `fn` with MediaPipe's INFO/WARNING console lines dropped (only those; real errors still print). */
export async function quietMediaPipe<T>(fn: () => T | Promise<T>): Promise<T> {
  if (!patched && typeof console !== "undefined") {
    patched = true;
    for (const level of ["error", "warn", "info", "log"] as const) {
      const orig = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        if (quietDepth > 0 && isNoise(args)) return;
        orig(...args);
      };
    }
  }
  quietDepth++;
  try {
    return await fn();
  } finally {
    quietDepth--;
  }
}

// ---------- models ----------

export interface Models {
  landmarker: FaceLandmarker;
  segmenter: ImageSegmenter;
  /** The delegate the models actually run on. */
  delegate: "GPU" | "CPU";
}
let models: Promise<Models> | null = null;

const inWorker = () => typeof document === "undefined";

/** Load (once) the WASM fileset and both models: GPU delegate when available, else CPU. */
export function getModels(paths: AssetPaths = {}): Promise<Models> {
  if (typeof createImageBitmap === "undefined") return Promise.reject(new Error("The image lab models run only in a browser"));
  models ??= quietMediaPipe(async () => {
    const { FaceLandmarker, FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const base = paths.modelBase ?? MODEL_BASE;
    const load = (files: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>, delegate: "GPU" | "CPU") =>
      Promise.all([
        FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: `${base}/face_landmarker.task`, delegate },
          runningMode: "IMAGE",
          numFaces: 1,
        }),
        ImageSegmenter.createFromOptions(files, {
          baseOptions: { modelAssetPath: `${base}/selfie_multiclass_256x256.tflite`, delegate },
          runningMode: "IMAGE",
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        }),
      ]);
    // MediaPipe's WASM loader comes as a classic script (importScripts / <script>) and as an ES module. A page or a
    // classic worker (what Next's bundler makes) takes the classic one; a module worker needs the ES module.
    const loaders = inWorker() ? [false, true] : [false];
    const errors: string[] = [];
    for (const useModule of loaders) {
      const files = await FilesetResolver.forVisionTasks(paths.wasmBase ?? MEDIAPIPE_WASM_BASE, useModule);
      for (const delegate of (paths.delegate ?? "GPU") === "GPU" ? (["GPU", "CPU"] as const) : (["CPU"] as const)) {
        try {
          const [landmarker, segmenter] = await load(files, delegate);
          return { landmarker, segmenter, delegate };
        } catch (e) {
          // No WebGL2 here (GPU), or this loader does not fit this scope: try the next.
          errors.push(`${delegate}/${useModule ? "module" : "classic"}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    throw new Error(`The face models could not be loaded (${errors.join("; ")})`);
  });
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

// ---------- pixels ----------

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

/** RGBA ImageData for MediaPipe and the canvas; shares the buffer when the pixels already are RGBA (no copy). */
function toImageData(img: RawImage): ImageData {
  const n = img.width * img.height;
  const ch = channelsOf(img);
  if (ch === 4 && img.data instanceof Uint8ClampedArray && img.data.length === n * 4)
    return new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height);
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

// ---------- reading faces ----------

/** What MediaPipe found in one image. */
export interface FaceRead {
  image: RawImage & { data: Uint8ClampedArray };
  /** 478 normalised points [x, y, z], or null when no face was found. */
  landmarks: Landmarks | null;
  /** 0/1 hair mask at the image size. */
  hairMask: Uint8Array;
  /** 0/1 mask of everything that is not skin (hair, a wrap, background) at the image size; applyBrows never paints it. */
  coverMask: Uint8Array;
}

/** selfie-multiclass category mask at the image size. */
function categoriesOf(segmenter: ImageSegmenter, data: ImageData): Uint8Array {
  const seg = segmenter.segment(data);
  try {
    const cm = seg.categoryMask;
    if (!cm) throw new Error("The segmenter returned no category mask");
    const raw = cm.getAsUint8Array();
    return cm.width === data.width && cm.height === data.height ? Uint8Array.from(raw) : resizeMask(raw, cm.width, cm.height, data.width, data.height);
  } finally {
    seg.close();
  }
}

export const isFaceRead = (src: unknown): src is FaceRead =>
  typeof src === "object" && src !== null && "hairMask" in src && "coverMask" in src && "image" in src;

/**
 * Landmarks + hair and cover masks for a photo (one segmentation, one landmark pass). Read each photo once and pass
 * the result on: the user's photo to every checkRender, the brows photo to every applyBrowsInBrowser, and a render to
 * both checkRender and applyBrowsInBrowser.
 */
export async function readFace(src: ImageSource | FaceRead, paths: AssetPaths = {}): Promise<FaceRead> {
  if (isFaceRead(src)) return src;
  const image = await loadPixels(src);
  const { landmarker, segmenter } = await getModels(paths);
  const data = toImageData(image);
  return quietMediaPipe(() => {
    const cats = categoriesOf(segmenter, data);
    const face = landmarker.detect(data).faceLandmarks[0];
    const landmarks = face && face.length ? face.map((p) => [p.x, p.y, p.z]) : null;
    return { image, landmarks, hairMask: hairMaskFromCategories(cats), coverMask: coverMaskFromCategories(cats) };
  });
}

/** The render's pixels and hair mask for the check (segmentation only; the original's landmarks are used). */
async function readRenderForCheck(result: ImageSource | FaceRead, paths: AssetPaths): Promise<{ image: RawImage; hairMask: Uint8Array }> {
  if (isFaceRead(result)) return result;
  const image = await loadPixels(result);
  const { segmenter } = await getModels(paths);
  const hairMask = await quietMediaPipe(() => hairMaskFromCategories(categoriesOf(segmenter, toImageData(image))));
  return { image, hairMask };
}

// ---------- the operations, raw (pixels out) and encoded (data URLs out) ----------

export type CheckOptions = Pick<IntegrityOptions, "threshold"> & AssetPaths;

export async function checkRenderRaw(original: ImageSource | FaceRead, result: ImageSource | FaceRead, options: CheckOptions = {}): Promise<IntegrityCoreReport> {
  const o = await readFace(original, options);
  const r = await readRenderForCheck(result, options);
  return integrityCheck(o.image, r.image, o.landmarks, { threshold: options.threshold, hairMasks: { original: o.hairMask, result: r.hairMask } });
}

export async function compositeFeatureRaw(original: ImageSource | FaceRead, result: ImageSource, feature: FeatureKind, paths: AssetPaths = {}): Promise<RawImageOut> {
  const o = await readFace(original, paths);
  if (!o.landmarks) throw new Error("We could not find a face in your photo. Try a brighter, front-facing photo.");
  const r = await loadPixels(result);
  return compositeFeature(o.image, r, feature, o.landmarks);
}

export async function applyBrowsRaw(render: ImageSource | FaceRead, brows: ImageSource | FaceRead, paths: AssetPaths = {}): Promise<RawImageOut> {
  const b = await readFace(brows, paths);
  if (!b.landmarks) throw new Error("We could not find a face in the brows photo. Try the brows step again.");
  const r = await readFace(render, paths);
  if (!r.landmarks) throw new Error("We could not find a face in this try-on, so the brows were not added.");
  return applyBrows(r.image, b.image, r.landmarks, b.landmarks, r.coverMask);
}

/** Encode a core report's corrected image (if any) with `encode`. */
export async function encodeReport(rep: IntegrityCoreReport, encode: (img: RawImage) => Promise<string>): Promise<IntegrityReport> {
  const { correctedImage, ...rest } = rep;
  return correctedImage ? { ...rest, correctedImage: await encode(correctedImage) } : rest;
}

/**
 * The integrity check on a YouCam render. `original` is the exact photo sent to YouCam (for a full look, the
 * brow-composited photo); pass FaceReads to avoid reading a photo twice. The corrected image is a data URL.
 */
export async function checkRender(original: ImageSource | FaceRead, result: ImageSource | FaceRead, options: CheckOptions = {}): Promise<IntegrityReport> {
  return encodeReport(await checkRenderRaw(original, result, options), (img) => toDataUrl(img));
}

/** Paste only the feature (brows or lashes) of a makeup-vto render back onto the original. Returns a data URL. */
export async function compositeFeatureInBrowser(original: ImageSource | FaceRead, result: ImageSource, feature: FeatureKind, paths: AssetPaths = {}): Promise<string> {
  return toDataUrl(await compositeFeatureRaw(original, result, feature, paths));
}

/**
 * Brows on a wig or wrap render (on by default when the user's hair is gone). `render` is a hair-transfer result made
 * from the bald photo; `brows` is the user's brows photo (the compositeFeatureInBrowser result on that bald photo).
 * Hair or a wrap over a brow is never painted over. Returns a data URL at the render's size.
 */
export async function applyBrowsInBrowser(render: ImageSource | FaceRead, brows: ImageSource | FaceRead, paths: AssetPaths = {}): Promise<string> {
  return toDataUrl(await applyBrowsRaw(render, brows, paths));
}

/** Hair and brow colour from the user's own photo (0 units). */
export async function sampleColoursInBrowser(photo: ImageSource | FaceRead, paths: AssetPaths = {}): Promise<SampledColours> {
  const p = await readFace(photo, paths);
  return sampleColours(p.image, p.landmarks, p.hairMask);
}
