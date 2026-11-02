# Ahead

<p align="center">
  <strong>A private fitting room for the next look.</strong><br />
  Explore wigs and headwear on your own photo, compare the styles that feel right, and take a useful brief to a specialist.
</p>

<p align="center">
  <a href="https://try-ahead.vercel.app"><img alt="Try Ahead" src="https://img.shields.io/badge/Try-Ahead-17483d?style=for-the-badge" /></a>
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-111111?logo=next.js&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white" />
  <img alt="YouCam Hair Transfer" src="https://img.shields.io/badge/YouCam-Hair%20Transfer-287564" />
  <img alt="Playwright" src="https://img.shields.io/badge/E2E-Playwright-2ead69?logo=playwright&logoColor=white" />
</p>

Ahead is a private wig and headwear fitting room for people navigating treatment-related hair loss. Instead of asking someone to imagine a style on themselves from a model photo, Ahead lets them explore options on their own photo, compare what feels right, and take a shortlist to a specialist.

**The product promise:** more choice, more agency, and a more prepared fitting conversation. Ahead is designed to help people feel more confident exploring options, without pressuring them to choose.

> Ahead is a shopping companion, not a medical tool or a retailer. Its catalogue is illustrative: it does not show verified products, prices, stock, or confirmed availability.

## Try it

| Link | What to expect |
| --- | --- |
| [Open Ahead](https://try-ahead.vercel.app) | The live web app. |
| [Open the sample fitting room](https://try-ahead.vercel.app/capture#samples) | Explore saved sample previews without uploading a photo or spending API units. |
| [See how the YouCam API was tested](https://try-ahead.vercel.app/how-we-tested) | The measured API behaviour and why specific capabilities were chosen. |

For an own-photo try-on, choose **Use your photo**, review the consent, upload a photo, and ask to see matches. A public deployment can require a judge access code for fresh live API calls. Sample previews remain available without it.

## Ahead in the browser

Upload one portrait to explore 12 wig styles or 4 wraps and caps. These screenshots are from the working results page after all 16 saved YouCam Hair Transfer renders finished. A generous side inset keeps the full hair silhouette visible in every card; style codes, model references, skin-tone checks, comparison, and fitting actions stay close at hand.

### Wig lookbook · 12 styles

The desktop results grid shows four choices across; scroll to explore all 12.

<p align="center"><img src="docs/screenshots/ahead-wig-results.png" alt="Ahead's browser results page showing four complete wig previews in a row with style codes, model-reference toggles, skin-tone checks and comparison actions" width="100%" /></p>

### Wraps and caps · 4 styles

All four headwear options appear together on the same portrait.

<p align="center"><img src="docs/screenshots/ahead-headwear-results.png" alt="Ahead's browser results page showing all four complete wrap and cap previews together with style codes and fitting actions" width="100%" /></p>

## All 16 preview directions

This gallery shows the **16 successful YouCam Hair Transfer previews** on the same project-provided portrait: 12 wigs and 4 wraps or caps, arranged four across. Each image is paired with its style name and Ahead reference code to make the range easy to scan before a specialist fitting.

![Sixteen distinct YouCam Hair Transfer style previews on the same thinning-hair portrait, with four options per row](docs/images/sixteen-style-gallery.jpg)

The [Devpost thumbnail](docs/images/devpost-thumbnail.jpg) positions Ahead as a private, confidence-building wig and headwear space for women navigating cancer-related hair loss. Its main call to action is **Start with your photo**, supported by six representative YouCam previews.

Individual preview files and their style mapping are in [`docs/images/variants/`](docs/images/variants/) and its [render manifest](docs/images/variants/manifest.json). The `AHD-*` codes are Ahead reference codes, not retailer SKUs.

## Why we built it

Choosing a wig during treatment-related hair loss can mean making a personal decision from product photos of someone else. Ahead gives someone more control before a fitting: explore styles privately on their own photo, keep what feels like them, and walk into the conversation with preferences to share. The goal is to help people feel more prepared and confident without rushing them toward a choice.

The specialist remains central: the preview cannot tell someone whether a wig fits, feels comfortable, suits their scalp, or is available. Ahead helps make that first fitting conversation easier to start.

## The experience

1. **Choose how to begin.** Review the photo-use details and upload a photo, or explore a recorded sample person.
2. **Explore 16 directions.** Browse 12 wigs and 4 wraps or caps. When requested, live renders start together; each result remains attached to its own style.
3. **Compare and shortlist.** Flip a card between the try-on and its reference model, compare two saved looks, and note what you like.
4. **Take the conversation with you.** Create a shareable fitting brief with style references, colour notes, questions, and Ahead reference codes. The brief never contains the photo.

The preview is for exploring style and colour. It does not establish fit, density, comfort, medical suitability, retailer availability, or purchase readiness.

## Architecture

```mermaid
flowchart LR
  person[Person] -->|photo or sample choice| browser[Next.js browser app]
  browser -->|request matches: sample ID or uploaded photo| tryon[POST /api/tryon]
  tryon -->|sample ID or mock mode| fixture[Recorded YouCam result fixtures]
  fixture --> card[Style cards and comparison]
  tryon -->|live own-photo request| guard[Validate image, session, limits, credit reserve, cache]
  guard -->|source photo + on-model style reference| youcam[YouCam Hair Transfer v2.1]
  youcam -->|task ID| poll[GET /api/tryon/:id]
  poll -->|style-bound finished task| proxy[GET /api/result]
  proxy -->|same-origin image bytes| image[Browser face and skin integrity checks]
  image --> card
  card --> compare[Compare and shortlist]
  compare --> brief[Shareable fitting brief / print to PDF]
  browser -->|style preferences only| planner[POST /api/agent/plan]
  planner -->|optional text planning| llm[Groq or Gemini, with rule-based fallback]
  planner --> brief

  classDef external fill:#f1eee4,stroke:#b7b3a5,color:#24352f;
  class youcam,llm external;
```

The detailed component map, API boundaries, and request sequences are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The API evidence page is still available at [`/how-we-tested`](https://try-ahead.vercel.app/how-we-tested); it complements the architecture by documenting measured behaviour.

### YouCam integration: one product API, one key

Ahead's live image transformation uses one YouCam product API: **Hair Transfer v2.1**. It transfers a selected wig or headwear style onto the person's uploaded photo. This is the hair API used by the product; there is no separate `HAIR_API_KEY` because YouCam authenticates Hair Transfer requests with the same `YOUCAM_API_KEY`.

| Setting or capability | What it does |
| --- | --- |
| `YOUCAM_MODE` | Selects `mock` (saved sample results, no paid request) or `live` (send an approved own-photo request to YouCam). |
| `YOUCAM_API_KEY` | Server-only bearer credential for the YouCam account. Available credits come from the account that issued the key. |
| Hair Transfer v2.1 | The only live YouCam image API in Ahead. The server sends the source photo and the selected style's person-wearing reference, then tracks the returned task. Each live render costs **2 units**. |
| Hair-colour estimate | Ahead's own on-device image analysis; it does not call YouCam or spend API units. |
| Optional text planner | Uses Groq or Gemini when configured, with a rule-based fallback. It does not render images or receive the photo. |

The implementation makes the API selection explicit in [`lib/youcam/client.ts`](lib/youcam/client.ts): the feature is `hair-transfer`, version `v2.1`, and the request endpoint is `/s2s/v2.1/task/hair-transfer`. [`lib/youcam/tryon.ts`](lib/youcam/tryon.ts) applies the credit and request safeguards. The browser never calls YouCam directly and never receives the API key or a YouCam-hosted result URL.

Before a paid render, the server checks the selected style, photo, session, live balance, daily limit, reserve, and cache. It uploads the source photo and style reference using `hair_color: "ref"`, polls the exact task, and serves the finished image through Ahead's same-origin result proxy. Ahead's browser image pipeline uses MediaPipe landmarks for an optional feathered inner-face composite and checks skin-tone consistency; these are Ahead's safeguards, not YouCam capabilities. Uncertain task creation is not silently retried, and completed tasks are sent for deletion during session cleanup.

Recorded sample previews are saved results and cost no units. Only a person's own uploaded photo can start a live Hair Transfer request. **Skin AI and Makeup VTO are not live integrations in this product.** The measured reasons for this scope are in the [API truth table](docs/api-truth-table.md). The YouCam Beauty MCP was used for capability discovery; paid previews use the guarded YouCam REST API.

## Privacy and boundaries

- Consent appears before photo capture or upload. The browser holds the selected photo in session memory; the shareable brief contains no photo.
- Ahead re-encodes uploaded photos as JPEG and strips metadata before sending them to the server/API.
- The YouCam key stays server-side. Live calls are protected by a unit ledger, caching, per-session and daily caps, a reserve, and rate limits.
- The optional planning assistant receives style preferences, notes after health-related details are removed, and sampled colours. It does not receive the photo, hair-loss stage, treatment date, or health details.
- Planner suggestions do not start paid try-ons. A person must approve a proposed live action.
- This prototype has no verified retailer SKUs, live inventory, prices, checkout, retailer partnership, or measured sales/return results. Ahead codes such as `AHD-WIG-001` are style reference codes, not retailer SKUs.

## Run locally

Requirements: Node.js and npm. In the default local mode, sample people use saved YouCam recordings. No API key or credits are needed to explore that path.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To check the app:

```bash
npm test
npm run typecheck
npm run lint
npm run test:e2e
```

The Playwright suite builds and runs the app in mock mode in mobile and desktop browser viewports; it does not make paid YouCam calls. For fresh own-photo renders, set these server-side values in `.env.local` using [`.env.example`](.env.example):

```dotenv
YOUCAM_MODE=live
YOUCAM_API_KEY=your_private_server_side_key
```

`YOUCAM_MODE` controls whether requests use free saved examples or live Hair Transfer renders; it does not name the API. `YOUCAM_API_KEY` is the credential shared by YouCam requests. The key itself does not reveal the account email, and Ahead cannot identify which email issued it; check the YouCam developer account where the key was created. A balance check reads that key's YouCam account and does not create a try-on.

Never commit `.env.local` or put the key in client code, screenshots, or public project files. Public live previews are ungated by default and remain protected by the balance reserve, daily-unit cap, and per-IP limits. For a private deployment, set both `AHEAD_REQUIRE_TESTER_CODE=true` and `TESTER_CODE`. Planner provider keys are optional; the rule-based planner fallback still works without them.

## Project map

| Area | Owns |
| --- | --- |
| `app/` | Next.js pages and server API routes. |
| `components/results/` | Results, model/you comparison, shortlist, and brief creation. |
| `catalogue/catalogue.json` | The 12 wig and 4 wrap/cap directions, identifiers, and reference images. |
| `lib/youcam/` | Server-side REST client, task lifecycle, unit safeguards, cache, and cleanup. |
| `lib/image/` | Browser image checks, face landmarks, face restoration, and feature compositing. |
| `lib/agent/` | Optional text planning, shortlist tools, approval flow, and claim/privacy guardrails. |
| `lib/store/` | Shareable brief storage with Redis or the configured local fallback. |
| `test/e2e/` | Playwright browser flows across desktop and mobile viewports. |
| `docs/ARCHITECTURE.md` | System boundaries and request sequences. |
| `docs/api-truth-table.md` | API experiments, results, and product decisions. |

## Licence

MIT
