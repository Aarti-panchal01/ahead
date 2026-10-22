# Ahead

Try on your next hair, before you lose this one.

![tests](https://img.shields.io/badge/tests-526%20unit%20%2B%2016%20e2e%20passing-2F6F5E)

## Quick access for judges

- **Live app:** https://try-ahead.vercel.app
- **Video:** [PLACEHOLDER: video link]
- **Try with a sample person (30 seconds, no photo, no key):** open the live app, tap "Try with a sample person", pick one of the four people (P1 to P4), choose "My hair is gone". Her hair is gone and the matched wigs and wraps appear on her, each with its skin tone check. Direct link to the result: https://try-ahead.vercel.app/results?person=P1&stage=gone
- **Own-photo live try-on:** needs a tester code, because every live render spends YouCam units. Tester code: [PLACEHOLDER: tester code] (the app asks for it when you use your own photo; it is kept for that visit only). Without it, your own photo still sets your hair colour and your matches on your device, and previews use the sample people.
- **Zero-key mock run:** `npm install && npm run dev`. Mock mode is the default: it replays recorded YouCam results and spends 0 units. No API key needed.
- **Where every claim is wired:** [docs/FACTS.md](docs/FACTS.md) maps each claim in this README to the file that implements it and the test that proves it. The API measurements behind it are in [docs/api-truth-table.md](docs/api-truth-table.md), also shown in the app at `/how-we-tested`.

## What it is

Ahead is for people facing treatment-related hair loss. Try wigs and head wraps on your own face, with your brows, before and after the hair goes. Every render is checked against your original photo, in your browser, so it is still you. It is a style and colour preview, not cap fit, density or comfort, and it makes no medical claims.

It also plans the cosmetic side: a calendar around a first treatment date, a colour match card to bring to a stylist, and a short-lived stylist brief link.

## YouCam APIs used

- **Hair transfer (`/s2s/v2.1/task/hair-transfer`)**: wigs and head wraps. Source photo plus an on-model reference photo, `hair_color: "ref"`, 2 units, 9 to 30 s. Works on a bald head and a buzz cut (truth table rows 1, 2, 4). A mannequin or flat-lay reference is rejected with `error_no_face` at 0 units, so the catalogue only uses photos of a person wearing the item (row 3). Built-in hairstyle templates are not used: their colour is unreliable (row 6). Hat and scarf APIs are not used: they replace the person (row 5).
- **Makeup VTO (`/s2s/v2.0/task/makeup-vto`)**: brows and lashes. YouCam smooths skin by default; the lightening we measured on every face comes from that default (row 20). We measured it, and turned it off: the request sends `skin_smooth` with strength 0 and colour intensity 0 (recorded in `fixtures/youcam/rec__P1B__lashes_raw.meta.json`). We still composite only the brow or lash region back onto the original (`lib/image/composite.ts`) and check every render. In the app, sample people show recorded brow renders, which were made before we found the setting, so they rely on that compositing; lashes are supported by the compositor and tested, and are not yet offered in the UI. See "Known limits" in [docs/FACTS.md](docs/FACTS.md).
- **Skin tone analysis findings**: a 20-unit call that returns a hair colour and a brow colour. We measured it (row 9): hair colour is approximate (greys read darker). The app does not spend those 20 units; it reads hair and brow colour in the browser, and the match card shows the real hair crop next to the swatch and says to bring a lock of hair to your stylist.
- **Task delete (`/s2s/v2.0/task/delete`)**: at the end of a session every finished YouCam task, with its input and output files, is deleted (row 17, verified 22 Oct, 0 units).
- **Beauty MCP server (`https://mcp-api-01.makeupar.com/mcp/beauty`)**: the consult agent calls `tools/list` through the Vercel AI SDK's MCP client. See "Which steps use MCP vs REST" below.

Not used: hair length, hair type and density detection. The length detector reports a bald head as "above the ears" (row 10), so the app asks "Has your hair loss started?" instead of guessing.

## How the integrity check works

After every YouCam result, the browser compares the render with the exact photo that was sent:

1. MediaPipe face landmarks (`lib/image/browser.ts`) find the face. Four skin patches are measured on both images: left cheek, right cheek, nose bridge and chin. Never the forehead, because hair or a wrap may cover it.
2. Each patch is compared in CIELAB: ΔE2000 and ΔL\*. Above ΔE2000 2, the render counts as changed.
3. The original inner face is pasted back with a feathered mask that stays clear of the hairline and of any hair in the render, then re-measured. The card says in plain words what happened: "Skin tone check: unchanged", or "Corrected: the try-on lightened your skin slightly, restored".
4. Hair shadow rule: a new bob that falls past the cheek shades the skin next to it. That is lighting, not a skin tone change, so a patch that is near newly added hair and much darker than the rest of the face is left out of the check, and the card says which part was left out.
5. If nothing can be measured, or the skin cannot be fully restored, the card says so in amber instead of claiming a pass.

The code is `lib/image/integrity.ts`; the threshold is `INTEGRITY_THRESHOLD = 2`. The check itself runs entirely in the browser.

## Privacy

- Consent comes before the camera (`/start`). The photo stays in memory in your browser; nothing is stored after the session.
- When live previews are on, your photo is sent to YouCam to make them, and at the end of the session the try-ons are deleted from YouCam. Uploads are re-encoded without metadata.
- The planning assistant (Groq, then Gemini, then a rule-based plan) never sees photos, your treatment date, your hair-loss stage or any health detail. It gets style preferences, sampled colours and the catalogue. The calendar is computed on our side. A claim linter checks every line of agent text for medical wording.
- Stylist briefs hold catalogue ids, two colours and a note. No photos, no accounts, an unguessable link that expires after 7 days.
- Units are limited so the demo cannot run dry: a persistent ledger, a per-day cap, a per-IP limit, a 30-unit cap per agent session with your approval before each paid step, and 150 units always kept in reserve for judging.

## The honesty page

`/how-we-tested` shows what YouCam actually did in our own tests on AI-generated faces: what worked, what failed, and what we changed because of it. It is generated from [docs/api-truth-table.md](docs/api-truth-table.md) when the app is built.

## AI-generated content

All demo people, test faces and catalogue wigs and wraps in this repo are AI-generated (Google Gemini). No real person appears in any image here. Every one is shown through `components/AiImage.tsx`, which always carries an "AI-generated" label.

All people and products shown are AI-generated (Gemini). Visible Gemini marks were cropped for layout; Google's invisible SynthID watermark is preserved.

## Which steps use MCP vs REST

The consult agent uses YouCam's beauty MCP server for discovery: it calls `tools/list` through the AI SDK MCP client (`lib/agent/mcp.ts`), and the agent can report which hair tools the server offers.

A try-on through MCP works, and it interoperates with our REST client. In our test (truth table row 23), `tools/call` on `AI-Hair-Style-Virtual-Try-On` returned a `task_id` at once; our REST client polled that same task to success in 6 s and then deleted it. 2 units, the same as REST.

Paid steps still run through our REST path (`lib/youcam/tryon.ts`), on purpose: that is the one path that goes through the unit ledger, the daily cap, the 150-unit reserve, the 30-unit session cap with your approval, and end-of-session deletion. MCP try-ons would bypass those, so the app never calls an MCP tool that spends units.

## Run it

```bash
npm install
npm run dev        # mock mode by default: replays recorded YouCam results, 0 units
npm test           # unit and route tests
npm run lint
npm run typecheck
```

Live mode: set `YOUCAM_MODE=live` and `YOUCAM_API_KEY` on the server (see `.env.example`). The key never reaches the browser. Optional planner keys: `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`; without them the agent uses its rule-based plan and says so.

## Licence

MIT
