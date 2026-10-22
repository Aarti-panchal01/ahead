# Wig kill test summary

All test images are AI-generated (Gemini).

- Calls: 54 (p0, p1, p10, p2, p4, p5, p6, p7, p8, p9); success 46
- Units spent: 106.0 of the 150 cap; balance now 285.0
- Latency: p50 8.8 s, p90 20.6 s
- Errors by code: {'unknown_internal_error': 1, 'error_face_angle_invalid': 1, 'error_no_face': 6}
- Params on every P1 call: src_file_id, ref_file_id, hair_color="ref" (docs: take the colour from the reference)

## Verdict
- P1 passes (>= 4 on all three): 16 of 16 (need >= 10; early stop if fewer than 4 look like the wig)
- Passes per face: {'F1': 4, 'F2': 4, 'F3': 4, 'F4': 4} (need >= 2 each)
- Reference type stores use: on-model (P1) works; mannequin/flat (P2): all rejected, error_no_face, 0 units

**PASS so far (P1 criteria met)**

## Per phase

- p0: F1__template_female_sleek_middle_part success (2.0u, 8.8s)
- p1: F1__W1 success (2.0u, 8.9s), F1__W2 success (2.0u, 9.1s), F1__W3 success (2.0u, 9.6s), F1__W4 success (2.0u, 9.4s), F2__W1 success (2.0u, 8.8s), F2__W2 success (2.0u, 8.8s), F2__W3 success (2.0u, 9.2s), F2__W4 success (2.0u, 8.8s), F3__W1 success (2.0u, 8.8s), F3__W2 success (2.0u, 8.7s), F3__W3 success (2.0u, 8.8s), F3__W4 success (2.0u, 8.9s), F4__W1 success (2.0u, 8.8s), F4__W2 success (2.0u, 8.8s), F4__W3 success (2.0u, 8.8s), F4__W4 success (2.0u, 8.9s)
- p10: F1__hairlength success (2.0u, 20.5s), F2__hairlength success (2.0u, 8.8s), F3__hairlength error unknown_internal_error (0.0u, 20.5s), F3__hairlength__retry success (2.0u, 8.8s), F4__hairlength success (2.0u, 8.7s), F5__hairlength success (2.0u, 8.8s), F6__hairlength success (2.0u, 8.8s), F7__hairlength success (2.0u, 16.6s), G1__hairtype error error_face_angle_invalid (0.0u, 5.8s)
- p2: F1__W5 error error_no_face (0.0u, 4.9s), F1__W6 error error_no_face (0.0u, 4.9s), F1__W7 error error_no_face (0.0u, 5.0s), F2__W5 error error_no_face (0.0u, 12.7s), F2__W6 error error_no_face (0.0u, 4.9s), F2__W7 error error_no_face (0.0u, 4.9s)
- p4: F2__template_female_sleek_middle_part success (2.0u, 8.7s), F3__template_female_sleek_middle_part success (2.0u, 8.7s)
- p5: F5__H1 success (2.0u, 12.8s), F5__H2 success (2.0u, 20.7s), F5__W1 success (2.0u, 8.8s)
- p6: F2__W2__rerun success (2.0u, 16.6s), F4__W3__rerun success (2.0u, 20.4s)
- p7: S1__W1 success (2.0u, 28.3s), S1__W4 success (2.0u, 24.5s), S2__W1 success (2.0u, 32.2s), S2__W4 success (2.0u, 28.4s), S3__W1 success (2.0u, 20.6s), S3__W4 success (2.0u, 12.7s)
- p8: F1__W8 success (2.0u, 8.8s), F6__W1 success (2.0u, 8.9s), F6__W4 success (2.0u, 12.7s), F6__W8 success (2.0u, 8.8s), F6__makeup_brows success (1.0u, 8.9s)
- p9: F1__makeup_brows success (1.0u, 9.1s), F1__skintone success (20.0u, 8.8s), F2__makeup_brows success (1.0u, 10.0s), F3__makeup_brows success (1.0u, 8.9s)
- p3: skipped (no R files)

## Flags (from looking at the results)

- P2: hair-transfer rejects wig photos with no face in them (mannequin head, flat lay): error_no_face, 0 units. Only on-model wig photos work as references.
- P5: F5 (buzz cut) x W1 did NOT give error_hair_too_short. It succeeded (2 units) and looks convincing, which matters for hair-loss users.
- P5: scarf and hat APIs do not keep the person. They generate a new full-body fashion scene (new outfit, street background, different-looking person). Not usable as an on-me try-on for headwear.
- P4 / P0: the built-in template turned F1 and F3 grey although keep_users_color is true; F2 kept black. Template colour is unreliable; custom references with hair_color=ref were faithful.
- P6: both reruns look the same as the first run (stable).
- P7: all 6 phone-style selfies worked: glasses kept, ponytail and braids replaced cleanly, home/kitchen/park backgrounds kept. No error codes.
- Background, face and clothing unchanged in every hair-transfer result we looked at; no visible skin tone shift (judged by eye).
- P8 bald (F6): wigs W1 and W4 both work on a fully bald head (no error, convincing hairline).
- P8 head wrap via hair-transfer: W8 (person wearing a wrap) used as the reference puts the wrap on F1 and F6, face, skin and background kept. Hair-transfer can do head wraps when the reference is worn by a person. W8 source is only 778x768 (under 1024).
- P10 hair length (labels saved first in labels.json; 2 units each, 12 spent): F1 medium -> 'above chest' (= the docs' Medium-Length) MATCH; F2 short -> 'short hair' MATCH; F3 long -> error unknown_internal_error, 0 units, not retried; F4 short -> 'short hair' MATCH; F5 above ear -> 'above the ears' MATCH; F6 bald -> 'above the ears' WRONG (there is no 'no hair' answer, it reports hair on a bald head); F7 medium -> 'above chest' MATCH. 5 of 7 match, 1 error, 1 wrong.
- P10 hair type on F2: NOT RUN (the side views sent were a different woman). Run instead on G1 (that fair woman, label type 1 straight; front + right + left, all 768x1024): error_face_angle_invalid, 0 units, not retried. Possible cause: our right/left assignment (docs order frontFace, rightFace, leftFace) or the side turn not meeting the angle rule.
- P10 F3 length retry: success, 'long hair' = label long. The first F3 error was transient.
- P9 brow fairness (same brow call on F1, F2, F3 + F6): makeup-vto lightens every face by about the same amount, forehead +4.6 to +5.0 L*, cheeks +4.1 to +5.0 L*, F6 scalp +4.8. It does NOT depend on skin tone, but it is visible on all of them.
- P9 brow fix (0 units): brows pasted back with a feathered landmark mask (MediaPipe brow outline, grown 35%), after removing the global shift measured on a skin ring around the brows. Forehead, cheeks and scalp: 0.0 L* change on all four faces. Brows stay visible (brow area 2.6 to 4.8 L* darker than the original on F1, F3, F6). F2's own brows are darker than the brow colour sent, so her brow area came out 1.3 L* lighter: pick the brow colour from her own brows or hair, not a fixed brown.
- P9 skin-tone-analysis (20 units, F1): returns a hair colour. results.color = eye_color, eye_color_name, lip_color, eyebrow_color, skin_color, hair_color (#42280E), hair_color_name (Brown); face_quality = has_face, area (toosmall at 768x1024), frontal, lighting, faceangle. F1's hair is light brown with grey; it read a darker brown.
- P8 brows (makeup-vto, 1 unit): eyebrows shape Arrow1 (Soft Arch, Balanced), definition 30, #3a2a22 at 60% matte. A soft natural brow is drawn, BUT the whole face got lighter: measured +4.5 to +5.4 L* on forehead, cheek and scalp. That is a visible skin-lightening on deep skin. Fix to test: paste only the brow region back onto the original (as LookShift does for lips).

## API truth table

| # | What we tested | What YouCam actually does | Evidence | Consequence / fix |
|---|---|---|---|---|
| 1 | Hair-transfer with an on-model wig photo (hair_color=ref) | Puts the wig on convincingly: colour, length, cut, texture; face, skin, background kept | P1 16/16 scored 5/5; P6 reruns identical; P7 phone selfies 6/6 | Core feature works on fair to deep skin, straight to coily hair, glasses, ponytail, braids |
| 2 | Hair-transfer on a buzz cut and a fully bald head | Works; no error_hair_too_short | P5 F5 x W1; P8 F6 x W1, W4 | Fine for people with hair loss |
| 3 | Hair-transfer with a mannequin-head or flat-lay wig photo | Rejected: error_no_face, 0 units | P2 6/6 | Stores must supply on-model photos |
| 4 | Hair-transfer with a person wearing a head wrap | Puts the wrap on the user, person kept | P8 F1, F6 x W8 | Head wraps can go through hair-transfer |
| 5 | Hat and scarf APIs | Replace the person: new full-body fashion scene, new outfit, street background | P5 F5 x H1, H2 | Not usable as a try-on on the user |
| 6 | Built-in hairstyle templates | Turned F1 and F3 grey although keep_users_color is true; F2 kept black | P0, P4 | Do not rely on templates for colour |
| 7 | Makeup VTO (brows) | Draws a soft brow but lightens the whole face about +5 L* on every skin tone (forehead +4.6 to +5.0, cheeks +4.1 to +5.0) | P8, P9 (F1, F2, F3, F6) | Paste back only the brows (feathered landmark mask, global shift removed): 0.0 L* change outside the brows on all four |
| 8 | Brow colour | A fixed brown came out lighter than F2's own dark brows (-1.3 L* brighter in the brow area) | P9 | Pick brow colour per person (skin-tone-analysis returns eyebrow_color) |
| 9 | Skin-tone analysis (20 units) | Returns hair_color + hair_color_name and eyebrow_color; read F1's light brown/grey hair as darker brown; flagged face area 'toosmall' at 768x1024 | P9 F1 | Hair colour reading exists but is approximate; crop tighter |
| 10 | Hair length detection | Right on normal hair (F1, F2, F4, F5, F7, F3 on retry); reports a bald head as 'above the ears' | P10 | There is no 'no hair' answer: detect baldness yourself or ask |
| 11 | Hair length errors | F3 failed once (unknown_internal_error, 0 units), retry gave 'long hair' | P10 | Transient; one retry is reasonable in a product |
| 12 | Hair type detection (3 photos) | G1 (straight, label type 1): error_face_angle_invalid, 0 units | P10 | Needs exact side angles; untested beyond this one call |
| 13 | Thinning hair (F7) | Length read 'above chest' (= medium, correct); nothing in the length result says thinning | P10 F7 | Thinning needs the density detector (head-lowered 45 degree photo), not run |
| 14 | Brow colour and intensity (makeup-vto eyebrows, shape mode) | Barely change the render: #674D40 at 80 vs at 60 differ in 435 px; #4E362A at 70 vs #674D40 at 80 differ in about 2,700 px. The brow stays soft whatever we set | Hero test, P1B (browA, browB) | Use the user's own brow colour about 10 L* darker at intensity 70; don't promise a bold brow |
| 15 | Hair-transfer on top of a brow result (full look) | Brows survive (brow area L* 63.8 bald, 59.6 with brows, 57.2 after hair-transfer) | Hero test, P1B brows B + W01 | Order: brows (composited) first, then hair-transfer |
| 16 | Hair-transfer skin drift on the full look | Cheeks and nose 2.1 to 2.8 L* darker than the bald original, chin +0.8 | Hero test, P1B brows B + W01 | Integrity check threshold set to ΔE2000 2; correct and tell the user |
