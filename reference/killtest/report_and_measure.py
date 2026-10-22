"""Builds report.html (score inputs, saved to scores.json via serve.py) and summary.md from results/."""
import glob, json, os, statistics
HERE = os.path.dirname(os.path.abspath(__file__))
recs = []
for p in sorted(glob.glob(os.path.join(HERE, "results", "*", "*.json"))):
    r = json.load(open(p))
    if not isinstance(r, dict) or "phase" not in r: continue
    r["_id"] = os.path.relpath(p, os.path.join(HERE, "results")).replace("\\", "/")[:-5]; recs.append(r)
def refimg(r):
    ref = r["ref"]
    if ref.startswith("template:"): return None
    return f"inputs/{'headwear' if ref.startswith('H') else 'wigs'}/{ref}.jpg"
rows = ""
for r in recs:
    ri = refimg(r)
    sent = {k: (v if not k.endswith("file_id") else "<file_id>") for k, v in r["payload_sent"].items()}
    rows += f'''<tr data-id="{r["_id"]}"><td><b>{r["_id"]}</b><br>{r["status"]}{(" / "+str(r["error_code"])) if r["error_code"] else ""}<br>{r["latency_s"]} s, {r["units_charged"]} units<br><code>{json.dumps(sent)}</code></td>
<td><img src="inputs/faces/{r["face"]}.jpg"></td><td>{f'<img src="{ri}">' if ri else r["ref"]}</td><td>{f'<img src="{r["result"]}">' if r.get("result") else "no result"}</td>
<td>{"".join(f'<label>{n}<select name="{k}"><option></option>{"".join(f"<option>{i}</option>" for i in range(1,6))}</select></label>' for k,n in [("identity","Identity kept"),("match","Wig match"),("realism","Realism")])}<label>Note<input name="note"></label></td></tr>'''
bm_p = os.path.join(HERE, "results", "p9", "brow_measure.json")
bm = json.load(open(bm_p)) if os.path.exists(bm_p) else []
p9 = "".join(f'<h3>{m["face"]}: original | raw API | fixed</h3><img style="width:100%;max-width:1100px" src="results/p9/{m["face"]}__brows_compare.jpg"><img style="width:100%;max-width:1100px" src="results/p9/{m["face"]}__brows_zoom.jpg"><p>' + ", ".join(f'{k}: raw {v["dL_raw"]:+} L*, fixed {v["dL_fixed"]:+} L*' for k, v in m.items() if isinstance(v, dict) and "dL_raw" in v) + "</p>" for m in bm)
st_p = os.path.join(HERE, "results", "p9", "F1__skintone.json")
st = json.dumps(json.load(open(st_p))["final"]["data"]["results"], indent=1) if os.path.exists(st_p) else ""
p9 = f'<h2>P9 brow fix (paste only the brows back) and skin-tone read</h2>{p9}<h3>F1 skin-tone-analysis fields (20 units)</h3><pre>{st}</pre>' if bm else ""
html = f'''<!doctype html><html><head><meta charset="utf-8"><title>Wig kill test</title><style>
:root{{--bg:#fff;--fg:#111;--line:#ddd}}@media (prefers-color-scheme:dark){{:root{{--bg:#111;--fg:#eee;--line:#333}}}}
body{{font-family:Arial,sans-serif;background:var(--bg);color:var(--fg);margin:16px}}table{{border-collapse:collapse;width:100%}}td{{border-top:1px solid var(--line);padding:8px;vertical-align:top}}
img{{width:220px}}label{{display:block;margin:6px 0;font-size:15px}}select,input{{font-size:16px;margin-left:6px}}code{{font-size:11px;word-break:break-all}}#bar{{position:sticky;top:0;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line)}}button{{font-size:16px;padding:6px 14px}}
</style></head><body><div id="bar"><b>Wig kill test</b>: all test images are AI-generated (Gemini). Score 1-5. <button onclick="save()">Save scores</button> <span id="msg"></span></div>
<table>{rows}</table>{p9}<script>
const KEY="killtest-scores";
function collect(){{const o={{}};document.querySelectorAll("tr[data-id]").forEach(tr=>{{const s={{}};tr.querySelectorAll("select,input").forEach(e=>{{if(e.value)s[e.name]=e.tagName==="SELECT"?+e.value:e.value}});if(Object.keys(s).length)o[tr.dataset.id]=s}});return o}}
function apply(o){{for(const[id,s]of Object.entries(o||{{}})){{const tr=document.querySelector(`tr[data-id="${{id}}"]`);if(!tr)continue;for(const[k,v]of Object.entries(s)){{const e=tr.querySelector(`[name="${{k}}"]`);if(e)e.value=v}}}}}}
async function save(){{const o=collect();try{{localStorage.setItem(KEY,JSON.stringify(o))}}catch(e){{}}
try{{const r=await fetch("/scores",{{method:"POST",headers:{{"Content-Type":"application/json"}},body:JSON.stringify(o)}});if(!r.ok)throw 0;msg.textContent="Saved to scores.json"}}
catch(e){{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(o,null,2)],{{type:"application/json"}}));a.download="scores.json";a.click();msg.textContent="Server not running: downloaded scores.json instead (put it in killtest/)"}}}}
fetch("/scores").then(r=>r.ok?r.json():null).then(o=>apply(o)).catch(()=>{{try{{apply(JSON.parse(localStorage.getItem(KEY)))}}catch(e){{}}}});
</script></body></html>'''
open(os.path.join(HERE, "report.html"), "w", encoding="utf-8").write(html)

lat = sorted(r["latency_s"] for r in recs)
q = lambda p: lat[min(len(lat) - 1, int(round(p * (len(lat) - 1))))]
errs = {}
for r in recs:
    if r["error_code"]: errs[r["error_code"]] = errs.get(r["error_code"], 0) + 1
L = json.load(open(os.path.join(HERE, "ledger.json")))
scores = json.load(open(os.path.join(HERE, "scores.json"))) if os.path.exists(os.path.join(HERE, "scores.json")) else {}
p1 = [r for r in recs if r["_id"].startswith("p1/")]
def passed(id_):
    s = scores.get(id_, {}); return all(s.get(k, 0) >= 4 for k in ("identity", "match", "realism"))
scored = [r for r in p1 if all(k in scores.get(r["_id"], {}) for k in ("identity", "match", "realism"))]
lines = ["# Wig kill test summary", "", "All test images are AI-generated (Gemini).", "",
         f"- Calls: {len(recs)} ({', '.join(sorted(set(r['_id'].split('/')[0] for r in recs)))}); success {sum(r['status']=='success' for r in recs)}",
         f"- Units spent: {L['spent']} of the {L['cap']} cap; balance now {min(r['balance_after'] for r in recs) if recs else '?'}",
         f"- Latency: p50 {q(0.5)} s, p90 {q(0.9)} s", f"- Errors by code: {errs or 'none'}",
         "- Params on every P1 call: src_file_id, ref_file_id, hair_color=\"ref\" (docs: take the colour from the reference)", "", "## Verdict"]
if len(scored) < len(p1):
    lines.append(f"PENDING: {len(scored)} of {len(p1)} P1 results scored. Score them in report.html, then rerun build_report.py.")
else:
    n = sum(passed(r["_id"]) for r in p1)
    per = {f: sum(passed(r["_id"]) for r in p1 if r["face"] == f) for f in ["F1", "F2", "F3", "F4"]}
    lines += [f"- P1 passes (>= 4 on all three): {n} of 16 (need >= 10; early stop if fewer than 4 look like the wig)", f"- Passes per face: {per} (need >= 2 each)",
              "- Reference type stores use: on-model (P1) " + ("works" if n >= 10 else "does not meet the bar") + "; mannequin/flat (P2): " + ("all rejected, " + ", ".join(sorted({str(r['error_code']) for r in recs if r['_id'].startswith('p2/')})) + ", 0 units" if all(r['status'] != 'success' for r in recs if r['_id'].startswith('p2/')) else "some worked, see report"),
              "", "**" + ("KILL (early stop)" if n < 4 else "PASS so far (P1 criteria met)" if n >= 10 and min(per.values()) >= 2 else "KILL") + "**"]
lines += ["", "## Per phase", ""] + [f"- {ph}: " + ", ".join(f"{r['_id'].split('/')[1]} {r['status']}{(' ' + str(r['error_code'])) if r['error_code'] else ''} ({r['units_charged']}u, {r['latency_s']}s)" for r in recs if r['_id'].startswith(ph + '/')) for ph in sorted(set(r['_id'].split('/')[0] for r in recs))]
lines += ["- p3: skipped (no R files)", "", "## Flags (from looking at the results)", "",
  "- P2: hair-transfer rejects wig photos with no face in them (mannequin head, flat lay): error_no_face, 0 units. Only on-model wig photos work as references.",
  "- P5: F5 (buzz cut) x W1 did NOT give error_hair_too_short. It succeeded (2 units) and looks convincing, which matters for hair-loss users.",
  "- P5: scarf and hat APIs do not keep the person. They generate a new full-body fashion scene (new outfit, street background, different-looking person). Not usable as an on-me try-on for headwear.",
  "- P4 / P0: the built-in template turned F1 and F3 grey although keep_users_color is true; F2 kept black. Template colour is unreliable; custom references with hair_color=ref were faithful.",
  "- P6: both reruns look the same as the first run (stable).",
  "- P7: all 6 phone-style selfies worked: glasses kept, ponytail and braids replaced cleanly, home/kitchen/park backgrounds kept. No error codes.",
  "- Background, face and clothing unchanged in every hair-transfer result we looked at; no visible skin tone shift (judged by eye).",
  "- P8 bald (F6): wigs W1 and W4 both work on a fully bald head (no error, convincing hairline).",
  "- P8 head wrap via hair-transfer: W8 (person wearing a wrap) used as the reference puts the wrap on F1 and F6, face, skin and background kept. Hair-transfer can do head wraps when the reference is worn by a person. W8 source is only 778x768 (under 1024).",
  "- P10 hair length (labels saved first in labels.json; 2 units each, 12 spent): F1 medium -> 'above chest' (= the docs' Medium-Length) MATCH; F2 short -> 'short hair' MATCH; F3 long -> error unknown_internal_error, 0 units, not retried; F4 short -> 'short hair' MATCH; F5 above ear -> 'above the ears' MATCH; F6 bald -> 'above the ears' WRONG (there is no 'no hair' answer, it reports hair on a bald head); F7 medium -> 'above chest' MATCH. 5 of 7 match, 1 error, 1 wrong.",
  "- P10 hair type on F2: NOT RUN (the side views sent were a different woman). Run instead on G1 (that fair woman, label type 1 straight; front + right + left, all 768x1024): error_face_angle_invalid, 0 units, not retried. Possible cause: our right/left assignment (docs order frontFace, rightFace, leftFace) or the side turn not meeting the angle rule.",
  "- P10 F3 length retry: success, 'long hair' = label long. The first F3 error was transient.",
  "- P9 brow fairness (same brow call on F1, F2, F3 + F6): makeup-vto lightens every face by about the same amount, forehead +4.6 to +5.0 L*, cheeks +4.1 to +5.0 L*, F6 scalp +4.8. It does NOT depend on skin tone, but it is visible on all of them.",
  "- P9 brow fix (0 units): brows pasted back with a feathered landmark mask (MediaPipe brow outline, grown 35%), after removing the global shift measured on a skin ring around the brows. Forehead, cheeks and scalp: 0.0 L* change on all four faces. Brows stay visible (brow area 2.6 to 4.8 L* darker than the original on F1, F3, F6). F2's own brows are darker than the brow colour sent, so her brow area came out 1.3 L* lighter: pick the brow colour from her own brows or hair, not a fixed brown.",
  "- P9 skin-tone-analysis (20 units, F1): returns a hair colour. results.color = eye_color, eye_color_name, lip_color, eyebrow_color, skin_color, hair_color (#42280E), hair_color_name (Brown); face_quality = has_face, area (toosmall at 768x1024), frontal, lighting, faceangle. F1's hair is light brown with grey; it read a darker brown.",
  "- P8 brows (makeup-vto, 1 unit): eyebrows shape Arrow1 (Soft Arch, Balanced), definition 30, #3a2a22 at 60% matte. A soft natural brow is drawn, BUT the whole face got lighter: measured +4.5 to +5.4 L* on forehead, cheek and scalp. That is a visible skin-lightening on deep skin. Fix to test: paste only the brow region back onto the original (as LookShift does for lips)."]
lines += ["", "## API truth table", "", "| # | What we tested | What YouCam actually does | Evidence | Consequence / fix |", "|---|---|---|---|---|",
  "| 1 | Hair-transfer with an on-model wig photo (hair_color=ref) | Puts the wig on convincingly: colour, length, cut, texture; face, skin, background kept | P1 16/16 scored 5/5; P6 reruns identical; P7 phone selfies 6/6 | Core feature works on fair to deep skin, straight to coily hair, glasses, ponytail, braids |",
  "| 2 | Hair-transfer on a buzz cut and a fully bald head | Works; no error_hair_too_short | P5 F5 x W1; P8 F6 x W1, W4 | Fine for people with hair loss |",
  "| 3 | Hair-transfer with a mannequin-head or flat-lay wig photo | Rejected: error_no_face, 0 units | P2 6/6 | Stores must supply on-model photos |",
  "| 4 | Hair-transfer with a person wearing a head wrap | Puts the wrap on the user, person kept | P8 F1, F6 x W8 | Head wraps can go through hair-transfer |",
  "| 5 | Hat and scarf APIs | Replace the person: new full-body fashion scene, new outfit, street background | P5 F5 x H1, H2 | Not usable as a try-on on the user |",
  "| 6 | Built-in hairstyle templates | Turned F1 and F3 grey although keep_users_color is true; F2 kept black | P0, P4 | Do not rely on templates for colour |",
  "| 7 | Makeup VTO (brows) | Draws a soft brow but lightens the whole face about +5 L* on every skin tone (forehead +4.6 to +5.0, cheeks +4.1 to +5.0) | P8, P9 (F1, F2, F3, F6) | Paste back only the brows (feathered landmark mask, global shift removed): 0.0 L* change outside the brows on all four |",
  "| 8 | Brow colour | A fixed brown came out lighter than F2's own dark brows (-1.3 L* brighter in the brow area) | P9 | Pick brow colour per person (skin-tone-analysis returns eyebrow_color) |",
  "| 9 | Skin-tone analysis (20 units) | Returns hair_color + hair_color_name and eyebrow_color; read F1's light brown/grey hair as darker brown; flagged face area 'toosmall' at 768x1024 | P9 F1 | Hair colour reading exists but is approximate; crop tighter |",
  "| 10 | Hair length detection | Right on normal hair (F1, F2, F4, F5, F7, F3 on retry); reports a bald head as 'above the ears' | P10 | There is no 'no hair' answer: detect baldness yourself or ask |",
  "| 11 | Hair length errors | F3 failed once (unknown_internal_error, 0 units), retry gave 'long hair' | P10 | Transient; one retry is reasonable in a product |",
  "| 12 | Hair type detection (3 photos) | G1 (straight, label type 1): error_face_angle_invalid, 0 units | P10 | Needs exact side angles; untested beyond this one call |",
  "| 13 | Thinning hair (F7) | Length read 'above chest' (= medium, correct); nothing in the length result says thinning | P10 F7 | Thinning needs the density detector (head-lowered 45 degree photo), not run |"]
open(os.path.join(HERE, "summary.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines))
