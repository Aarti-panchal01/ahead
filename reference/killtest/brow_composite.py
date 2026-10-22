"""P9 brow fix (0 units): paste only the brows from the makeup-vto result back onto the original photo.

Like LookShift's lip composite: makeup-vto lightens the whole picture, so we take the brow pixels only,
remove the global lightening measured on the skin around the brows, and blend them in with a feathered mask
built from MediaPipe face landmarks. Measures L* (forehead, cheeks, scalp) before vs raw vs fixed.
Run with the reader venv: ..\\.venv-reader\\Scripts\\python.exe brow_fix.py F1 F2 F3 F6
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
MASKS = os.path.join(HERE, "..", "lookshift", "scripts", "reader-masks.py")
OUT = os.path.join(HERE, "results", "p9")
# MediaPipe face mesh brow outlines (upper + lower edge of each brow), forehead centre, cheeks.
BROW_L = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
BROW_R = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
FOREHEAD, CHEEK_L, CHEEK_R, TOP = 151, 50, 280, 10


def lab(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T / np.array([0.95047, 1, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def landmarks(img_path, name):
    prefix = os.path.join(HERE, "cache", f"lm_{name}")
    if not os.path.exists(prefix + ".json"):
        subprocess.run([sys.executable, MASKS, img_path, prefix], check=True, capture_output=True)
    j = json.load(open(prefix + ".json"))
    return np.array([[p[0] * j["width"], p[1] * j["height"]] for p in j["landmarks"]])


def patch_L(L, pt, r):
    x, y = int(pt[0]), int(pt[1])
    return float(np.median(L[max(0, y - r):y + r, max(0, x - r):x + r, 0]))


def run(face):
    orig_p = os.path.join(HERE, "inputs", "faces", f"{face}.jpg")
    raw_p = os.path.join(HERE, "results", "p9" if face != "F6" else "p8", f"{face}__makeup_brows.jpg")
    raw = Image.open(raw_p).convert("RGB")
    orig = Image.open(orig_p).convert("RGB").resize(raw.size, Image.LANCZOS)  # same frame the API saw (long side 1024)
    o_path = os.path.join(HERE, "cache", f"orig_{face}.jpg"); orig.save(o_path, quality=97)
    lm = landmarks(o_path, face)
    W, H = raw.size
    face_w = float(np.linalg.norm(lm[234] - lm[454]))
    # Brow mask: each brow polygon, grown a little, feathered.
    m = Image.new("L", (W, H), 0); d = ImageDraw.Draw(m)
    for idx in (BROW_L, BROW_R):
        pts = lm[idx]
        c = pts.mean(0); pts = c + (pts - c) * 1.35  # grow ~35% around its centre
        d.polygon([tuple(p) for p in pts], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(face_w * 0.012))
    a = np.asarray(m, dtype=np.float32)[..., None] / 255
    o = np.asarray(orig, dtype=np.float32); r = np.asarray(raw, dtype=np.float32)
    # Global lightening: median RGB shift on a skin ring above the brows (outside the mask).
    ring = Image.new("L", (W, H), 0); dr = ImageDraw.Draw(ring)
    for idx in (BROW_L, BROW_R):
        pts = lm[idx]; c = pts.mean(0); dr.polygon([tuple(p) for p in c + (pts - c) * 2.2], fill=255)
    ring = (np.asarray(ring) > 0) & (np.asarray(m) < 10)
    shift = np.median(r[ring] - o[ring], axis=0)
    fixed = o * (1 - a) + np.clip(r - shift, 0, 255) * a
    Image.fromarray(fixed.astype(np.uint8)).save(os.path.join(OUT, f"{face}__brows_fixed.jpg"), quality=95)
    Lo, Lr, Lf = lab(o), lab(r), lab(fixed)
    rr = max(4, int(face_w * 0.04))
    spots = {"forehead": lm[FOREHEAD], "cheek_l": lm[CHEEK_L], "cheek_r": lm[CHEEK_R]}
    if face == "F6":
        spots["scalp"] = lm[TOP] + np.array([0, -face_w * 0.25])
    res = {"face": face, "raw_shift_rgb": [round(float(x), 1) for x in shift]}
    for k, pt in spots.items():
        b0, b1, b2 = patch_L(Lo, pt, rr), patch_L(Lr, pt, rr), patch_L(Lf, pt, rr)
        res[k] = {"L_orig": round(b0, 1), "dL_raw": round(b1 - b0, 1), "dL_fixed": round(b2 - b0, 1)}
    # Brow darkness kept? mean L inside the mask core, raw vs fixed vs original.
    core = np.asarray(m) > 200
    res["brow_core_L"] = {"orig": round(float(Lo[core][:, 0].mean()), 1), "raw": round(float(Lr[core][:, 0].mean()), 1), "fixed": round(float(Lf[core][:, 0].mean()), 1)}
    # Side-by-side: original | raw API | fixed, full and brow close-up.
    trip = Image.new("RGB", (W * 3, H), "white")
    for i, im in enumerate([orig, raw, Image.fromarray(fixed.astype(np.uint8))]): trip.paste(im, (i * W, 0))
    trip.save(os.path.join(OUT, f"{face}__brows_compare.jpg"), quality=90)
    x0, x1 = int(lm[[*BROW_L, *BROW_R]][:, 0].min() - face_w * .1), int(lm[[*BROW_L, *BROW_R]][:, 0].max() + face_w * .1)
    y0, y1 = int(lm[[*BROW_L, *BROW_R]][:, 1].min() - face_w * .15), int(lm[[*BROW_L, *BROW_R]][:, 1].max() + face_w * .12)
    cw = x1 - x0; zoom = Image.new("RGB", (cw * 3, y1 - y0), "white")
    for i, im in enumerate([orig, raw, Image.fromarray(fixed.astype(np.uint8))]): zoom.paste(im.crop((x0, y0, x1, y1)), (i * cw, 0))
    zoom.save(os.path.join(OUT, f"{face}__brows_zoom.jpg"), quality=92)
    return res


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True); os.makedirs(os.path.join(HERE, "cache"), exist_ok=True)
    allres = [run(f) for f in sys.argv[1:]]
    json.dump(allres, open(os.path.join(OUT, "brow_measure.json"), "w"), indent=2)
    for r in allres: print(json.dumps(r))
