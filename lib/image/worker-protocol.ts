// The message protocol between the page (browser.ts) and the image-lab worker (worker.ts). Kept free of DOM and
// worker globals so both ends can be tested in Node with a fake message port.
//
// - Inputs travel without pixel copies where the browser allows it: Blobs by reference, ImageBitmaps transferred,
//   FaceReads the worker made by a small reference number (the worker keeps the pixels).
// - The worker reads every photo given by URL once and keeps the last few (the user's photo, the brows photo and
//   the render being checked are each read once, not once per call).
// - Results are what the main-thread engine returns, byte for byte (test/image/worker.test.ts).

import type { FeatureKind, IntegrityReport, SampledColours } from "@/lib/types";
import type { RawImage } from "./raw";
import {
  applyBrowsRaw,
  checkRenderRaw,
  compositeFeatureRaw,
  encodeReport,
  getModels,
  isFaceRead,
  readFace,
  sampleColoursInBrowser,
  toDataUrl,
  type AssetPaths,
  type CheckOptions,
  type FaceRead,
  type ImageSource,
} from "./engine";

export type WireSource =
  | { k: "url"; url: string }
  | { k: "blob"; blob: Blob }
  | { k: "bitmap"; bitmap: ImageBitmap }
  | { k: "imagedata"; data: Uint8ClampedArray; width: number; height: number }
  | { k: "ref"; ref: number }
  | { k: "face"; face: FaceRead };

export type Op = "init" | "readFace" | "checkRender" | "applyBrows" | "compositeFeature" | "sampleColours";

export interface Request {
  id: number;
  op: Op;
  sources: WireSource[];
  /** Options for the op: AssetPaths, threshold, feature. */
  options: AssetPaths & { threshold?: number; feature?: FeatureKind };
}

export type Response =
  | { id: number; ok: true; value: unknown; ref?: number }
  | { id: number; ok: false; error: string; code?: "MISSING_REF" };

/** The minimal port both ends talk through (a Worker, the worker's global scope, or a test fake). */
export interface Port {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

// ---------- worker side ----------

export interface HandlerDeps {
  /** Pixels to data URL. Default: the engine's toDataUrl (OffscreenCanvas JPEG). */
  encode?: (img: RawImage) => Promise<string>;
  /** FaceReads kept in the worker (LRU). */
  cacheSize?: number;
}

class MissingRef extends Error {
  code = "MISSING_REF" as const;
}

/** Serve requests from `port` one at a time (the models and their WASM memory are shared). */
export function serveLab(port: Port, deps: HandlerDeps = {}): void {
  const encode = deps.encode ?? ((img: RawImage) => toDataUrl(img));
  const cacheSize = deps.cacheSize ?? 6;
  const byKey = new Map<string, FaceRead>();
  let nextRef = 1;
  const remember = (key: string, f: FaceRead) => {
    byKey.delete(key);
    byKey.set(key, f);
    while (byKey.size > cacheSize) byKey.delete(byKey.keys().next().value as string);
  };
  const refOf = new WeakMap<FaceRead, number>();
  const keep = (f: FaceRead, url?: string): number => {
    let ref = refOf.get(f);
    if (!ref) refOf.set(f, (ref = nextRef++));
    remember(`#${ref}`, f);
    if (url !== undefined) remember(`u:${url}`, f);
    return ref;
  };

  /** A source as the engine takes it; URLs already read come back as their FaceRead when `face` is true. */
  const decode = (s: WireSource, face: boolean): ImageSource | FaceRead => {
    switch (s.k) {
      case "url": {
        const hit = face ? byKey.get(`u:${s.url}`) : undefined;
        if (hit) remember(`u:${s.url}`, hit);
        return hit ?? s.url;
      }
      case "blob":
        return s.blob;
      case "bitmap":
        return s.bitmap;
      case "imagedata":
        return new ImageData(s.data as Uint8ClampedArray<ArrayBuffer>, s.width, s.height);
      case "ref": {
        const f = byKey.get(`#${s.ref}`);
        if (!f) throw new MissingRef("The worker no longer has that photo");
        remember(`#${s.ref}`, f);
        return f;
      }
      case "face":
        return s.face;
    }
  };

  /** Read a face argument, keeping it (and its URL) for the next calls. */
  const face = async (s: WireSource, paths: AssetPaths): Promise<FaceRead> => {
    const src = decode(s, true);
    if (isFaceRead(src)) return src;
    const f = await readFace(src, paths);
    keep(f, s.k === "url" ? s.url : undefined);
    return f;
  };

  const run = async (req: Request): Promise<{ value: unknown; ref?: number }> => {
    const o = req.options;
    const [a, b] = req.sources;
    switch (req.op) {
      case "init": {
        const m = await getModels(o);
        return { value: m.delegate };
      }
      case "readFace": {
        const f = await face(a, o);
        return { value: f, ref: keep(f) };
      }
      case "checkRender": {
        const opts: CheckOptions = o;
        const rep = await checkRenderRaw(await face(a, o), await face(b, o), opts);
        const out: IntegrityReport = await encodeReport(rep, encode);
        return { value: out };
      }
      case "applyBrows": {
        const brows = await face(b, o);
        return { value: await encode(await applyBrowsRaw(await face(a, o), brows, o)) };
      }
      case "compositeFeature": {
        const img = await compositeFeatureRaw(await face(a, o), decode(b, false) as ImageSource, o.feature ?? "brows", o);
        return { value: await encode(img) };
      }
      case "sampleColours": {
        const s: SampledColours = await sampleColoursInBrowser(await face(a, o), o);
        return { value: s };
      }
    }
  };

  let chain: Promise<unknown> = Promise.resolve();
  port.onmessage = (ev) => {
    const req = ev.data as Request;
    chain = chain.then(async () => {
      let res: Response;
      try {
        const { value, ref } = await run(req);
        res = { id: req.id, ok: true, value, ref };
      } catch (e) {
        res = { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e), code: e instanceof MissingRef ? "MISSING_REF" : undefined };
      } finally {
        for (const s of req.sources) if (s.k === "bitmap") s.bitmap.close();
      }
      port.postMessage(res);
    });
  };
}

// ---------- page side ----------

/** The worker stopped (crashed, failed to load): the caller falls back to the main thread. */
export class WorkerGone extends Error {}

export interface LabClient {
  call(op: Op, sources: (ImageSource | FaceRead)[], options: Request["options"]): Promise<unknown>;
  /** Reject everything pending and refuse new calls (after a worker error). */
  fail(reason: string): void;
}

const isBlob = (v: unknown): v is Blob => typeof Blob !== "undefined" && v instanceof Blob;
const isBitmap = (v: unknown): v is ImageBitmap => typeof ImageBitmap !== "undefined" && v instanceof ImageBitmap;
const isImageData = (v: unknown): v is ImageData => typeof ImageData !== "undefined" && v instanceof ImageData;

export function createLabClient(port: Port, baseUrl?: string): LabClient {
  let nextId = 1;
  let dead: string | null = null;
  const pending = new Map<number, { resolve: (r: Response) => void; reject: (e: Error) => void }>();
  /** FaceReads that came from the worker, by the worker's reference. */
  const refs = new WeakMap<FaceRead, number>();

  port.onmessage = (ev) => {
    const res = ev.data as Response;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    p.resolve(res);
  };

  const encodeSource = async (s: ImageSource | FaceRead, byRef: boolean, transfer: Transferable[]): Promise<WireSource> => {
    if (typeof s === "string") {
      const abs = /^(data|blob):/i.test(s) || !baseUrl ? s : new URL(s, baseUrl).href;
      return { k: "url", url: abs };
    }
    if (isFaceRead(s)) {
      const ref = refs.get(s);
      return byRef && ref ? { k: "ref", ref } : { k: "face", face: s };
    }
    if (isBlob(s)) return { k: "blob", blob: s };
    if (isImageData(s)) return { k: "imagedata", data: s.data, width: s.width, height: s.height }; // copied: the caller keeps hers
    // ImageBitmap (a copy, so the caller's stays usable), <img> or <canvas>: a fresh bitmap, transferred.
    const bitmap = await createImageBitmap(isBitmap(s) ? s : (s as HTMLImageElement | HTMLCanvasElement));
    transfer.push(bitmap);
    return { k: "bitmap", bitmap };
  };

  const send = async (op: Op, sources: (ImageSource | FaceRead)[], options: Request["options"], byRef: boolean): Promise<Response> => {
    if (dead) throw new WorkerGone(dead);
    const transfer: Transferable[] = [];
    const wire = await Promise.all(sources.map((s) => encodeSource(s, byRef, transfer)));
    const id = nextId++;
    return new Promise<Response>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        port.postMessage({ id, op, sources: wire, options } satisfies Request, transfer);
      } catch (e) {
        pending.delete(id);
        reject(e);
      }
    });
  };

  return {
    async call(op, sources, options) {
      let res = await send(op, sources, options, true);
      if (!res.ok && res.code === "MISSING_REF") res = await send(op, sources, options, false); // the worker forgot it
      if (!res.ok) throw new Error(res.error);
      if (op === "readFace" && res.ref && isFaceRead(res.value)) refs.set(res.value, res.ref);
      return res.value;
    },
    fail(reason) {
      dead = reason;
      for (const p of pending.values()) p.reject(new WorkerGone(reason));
      pending.clear();
    },
  };
}
