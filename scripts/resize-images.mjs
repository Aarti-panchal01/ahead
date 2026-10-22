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
console.log(`wrote ${n} images`);
