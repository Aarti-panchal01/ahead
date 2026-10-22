import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { applyBrowsRaw, checkRenderRaw, encodeReport, sampleColoursInBrowser, type FaceRead } from "@/lib/image/engine";
import { WorkerGone, createLabClient, serveLab, type Port } from "@/lib/image/worker-protocol";
import { coverMaskFromCategories, hairMaskFromCategories } from "@/lib/image/sample";
import { MEDIAPIPE_NOISE, quietMediaPipe } from "@/lib/image/engine";
import type { RawImage } from "@/lib/image/raw";
import { loadCategories, loadImage, loadLandmarks } from "./helpers";

// The page and the worker talk through two fake ports that structured-clone every message, as postMessage does.
function portPair(): [Port, Port] {
  const a: Port = { onmessage: null, postMessage: (m) => queueMicrotask(() => b.onmessage?.({ data: structuredClone(m) })) };
  const b: Port = { onmessage: null, postMessage: (m) => queueMicrotask(() => a.onmessage?.({ data: structuredClone(m) })) };
  return [a, b];
}

/** Stand-in for the JPEG encoder (no canvas in Node): a hash of the exact pixels. */
const encode = async (img: RawImage) => "sha256:" + createHash("sha256").update(img.data).digest("hex") + `:${img.width}x${img.height}`;

async function faceRead(name: string, rel: string): Promise<FaceRead> {
  const im = await loadImage(rel);
  // RGBA, as the browser decodes.
  const n = im.width * im.height, rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = im.data[i * 3];
    rgba[i * 4 + 1] = im.data[i * 3 + 1];
    rgba[i * 4 + 2] = im.data[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  const cats = (await loadCategories(name)).data;
  return { image: { data: rgba, width: im.width, height: im.height }, landmarks: loadLandmarks(name).landmarks, hairMask: hairMaskFromCategories(cats), coverMask: coverMaskFromCategories(cats) };
}

describe("worker protocol: the worker path gives exactly the main-thread results", () => {
  let bald: FaceRead, brows: FaceRead, w03: FaceRead, w05: FaceRead;
  beforeAll(async () => {
    [bald, brows, w03, w05] = await Promise.all([
      faceRead("P1B", "public/personas/P1B.jpg"),
      faceRead("hero__P1B__browsB", "fixtures/youcam/hero__P1B__browsB.jpg"),
      faceRead("rec__P1B__W03", "fixtures/youcam/rec__P1B__W03.jpg"),
      faceRead("rec__P2B__W05", "fixtures/youcam/rec__P2B__W05.jpg"),
    ]);
  });
  const lab = () => {
    const [page, worker] = portPair();
    serveLab(worker, { encode });
    return createLabClient(page);
  };

  it("checkRender (corrected): same report, same corrected pixels", async () => {
    const viaWorker = await lab().call("checkRender", [bald, w03], {});
    const direct = await encodeReport(await checkRenderRaw(bald, w03), encode);
    expect(direct.status).toBe("corrected");
    expect(viaWorker).toEqual(direct);
  });

  it("checkRender (shaded cheek left out): same report and skippedRegions", async () => {
    const [p4, w10] = await Promise.all([faceRead("P4B", "public/personas/P4B.jpg"), faceRead("rec__P4B__W10", "fixtures/youcam/rec__P4B__W10.jpg")]);
    const viaWorker = await lab().call("checkRender", [p4, w10], {});
    const direct = await encodeReport(await checkRenderRaw(p4, w10), encode);
    expect(direct.skippedRegions).toContain("cheek_left");
    expect(viaWorker).toEqual(direct);
  });

  it("applyBrows: same pixels (fringe case too)", async () => {
    const c = lab();
    for (const r of [w03, w05]) expect(await c.call("applyBrows", [r, brows], {})).toBe(await encode(await applyBrowsRaw(r, brows)));
  });

  it("sampleColours: same colours", async () => {
    expect(await lab().call("sampleColours", [bald], {})).toEqual(await sampleColoursInBrowser(bald));
  });

  it("a FaceRead from the worker goes back by reference, and is resent in full if the worker forgot it", async () => {
    const [page, worker] = portPair();
    serveLab(worker, { encode, cacheSize: 1 });
    const c = createLabClient(page);
    const sent: unknown[] = [];
    const post = page.postMessage;
    page.postMessage = (m, t) => {
      sent.push(structuredClone(m));
      post(m, t);
    };
    const f = (await c.call("readFace", [bald], {})) as FaceRead;
    expect(Buffer.compare(Buffer.from(f.image.data), Buffer.from(bald.image.data))).toBe(0);
    expect(Buffer.compare(Buffer.from(f.coverMask), Buffer.from(bald.coverMask))).toBe(0);
    expect(f.landmarks).toEqual(bald.landmarks);
    const g = (await c.call("readFace", [brows], {})) as FaceRead; // evicts f (cache of 1)
    expect(g.landmarks).toEqual(brows.landmarks);
    const rep = await c.call("checkRender", [f, w03], {});
    expect(rep).toEqual(await encodeReport(await checkRenderRaw(bald, w03), encode));
    const kinds = (sent as { op: string; sources: { k: string }[] }[]).filter((m) => m.op === "checkRender").map((m) => m.sources[0].k);
    expect(kinds).toEqual(["ref", "face"]); // tried the reference, then sent the photo
  });

  it("errors come back with the engine's message; a dead worker rejects with WorkerGone", async () => {
    const c = lab();
    const noFace = { ...bald, landmarks: null };
    await expect(c.call("applyBrows", [w03, noFace], {})).rejects.toThrow(/brows photo/);
    c.fail("stopped");
    await expect(c.call("sampleColours", [bald], {})).rejects.toBeInstanceOf(WorkerGone);
  });
});

describe("MediaPipe console noise", () => {
  it("drops only known INFO/WARNING lines, and only while MediaPipe runs", async () => {
    const seen: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => seen.push(String(a[0]));
    try {
      await quietMediaPipe(() => {
        console.error("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.");
        console.error("W1023 10:00:00.123456  1234 gl_context.cc:1004] OpenGL error checking is disabled");
        console.error("I1023 10:00:00.123456  1234 gl_context_webgl.cc:151] Successfully created a WebGL context");
        console.error("E1023 10:00:00.123456  1234 graph.cc:1] a real MediaPipe error");
        console.error("TypeError: something in the app");
      });
      console.error("INFO: outside a MediaPipe call");
    } finally {
      console.error = orig;
    }
    // The patch wraps whatever console.error was when first installed, so check the patterns directly too.
    const noise = ["INFO: Created TensorFlow Lite XNNPACK delegate for CPU.", "W1023 10:00:00.123456  1234 gl_context.cc:1004] x", "I1023 10:00:00.1 1 y"];
    for (const l of noise) expect(MEDIAPIPE_NOISE.some((re) => re.test(l))).toBe(true);
    for (const l of ["E1023 10:00:00.123456  1234 graph.cc:1] a real error", "TypeError: x", "Could not load the model"]) expect(MEDIAPIPE_NOISE.some((re) => re.test(l))).toBe(false);
    expect(seen).toContain("E1023 10:00:00.123456  1234 graph.cc:1] a real MediaPipe error");
    expect(seen).toContain("TypeError: something in the app");
  });
});
