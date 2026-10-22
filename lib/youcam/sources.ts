// Demo faces: F1..F7 (kill-test faces) and demo personas P1A..P4C, plus P1B_browsB (P1B with composited brows).
import path from "node:path";

export const DEMO_FACE = /^(F[1-7]|P[1-4][ABC]|P1B_browsB)$/;
export const isDemoFace = (id: string) => DEMO_FACE.test(id);

/** Local file for a demo face (live mode sends it to YouCam after prepareUpload). */
export function demoFacePath(id: string): string {
  const root = process.cwd();
  if (id === "P1B_browsB") return path.join(root, "fixtures", "youcam", "hero__P1B__browsB.jpg");
  if (id.startsWith("P")) return path.join(root, "public", "personas", `${id}.jpg`);
  return path.join(root, "assets", "ai", "faces", `${id}.jpg`);
}
