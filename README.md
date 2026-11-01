# Ahead

See your next look, on you.

Ahead is a personal wig and headwear try-on for people navigating treatment-related hair loss. Preview styles on your own photo, compare favourites, and take a fitting brief to a specialist.

![tests](https://img.shields.io/badge/tests-526%20unit%20%2B%2016%20e2e%20passing-2F6F5E)

## Quick access for judges

- **Live app:** https://try-ahead.vercel.app
- **Demo video:** publish a 1–3 minute walkthrough before submission; the recording script is in `docs/DEMO-SCRIPT.md`.
- **No-code judge path:** open the live app and choose **Explore sample previews**. It uses recorded results, requires no upload, and spends no API units.
- **Own-photo live try-on:** review the privacy details, upload your photo, and enter the preview code if the deployment asks for it. The first look renders on your photo; each other style can be tried from its card. The code lasts for that visit only.
- **Zero-key mock run:** `npm install && npm run dev`. Mock mode is the default and replays saved API results for test personas. No API key needed.
- **Catalogue status:** the 12 wig and 4 wrap references are illustrative and are not live retailer products. The prototype has no verified brand, price, or availability data.
- **Where every claim is wired:** [docs/FACTS.md](docs/FACTS.md) maps each claim in this README to the file that implements it and the test that proves it. The API measurements behind it are in [docs/api-truth-table.md](docs/api-truth-table.md), also shown in the app at `/how-we-tested`.

## What it is

Ahead helps people navigating treatment-related hair loss explore wigs and headwear on their own photo, compare the looks they like, and take a fitting brief to a specialist. Every live render is checked against the original photo in the browser. It is a style preview, not cap fit, density, comfort, medical advice, or confirmation that a product is in stock.

The core journey is own-photo preview, comparison, and a fitting-ready shortlist. The brief now gives the shopper concrete questions to ask about the closest available item, cap construction, price, care, return terms, and colour. The app also contains a treatment-date planner, secondary to the shopping experience.

## YouCam APIs in the product

- **Hair transfer (`/s2s/v2.1/task/hair-transfer`)** is the live try-on API for wigs and head wraps. The server sends the user's photo and an on-model product reference with `hair_color: "ref"`; it costs 2 units and took 9–30 seconds in our tests. It worked on bald heads and buzz cuts (truth table rows 1, 2, 4). Mannequin and flat-lay references fail with `error_no_face` at 0 units (row 3), so every usable reference shows a person wearing the item.
- **Task delete (`/s2s/v2.0/task/delete`)** removes finished YouCam tasks and their files at session end (row 17, verified at 0 units).
- **Beauty MCP server** is used for `tools/list` discovery only. Paid MCP tools are not called by the product; approved live try-ons use the REST path and its unit safeguards.

We also tested Makeup VTO and Skin Tone Analysis during API research. They are not called by the current product flow: brows shown for sample people are recorded/composited, lashes are not offered, and hair/brow colour is sampled in the browser. Our Makeup VTO experiments found that its default smoothing changes skin lightness, while Skin Tone Analysis colour estimates were approximate. Those findings are documented in the truth table and shaped the product's safeguards; they are not live app integrations.
Not used: hair length, hair type and density detection. The length detector reports a bald head as "above the ears" (row 10), so the app asks where someone is in their hair-loss experience rather than guessing.

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

## Sample imagery

Sample recordings are kept for engineering validation. Catalogue references are generated illustrations, not product photos or retailer stock. The public own-photo flow never displays a catalogue model as the user's try-on result; the shared footer carries the single disclosure.

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
