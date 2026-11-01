# Ahead

**See your next look, on you.**

Ahead is a personal try-on and fitting companion for people navigating treatment-related hair loss. It lets someone preview wig and headwear styles on their own photo, compare the looks they like, and take a focused shortlist to a wig specialist.

The product is positioned as **assisted shopping before a fitting**: help a person describe what they want, then help a specialist match that direction to an actual product. Ahead is not a wig retailer, a medical tool, or a live inventory catalogue.

## Try Ahead

- **Live app:** [try-ahead.vercel.app](https://try-ahead.vercel.app)
- **Repository:** [github.com/Aarti-panchal01/ahead](https://github.com/Aarti-panchal01/ahead)
- **How we tested the API:** [/how-we-tested](https://try-ahead.vercel.app/how-we-tested)
- **Recorded judge path:** choose **Explore sample previews** on the landing page. It needs no upload or access code and uses saved API results at no unit cost.
- **Live own-photo path:** choose **Use your photo**, review the consent and privacy details, upload a photo, and continue to matches. The app starts the available previews together after the user asks to see matches. The public deployment may request a judge access code for fresh YouCam calls; never share the API key.
- **Demo video:** add the public 1–3 minute video URL here after recording. The shot list and narration are in [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md).

**Current checks:** 535 unit tests pass; TypeScript and ESLint pass. The sample journey, compare, and fitting brief have also passed Playwright in mobile and desktop viewports.

## The shopper journey

1. **Start privately.** The person reviews consent and chooses a photo or explores recorded sample previews.
2. **See style directions on their photo.** The current catalogue contains 12 wig styles and 4 wraps/caps. After the person requests matches, Ahead starts the available live renders in parallel and keeps each task attached to its requested style.
3. **Compare and save.** The shopper can switch between their result and its model reference, compare two looks side by side, and save favourites to a fitting brief.
4. **Bring a useful brief to a specialist.** The brief includes the selected styles, colour references, Ahead matching codes, notes, and questions about fit, construction, price, care, returns, and availability. It does not include the person's photo.

The preview explores style and colour. It does not confirm fit, density, comfort, medical suitability, product availability, or a purchase.

## How YouCam is integrated

**The live product uses YouCam Hair Transfer v2.1** for wig and head-wrap virtual try-on. This is the functional YouCam API integration in the shopper flow.

```text
Browser photo + chosen style (only after the user asks for matches)
        │
        ▼
POST /api/tryon ── server validates/re-encodes the photo
        │             uploads it with the style reference
        │             POST /s2s/v2.1/task/hair-transfer
        │             hair_color: "ref" + on-model style reference
        ▼
Poll task → bind result to its style → same-origin image proxy
        │
        ▼
Browser face/skin check → compare → fitting brief / PDF
```

- The server sends the user's photo and a **person-wearing-the-style reference** to Hair Transfer with `hair_color: "ref"`. Our tests found mannequin and flat-lay references fail with `error_no_face`, so the usable references show a person wearing the style.
- A live Hair Transfer render costs **2 YouCam units**. The server owns the API key, checks its unit safeguards, polls the task, and streams the finished result through Ahead rather than exposing YouCam's result URL to the browser.
- After a result returns, Ahead uses **our own browser-side image processing** (MediaPipe face landmarks plus a feathered composite) to restore the inner face when needed and check skin-tone consistency. This is not a YouCam feature. The result card reports whether skin tone was unchanged, corrected, or could not be verified.
- At session end, Ahead asks YouCam to delete the session's finished tasks. Unit caps, a persistent ledger, caching, and a judging reserve protect live API access.
- **Skin Tone Analysis and Makeup VTO are not live product integrations.** We tested them during API research; their measured limitations and the reason they were not added to the main journey are documented in [`docs/api-truth-table.md`](docs/api-truth-table.md). Beauty MCP is used for tool discovery only; paid try-ons go through the guarded REST path.

## Privacy and safety

- Photo selection and hair-colour sampling happen in the browser. Ahead sends the image to its server and YouCam only when the person requests live previews; uploaded images are re-encoded as JPEG with metadata removed.
- Ahead does not put the photo in the shareable fitting brief. Briefs contain style IDs, colour references, and optional notes, and expire after seven days.
- The YouCam API key remains server-side. The try-on API uses daily and per-session limits, duplicate-request caching, and an API-credit reserve; uncertain create requests are not silently retried.
- The optional planning assistant receives style preferences and sampled colours, not the photo, treatment date, hair-loss stage, or health details. Its timeline is planning support, not medical guidance.

## Consumer and retail value

Wig shopping during treatment-related hair loss can begin with product photos of someone else. Ahead lets a shopper explore how style directions look on their own photo, then carry specific preferences into a fitting. A specialist gets a more concrete starting point for discussing construction, fit, and the closest suitable item.

The prototype has **no retailer partnership, verified retailer SKUs, live prices, stock, checkout, or measured conversion/return results**. Codes such as `AHD-WIG-001` and `AHD-WRP-001` are Ahead reference codes for communicating a style direction; they are not retailer SKUs. A pilot would connect a retailer's licensed product catalogue and inventory, then measure preview completion, shortlist-to-fitting or purchase, consultation time, and returns against a baseline. These are proposed measures, not claimed outcomes.

## Run locally

Requirements: Node.js and npm. The default local mode replays saved YouCam results for sample people and does not need a YouCam key or spend units.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To run the local checks:

```bash
npm test
npm run typecheck
npm run lint
npm run test:e2e
```

For fresh live previews, configure the server-side values in `.env.local` using [`.env.example`](.env.example):

```dotenv
YOUCAM_MODE=live
YOUCAM_API_KEY=your_server_side_key
```

Never commit `.env.local` or put the YouCam key in browser code. `TESTER_CODE` can optionally gate live own-photo calls on a public deployment. Without live mode, the sample journey remains available. Planner API keys are optional; the app has a rule-based planner fallback.

## Project structure

- `app/api/tryon/` — create and poll try-on tasks through the server.
- `lib/youcam/` — YouCam REST client, Hair Transfer request, cache, unit ledger, and cleanup.
- `catalogue/catalogue.json` — 12 wig and 4 headwear style directions and their on-model references.
- `lib/image/` — browser face landmarks, skin check, feathered face restore, and feature compositing.
- `components/results/` — results grid, fitting bag, comparison, and fitting brief.
- `docs/api-truth-table.md` — measured API behaviour and implementation decisions.
- `docs/FACTS.md` — implementation and test references for product claims.
- `docs/DEMO-SCRIPT.md` — demo narration and recording plan.
- [`docs/SUBMISSION.md`](docs/SUBMISSION.md) — copy-ready Devpost answers and links.

## Image disclosure

Sample people and catalogue reference images are illustrative, AI-generated images—not real customers, retailer products, or confirmed stock. The app makes this disclosure once in its shared footer.

## Licence

MIT
