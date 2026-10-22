// Smaller copies of the persona, catalogue and landing images for phones (Lighthouse: LCP and bytes).
// Writes <dir>/320/<name>.jpg and <dir>/640/<name>.jpg next to each original, JPEG q80, sRGB, no metadata.
// The landing hero (wig + brows recording) is copied from fixtures/youcam into public/landing first.
// Run: node scripts/resize-images.mjs   (idempotent; re-run after adding or changing an image)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
export const WIDTHS = [320, 640];
const DIRS = ["public/personas", "public/catalogue", "public/landing"];
const LANDING = [["fixtures/youcam/hero__P1B_browsB__W01.jpg", "public/landing/hero__P1B_browsB__W01.jpg"]];

for (const [from, to] of LANDING) {
  fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
  fs.copyFileSync(path.join(root, from), path.join(root, to));
}

let n = 0;
for (const dir of DIRS) {
  const abs = path.join(root, dir);
  for (const f of fs.readdirSync(abs).filter((x) => x.endsWith(".jpg"))) {
    for (const w of WIDTHS) {
      const outDir = path.join(abs, String(w));
      fs.mkdirSync(outDir, { recursive: true });
      await sharp(path.join(abs, f)).resize({ width: w }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(outDir, f));
      n++;
    }
  }
}
// Sample-person recordings (served full size by /api/fixtures for the integrity check): display copies only, in
// public/rec/320 and public/rec/640, plus a manifest the UI reads to know which recordings have copies.
const REC = /^(rec|hero)__P[1-4][AB][A-Za-z0-9_]*\.jpg$/;
const recs = fs.readdirSync(path.join(root, "fixtures/youcam")).filter((f) => REC.test(f) && !f.includes("_raw")).sort();
for (const f of recs) {
  for (const w of WIDTHS) {
    const outDir = path.join(root, "public/rec", String(w));
    fs.mkdirSync(outDir, { recursive: true });
    await sharp(path.join(root, "fixtures/youcam", f)).resize({ width: w }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(outDir, f));
    n++;
  }
}
fs.writeFileSync(path.join(root, "lib/client/resized-recordings.json"), JSON.stringify(recs.map((f) => f.replace(/\.jpg$/, ""))) + "\n");
console.log(`wrote ${n} images`);
