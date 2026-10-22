import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as lab from "@/lib/image";
import { ROOT } from "./helpers";

describe("browser adapter (Node side)", () => {
  it("pins the CDN WASM to the exact MediaPipe version in package.json", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.dependencies["@mediapipe/tasks-vision"]).toBe(lab.MEDIAPIPE_VERSION);
    expect(lab.MEDIAPIPE_WASM_BASE).toBe(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${lab.MEDIAPIPE_VERSION}/wasm`);
  });

  it("serves both models and their licence from public/models", () => {
    for (const f of ["face_landmarker.task", "selfie_multiclass_256x256.tflite", "LICENSE-APACHE-2.0.txt", "LICENSES.md"]) {
      expect(fs.existsSync(path.join(ROOT, "public", "models", f))).toBe(true);
    }
  });

  it("imports safely outside a browser and refuses to load models there", async () => {
    expect(typeof lab.checkRender).toBe("function");
    await expect(lab.getModels()).rejects.toThrow(/browser/);
  });

  it("exports the names the UI uses", () => {
    for (const name of ["deltaE2000", "accentFromHair", "contrastRatio", "integrityCheck", "measureSkin", "compositeFeature", "sampleColours", "browDefault", "applyBrows", "applyBrowsInBrowser", "coverMaskFromCategories"]) {
      expect(typeof (lab as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
