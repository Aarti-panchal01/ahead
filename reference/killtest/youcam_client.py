"""Wig try-on kill test harness (see SPEC.md). Throwaway.

  python killtest.py p0                 F1 x first built-in template
  python killtest.py pair <phase> <face> <ref-id-or-template:ID>

Never retries a task create. Polls every task to success/error. Caches by hash of
(source bytes, reference bytes or template, params). Hard cap 150 units (ledger.json).
"""
import hashlib, io, json, os, sys, time
import requests
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://yce-api-01.makeupar.com"
CAP = 150
KEY = next(l.split("=", 1)[1].strip().strip('"') for l in open(os.path.join(HERE, ".env")) if l.startswith("YOUCAM_API_KEY="))
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
LEDGER = os.path.join(HERE, "ledger.json")
CACHE = os.path.join(HERE, "cache")
os.makedirs(CACHE, exist_ok=True)


def ledger():
    return json.load(open(LEDGER)) if os.path.exists(LEDGER) else {"cap": CAP, "spent": 0, "calls": []}


def balance():
    r = requests.get(f"{BASE}/s2s/v1.0/client/credit", headers=H, timeout=30).json()
    return round(sum(float(x.get("amount_dec", x.get("amount", 0))) for x in r["results"]), 2)


def feature_cost(name="hair-transfer"):
    r = requests.get(f"{BASE}/s2s/v2.0/credit/feature-cost", headers=H, timeout=30).json()
    return r


def prep(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail((1024, 1024), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, "JPEG", quality=93)
    return b.getvalue(), im.size


def upload(data, name):
    meta = {"files": [{"content_type": "image/jpg", "file_name": name, "file_size": len(data)}]}
    r = requests.post(f"{BASE}/s2s/v2.0/file", headers=H, json=meta, timeout=60)
    j = r.json()
    f = j["data"]["files"][0]
    req = f["requests"][0]
    p = requests.put(req["url"], data=data, headers=req.get("headers", {"Content-Type": "image/jpg"}), timeout=120)
    p.raise_for_status()
    return f["file_id"]


def templates():
    r = requests.get(f"{BASE}/s2s/v2.1/task/template/hair-transfer?page_size=20", headers=H, timeout=30)
    return r.json()


def run(phase, face, ref, cost_per_call, feature="hair-transfer", version="v2.1", salt=""):
    face_path = os.path.join(HERE, "inputs", "faces", f"{face}.jpg")
    src, src_size = prep(face_path)
    params = {}
    if ref.startswith("makeup:"):
        # makeup-vto docs: effects[] + version "1.0"; eyebrows category, type "shape" draws a brow (sparse brows need shape, not just colour)
        params = {"version": "1.0", "effects": [{"category": "eyebrows",
                  "pattern": {"type": "shape", "name": "Arrow1", "curvature": 0, "thickness": 0, "definition": 30},  # Arrow1 = "Soft Arch, Balanced" in eyebrows.json
                  "palettes": [{"color": "#3a2a22", "colorIntensity": 60, "texture": "matte"}]}]}  # soft dark brown for deep skin, natural not black
        ref_bytes, ref_name = json.dumps(params, sort_keys=True).encode(), ref.replace(":", "_")
    elif ref == "analysis:hairlength":
        params = {}  # docs: src_file_id only
        ref_bytes, ref_name = b"hair-length-detection", "hairlength"
    elif ref == "analysis:skintone":
        params = {"face_angle_strictness_level": "medium"}  # same as LookShift's reader
        ref_bytes, ref_name = json.dumps(params).encode(), "skintone"
    elif ref.startswith("template:"):
        params["template_id"] = ref.split(":", 1)[1]
        ref_bytes, ref_name = params["template_id"].encode(), ref.replace(":", "_")
    else:
        sub = "headwear" if ref.startswith("H") else "wigs"
        ref_bytes, _ = prep(os.path.join(HERE, "inputs", sub, f"{ref}.jpg"))
        ref_name = ref
        if feature == "hair-transfer":
            params["hair_color"] = "ref"  # docs v2.1: "ref" | "src", default "ref"; sent explicitly so the wig's colour wins
        else:
            params["gender"] = "female"  # hat/scarf docs: gender required; style left at its default ("random")
    key = hashlib.sha256(src + b"|" + ref_bytes + b"|" + json.dumps(params, sort_keys=True).encode() + salt.encode() + feature.encode()).hexdigest()
    out_dir = os.path.join(HERE, "results", phase)
    os.makedirs(out_dir, exist_ok=True)
    base = os.path.join(out_dir, f"{face}__{ref_name}{'__' + salt if salt else ''}")
    if os.path.exists(os.path.join(CACHE, key + ".json")):
        print("cached", base)
        return json.load(open(os.path.join(CACHE, key + ".json")))

    L = ledger()
    bal0 = balance()
    if L["spent"] + cost_per_call > CAP:
        print(f"STOP: next call ({cost_per_call}) would cross the {CAP}-unit cap (spent {L['spent']})")
        sys.exit(2)
    payload = {"src_file_id": upload(src, f"{face}.jpg")}
    if ref.startswith("makeup:") or ref.startswith("analysis:"):
        payload.update(params)
    elif "template_id" in params:
        payload["template_id"] = params["template_id"]
    else:
        payload["ref_file_id"] = upload(ref_bytes, f"{ref_name}.jpg")
        payload.update({k: v for k, v in params.items() if k != "template_id"})
    t0 = time.time()
    cr = requests.post(f"{BASE}/s2s/{version}/task/{feature}", headers=H, json=payload, timeout=60)  # never retried
    create = cr.json()
    rec = {"phase": phase, "face": face, "ref": ref, "endpoint": f"POST /s2s/{version}/task/{feature}", "payload_sent": payload,
           "src_sent_size": src_size, "http_create": cr.status_code, "create": create, "balance_before": bal0}
    task_id = (create.get("data") or {}).get("task_id")
    final = None
    if task_id:
        while True:
            time.sleep(3)
            g = requests.get(f"{BASE}/s2s/{version}/task/{feature}/{task_id}", headers=H, timeout=60).json()
            st = (g.get("data") or {}).get("task_status")
            if st in ("success", "error"):
                final = g
                break
    rec["latency_s"] = round(time.time() - t0, 1)
    rec["final"] = final
    d = (final or {}).get("data") or {}
    rec["status"] = d.get("task_status") or "create_failed"
    rec["error_code"] = d.get("error") or create.get("error_code") or create.get("error")
    url = (d.get("results") or {}).get("url") if isinstance(d.get("results"), dict) else None
    if not url and isinstance(d.get("results"), list) and d["results"]:
        url = d["results"][0].get("url")
    if url:
        open(base + ".jpg", "wb").write(requests.get(url, timeout=120).content)
        rec["result"] = os.path.relpath(base + ".jpg", HERE)
    bal1 = balance()
    rec["balance_after"] = bal1
    rec["units_charged"] = round(bal0 - bal1, 2)
    json.dump(rec, open(base + ".json", "w"), indent=2)
    json.dump(rec, open(os.path.join(CACHE, key + ".json"), "w"), indent=2)
    L["spent"] += rec["units_charged"]
    L["calls"].append({"id": os.path.relpath(base, os.path.join(HERE, "results")).replace("\\", "/"), "units": rec["units_charged"], "status": rec["status"], "error": rec["error_code"], "latency_s": rec["latency_s"], "balance_after": bal1})
    json.dump(L, open(LEDGER, "w"), indent=2)
    print(json.dumps({k: rec[k] for k in ("status", "error_code", "latency_s", "units_charged", "balance_before", "balance_after")}))
    return rec


def run_type(faces):
    """Hair type detection: src_file_ids = [frontFace, rightFace, leftFace], all the same size. 2 units. Never retried."""
    L = ledger()
    if L["spent"] + 2 > CAP:
        print("STOP: cap"); sys.exit(2)
    bal0 = balance()
    imgs = [prep(os.path.join(HERE, "inputs", "faces", f"{f}.jpg")) for f in faces]
    assert len({sz for _, sz in imgs}) == 1, "images must be identical size"
    payload = {"src_file_ids": [upload(b, f"{f}.jpg") for f, (b, _) in zip(faces, imgs)]}
    t0 = time.time()
    cr = requests.post(f"{BASE}/s2s/v2.0/task/hair-type-detection", headers=H, json=payload, timeout=60)  # never retried
    create = cr.json(); task_id = (create.get("data") or {}).get("task_id"); final = None
    while task_id:
        time.sleep(3)
        g = requests.get(f"{BASE}/s2s/v2.0/task/hair-type-detection/{task_id}", headers=H, timeout=60).json()
        if (g.get("data") or {}).get("task_status") in ("success", "error"):
            final = g; break
    d = (final or {}).get("data") or {}
    bal1 = balance()
    rec = {"phase": "p10", "face": faces[0], "ref": "analysis:hairtype", "endpoint": "POST /s2s/v2.0/task/hair-type-detection",
           "payload_sent": {"src_file_ids": ["<frontFace " + faces[0] + ">", "<rightFace " + faces[1] + ">", "<leftFace " + faces[2] + ">"]},
           "src_sent_size": imgs[0][1], "http_create": cr.status_code, "create": create, "final": final, "status": d.get("task_status") or "create_failed",
           "error_code": d.get("error") or create.get("error_code"), "latency_s": round(time.time() - t0, 1), "balance_before": bal0, "balance_after": bal1, "units_charged": round(bal0 - bal1, 2)}
    os.makedirs(os.path.join(HERE, "results", "p10"), exist_ok=True)
    json.dump(rec, open(os.path.join(HERE, "results", "p10", f"{faces[0]}__hairtype.json"), "w"), indent=2)
    L["spent"] += rec["units_charged"]
    L["calls"].append({"id": f"p10/{faces[0]}__hairtype", "units": rec["units_charged"], "status": rec["status"], "error": rec["error_code"], "latency_s": rec["latency_s"], "balance_after": bal1})
    json.dump(L, open(LEDGER, "w"), indent=2)
    print(json.dumps({k: rec[k] for k in ("status", "error_code", "latency_s", "units_charged", "balance_after")}), json.dumps(d.get("results"))[:400])


if __name__ == "__main__":
    cmd = sys.argv[1]
    fc = feature_cost()
    json.dump(fc, open(os.path.join(HERE, "feature-cost.json"), "w"), indent=2)
    cost = 2  # docs: v2.1 = 2 units preset and custom; checked against feature-cost.json below
    if cmd == "p0":
        t = templates()
        json.dump(t, open(os.path.join(HERE, "templates.json"), "w"), indent=2)
        tid = next(x["id"] for x in t["data"]["templates"] if x["category_name"] == "Female")
        run("p0", "F1", f"template:{tid}", cost)
    elif cmd == "p1":
        for f in ["F1", "F2", "F3", "F4"]:
            for w in ["W1", "W2", "W3", "W4"]:
                run("p1", f, w, cost)
    elif cmd == "rest":
        tid = "female_sleek_middle_part"  # same template as P0, so the controls compare
        for f in ["F1", "F2"]:
            for w in ["W5", "W6", "W7"]:
                run("p2", f, w, cost)
        print("P3 skipped: no R files")
        for f in ["F2", "F3"]:
            run("p4", f, f"template:{tid}", cost)
        run("p5", "F5", "W1", cost)
        run("p5", "F5", "H1", 2, feature="scarf", version="v2.0")
        run("p5", "F5", "H2", 2, feature="hat", version="v2.0")
        for f, w in [("F2", "W2"), ("F4", "W3")]:
            run("p6", f, w, cost, salt="rerun")
        for f in ["S1", "S2", "S3"]:
            for w in ["W1", "W4"]:
                run("p7", f, w, cost)
    elif cmd == "p8":
        for f, w in [("F6", "W1"), ("F6", "W4"), ("F1", "W8"), ("F6", "W8")]:
            run("p8", f, w, cost)
        run("p8", "F6", "makeup:brows", 1, feature="makeup-vto", version="v2.0")
    elif cmd == "p9":
        for f in ["F1", "F2", "F3"]:
            run("p9", f, "makeup:brows", 1, feature="makeup-vto", version="v2.0")
        tone = next(x for x in json.load(open(os.path.join(HERE, "feature-cost-all.json"))) if x["run_task_url"].endswith("/skin-tone-analysis"))["amount"]
        if tone <= 20:
            run("p9", "F1", "analysis:skintone", int(tone), feature="skin-tone-analysis", version="v2.0")
    elif cmd == "p10len":
        assert os.path.exists(os.path.join(HERE, "labels.json")), "labels.json must exist before any P10 call"
        for f in ["F1", "F2", "F3", "F4", "F5", "F6", "F7"]:
            run("p10", f, "analysis:hairlength", 2, feature="hair-length-detection", version="v2.0")
    elif cmd == "p10b":
        run_type(["G1", "G1_R", "G1_L"])
        run("p10", "F3", "analysis:hairlength", 2, feature="hair-length-detection", version="v2.0", salt="retry")
    elif cmd == "pair":
        run(sys.argv[2], sys.argv[3], sys.argv[4], cost)
