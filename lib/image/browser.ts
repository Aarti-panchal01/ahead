// The image lab in the browser. The heavy work (MediaPipe Tasks Vision and the pixel maths) runs in a module Web
// Worker (worker.ts) so the page stays responsive; when workers or OffscreenCanvas are missing, or the worker fails to
// start or dies, the same engine runs on the main thread instead. Results are identical either way.
// Browser-only: call from client components. Nothing here runs at import time, so importing it from shared code is safe.

import type { FeatureKind, IntegrityReport, SampledColours } from "@/lib/types";
import * as engine from "./engine";
import type { AssetPaths, CheckOptions, FaceRead, ImageSource } from "./engine";
import { WorkerGone, createLabClient, type LabClient, type Op, type Port, type Request } from "./worker-protocol";

export {
  MAX_PIXELS,
  MEDIAPIPE_NOISE,
  MEDIAPIPE_VERSION,
  MEDIAPIPE_WASM_BASE,
  MODEL_BASE,
  getModels,
  loadPixels,
  quietMediaPipe,
  toDataUrl,
  type AssetPaths,
  type FaceRead,
  type ImageSource,
} from "./engine";

let client: Promise<LabClient | null> | null = null;
let worker: Worker | null = null;

/** Workers can run the lab when they have module workers, OffscreenCanvas and createImageBitmap. */
function workerSupported(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap !== "undefined";
}

/** Start the worker once and load its models; null means "use the main thread". */
function getClient(paths: AssetPaths): Promise<LabClient | null> {
  if (!workerSupported()) return Promise.resolve(null);
  client ??= (async () => {
    let w: Worker;
    try {
      w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "image-lab" });
    } catch {
      return null;
    }
    const c = createLabClient(w as unknown as Port, location.href);
    const die = (reason: string, cause?: unknown) => {
      // Not an error for the user: the same work now runs on the main thread. Logged for whoever is debugging.
      console.info(`Image lab: ${reason}; running on the main thread instead.`, cause instanceof Error ? cause.message : (cause ?? ""));
      c.fail(reason);
      w.terminate();
      if (worker === w) worker = null;
      client = Promise.resolve(null); // from now on, the main thread
    };
    w.onerror = (e) => {
      e.preventDefault?.();
      die("The image worker stopped");
    };
    w.onmessageerror = () => die("The image worker sent a message we could not read");
    try {
      await c.call("init", [], absolute(paths));
    } catch (e) {
      die("The image worker could not load its models", e);
      return null;
    }
    worker = w;
    return c;
  })();
  return client;
}

/** The worker may run from a blob: URL (Next bundles it that way), so it gets absolute asset URLs. */
function absolute<T extends AssetPaths>(paths: T): T {
  const abs = (u: string) => new URL(u, location.href).href;
  return { ...paths, modelBase: abs(paths.modelBase ?? engine.MODEL_BASE), wasmBase: abs(paths.wasmBase ?? engine.MEDIAPIPE_WASM_BASE) };
}

/** Run `op` in the worker, or `local` on the main thread when the worker is unavailable or has died. */
async function run<T>(op: Op, sources: (ImageSource | FaceRead)[], options: Request["options"], local: () => Promise<T>): Promise<T> {
  const c = await getClient(options);
  if (!c) return local();
  try {
    return (await c.call(op, sources, absolute(options))) as T;
  } catch (e) {
    if (e instanceof WorkerGone) return local();
    throw e;
  }
}

/** Free the models and stop the worker (e.g. when leaving the try-on screen). */
export async function closeModels(): Promise<void> {
  worker?.terminate();
  worker = null;
  client = null;
  await engine.closeModels();
}

/**
 * Landmarks + hair and cover masks for a photo (one segmentation, one landmark pass). Read each photo once and pass
 * the result on: the user's photo to every checkRender, the brows photo to every applyBrowsInBrowser, and a render to
 * both checkRender and applyBrowsInBrowser. (Photos given by URL are also remembered by the worker.)
 */
export async function readFace(src: ImageSource | FaceRead, paths: AssetPaths = {}): Promise<FaceRead> {
  if (engine.isFaceRead(src)) return src;
  return run("readFace", [src], paths, () => engine.readFace(src, paths));
}

/**
 * The integrity check on a YouCam render. `original` is the exact photo sent to YouCam (for a full look, the
 * brow-composited photo). The corrected image is a data URL.
 */
export async function checkRender(original: ImageSource | FaceRead, result: ImageSource | FaceRead, options: CheckOptions = {}): Promise<IntegrityReport> {
  return run("checkRender", [original, result], options, () => engine.checkRender(original, result, options));
}

/** Paste only the feature (brows or lashes) of a makeup-vto render back onto the original. Returns a data URL. */
export async function compositeFeatureInBrowser(original: ImageSource | FaceRead, result: ImageSource, feature: FeatureKind, paths: AssetPaths = {}): Promise<string> {
  return run("compositeFeature", [original, result], { ...paths, feature }, () => engine.compositeFeatureInBrowser(original, result, feature, paths));
}

/**
 * Brows on a wig or wrap render (on by default when the user's hair is gone). `render` is a hair-transfer result made
 * from the bald photo; `brows` is the user's brows photo (the compositeFeatureInBrowser result on that bald photo).
 * Hair or a wrap over a brow is never painted over. Returns a data URL at the render's size.
 */
export async function applyBrowsInBrowser(render: ImageSource | FaceRead, brows: ImageSource | FaceRead, paths: AssetPaths = {}): Promise<string> {
  return run("applyBrows", [render, brows], paths, () => engine.applyBrowsInBrowser(render, brows, paths));
}

/** Hair and brow colour from the user's own photo (0 units). */
export async function sampleColoursInBrowser(photo: ImageSource | FaceRead, paths: AssetPaths = {}): Promise<SampledColours> {
  return run("sampleColours", [photo], paths, () => engine.sampleColoursInBrowser(photo, paths));
}
