# FACTS: where every claim is wired

Three parts: the only statistics we use (with sources), the API truth table (our own measurements, summarised by row number), and an integration ledger that ties each user-visible claim to the file that implements it and the test that proves it. All paths are relative to the repository root.

## 1. The statistics we use (the only ones)

- 47% of women cancer patients called chemo hair loss the most traumatic part of treatment; 8% would decline chemo over it (Trueb 2010, cited in clinicaltrials.gov protocol NCT01986140).
- In one study, 77% of patients called it the most feared side effect (Kargar et al. 2011, cited in Clinical Journal of Oncology Nursing 21(2)).
- Hair loss mostly starts 1 to 3 weeks after the first chemo or radiation treatment (MedlinePlus, "Coping with cancer - hair loss").
- Clinical advice: choose a wig before hair loss, save a lock of hair, photograph your current style (MedlinePlus; Oncolink; American Cancer Society tips).
- Eyelashes and eyebrows can fall out too; hair may grow back curlier and a different colour (Oncolink).
- Wigs are hygiene-sensitive and usually returnable only unopened (retailer return policies).
- Everything in docs/api-truth-table.md (our own measurements).

Where these appear in the product: the 1 to 3 week window and the "choose a wig before hair loss" advice in `lib/agent/timeline.ts` (source named in the note, MedlinePlus); the unopened-return note in the same file (`RETURNS_NOTE`); the landing note naming MedlinePlus, Oncolink and the American Cancer Society in `app/page.tsx`; the brows and lashes timeline step in `lib/client/planApi.ts`. The 47%, 8% and 77% figures are used only in the submission text and the demo voice-over, never in the app.

## 2. API truth table (docs/api-truth-table.md, rows 1 to 23)

Full evidence is in [api-truth-table.md](api-truth-table.md); the app renders it at `/how-we-tested` (`app/how-we-tested/page.tsx`). Summary by row:

| Row | What we measured | Consequence in the code |
|---|---|---|
| 1 | Hair-transfer with an on-model wig photo and `hair_color: "ref"` puts the wig on convincingly (16 of 16 scored 5/5 in our review) | `lib/youcam/client.ts`, `lib/youcam/tryon.ts` |
| 2 | Works on a buzz cut and a fully bald head | no hair-length gate on try-ons |
| 3 | Mannequin or flat-lay wig photo: `error_no_face`, 0 units | `usableAsReference` in `catalogue/catalogue.json`, checked in `app/api/tryon/route.ts` |
| 4 | A person wearing a head wrap as reference puts the wrap on the user | wraps go through hair-transfer |
| 5 | Hat and scarf APIs replace the person | not used |
| 6 | Built-in hairstyle templates turned two faces grey | not used |
| 7 | makeup-vto brows: the whole face measured about +5 L\* lighter on every skin tone | `lib/image/composite.ts` pastes back only the feature |
| 8 | A fixed brow colour came out lighter than one face's own dark brows | `browDefault` in `lib/image/sample.ts` (own brow colour, about 10 L\* darker) |
| 9 | Skin-tone analysis (20 units) reads hair colour approximately | match card shows the real hair crop and "bring a lock of hair" |
| 10 | Hair length detection reports a bald head as "above the ears" | `app/stage/page.tsx` asks instead; detector not used |
| 11 | One transient `unknown_internal_error` on hair length, retry succeeded | one retry after an explicit transient error only (`lib/youcam/tryon.ts`) |
| 12 | Hair type detection failed once (`error_face_angle_invalid`) | not used |
| 13 | Thinning hair is not visible in the length result | density/thinning not claimed anywhere |
| 14 | Brow colour and intensity barely change the render | brows are described as soft; own colour at intensity 70 |
| 15 | Brows survive a later hair-transfer | order: brows (composited) first, then hair-transfer |
| 16 | Hair-transfer skin drift on a full look: cheeks and nose 2.1 to 2.8 L\* darker | integrity threshold ΔE2000 2 (`lib/image/integrity.ts`) |
| 17 | Task delete works: 200, then `InvalidTaskId`, 0 units | `app/api/session/end/route.ts`, `deleteTask` in `lib/youcam/client.ts` |
| 18 | Live mode end to end: 2 units charged, repeat = cache hit, at the cap = recording | `lib/youcam/safety.ts`, `lib/youcam/tryon.ts` |
| 19 | Hair-transfer on a bald photo draws its own brows on many renders | `applyBrows` only ever darkens (`lib/image/brows.ts`) |
| 20 | makeup-vto smooths skin at 50 by default; `skin_smooth` strength 0 and colour intensity 0 removed the lightening | the lash request recorded in `fixtures/youcam/rec__P1B__lashes_raw.meta.json`; compositing kept |
| 21 | Eyelashes (Natural1) work on a lash-sparse face, 1 unit | `LASH_COMPOSITE` in `lib/image/composite.ts` |
| 22 | Hair-transfer has no smoothing, beautify or retouch option | nothing to turn off; every render is checked (row 16) |
| 23 | A try-on through the MCP server returns a `task_id`; the REST client polls and deletes it; 2 units | MCP and REST interoperate; paid steps still run through REST (README) |

## 3. Integration ledger

One line per user-visible claim: the file(s) that implement it, then the test(s) that prove it.

### Try-on and YouCam

| Claim | Implemented in | Proven by |
|---|---|---|
| Wigs and wraps use hair-transfer v2.1 with `hair_color: "ref"`, 2 units | `lib/youcam/client.ts` (`FEATURES`), `lib/youcam/tryon.ts` (`startHairTransfer`) | `test/platform/tryon-live.test.ts` ("runs a paid call and records it") |
| Only photos of a person wearing the item are used; mannequins fail plainly | `catalogue/catalogue.json` (`usableAsReference`), `app/api/tryon/route.ts`, `lib/youcam/messages.ts` | `test/catalogue.test.ts`, `test/mock.test.ts` ("replays a mannequin photo as error_no_face") |
| Mock mode is the default and replays recordings at 0 units | `lib/youcam/index.ts` (`mode`), `lib/youcam/mock.ts` | `test/mock.test.ts` ("is the default"), `test/platform/routes.test.ts` |
| A sample person never goes live, in any mode; only an uploaded photo can spend units | `app/api/tryon/route.ts` | `test/platform/routes.test.ts` ("live mode: demo faces never go live") |
| Persistent ledger of every paid call | `lib/youcam/safety.ts` (`recordCall`) | `test/platform/tryon-live.test.ts`, `test/platform/store-safety.test.ts` |
| Repeat requests are served from the cache with no YouCam call | `lib/youcam/safety.ts` (`cacheGet`, `cachePut`), `lib/youcam/tryon.ts` | `test/platform/tryon-live.test.ts` ("serves a repeat from the cache") |
| Daily unit cap (default 20) | `lib/youcam/safety.ts` (`claimDaily`, `limits`) | `test/platform/store-safety.test.ts`, `test/platform/tryon-live.test.ts` ("stops at the daily cap") |
| Per-IP hourly limit | `lib/youcam/safety.ts` (`allowIp`) | `test/platform/tryon-live.test.ts` ("rate limits per IP") |
| 150 units always kept in reserve; the real balance is read before every paid call; `AHEAD_RESERVE_UNITS` can only raise it | `lib/youcam/safety.ts` (`RESERVE_UNITS`, `effectiveReserve`), `lib/youcam/tryon.ts` | `test/platform/tryon-live.test.ts` ("never goes below the 150-unit reserve", "reads the real balance"), `test/platform/wave2.test.ts` ("AHEAD_RESERVE_UNITS can only raise the judging reserve") |
| Errors that arrive inside HTTP 200 cost 0 units and are refunded | `lib/youcam/safety.ts` (`refundTask`), `lib/youcam/tryon.ts` (`pollTask`) | `test/platform/tryon-live.test.ts` ("refunds when the task ends in error") |
| A create that may have succeeded is never retried; one retry only after an explicit transient error | `lib/youcam/tryon.ts` | `test/platform/tryon-live.test.ts` ("never retries a create that may have succeeded", "retries a create once", "retries at most once") |
| The API key never reaches the browser, a result or a log | `lib/youcam/client.ts` (`key`), `app/api/result/route.ts`, `lib/agent/log.ts` (scrub) | `test/platform/tryon-live.test.ts` ("never puts the key in a result"), `test/agent/log.test.ts` |
| Live renders reach the browser through a same-origin proxy; the YouCam URL never reaches the page | `app/api/result/route.ts`, `lib/client/tryon.ts` (`renderSrc`) | `test/platform/wave2.test.ts` ("streams a finished live render same-origin"), `test/client-mode-session.test.ts` ("live renders load through the same-origin proxy") |
| Uploaded photos are re-encoded as JPG, long side at most 1024, metadata stripped | `lib/youcam/images.ts` | `test/platform/images-remote.test.ts` ("strips EXIF metadata", "resizes to long side 1024") |
| Paste-a-listing refuses plainly when nobody wears the wig; links to private addresses are blocked | `app/api/listing/route.ts`, `lib/youcam/remote.ts` | `test/platform/routes.test.ts` ("POST /api/listing"), `test/platform/images-remote.test.ts` ("SSRF protection") |
| The status line says why a demo uses sample people (mock, daily cap, reserve) | `app/api/status/route.ts`, `lib/youcam/status.ts`, `lib/client/mode.ts` (`demoNote`) | `test/platform/routes.test.ts` ("GET /api/status"), `test/client-mode-session.test.ts` |

### Deletion and privacy

| Claim | Implemented in | Proven by |
|---|---|---|
| Try-ons are deleted from YouCam at the end of the session (`POST /s2s/v2.0/task/delete`) | `app/api/session/end/route.ts`, `lib/youcam/client.ts` (`deleteTask`), `lib/youcam/session.ts` (`endNote`), `lib/client/session.ts` (`endSession`), `components/SessionProvider.tsx` (pagehide) | `test/platform/wave2.test.ts` ("deleteTask", "POST /api/session/end"), `test/client-mode-session.test.ts` ("ends the session with the header"); `docs/youcam-session-cleanup.md`, truth table row 17 |
| A running task is left, then deleted right after its result has been read | `app/api/session/end/route.ts`, `app/api/result/route.ts` | `test/platform/wave2.test.ts` ("leaves running tasks", "deletes the task at YouCam right after reading it") |
| "Deleted from YouCam" is only said when it is true | `lib/agent/claims.ts` (`DELETED_RULE`), `lib/youcam/session.ts` | `test/agent/claims.test.ts` ("allows 'deleted from YouCam' only when it is true"), `test/platform/wave2.test.ts` ("endNote wording") |
| Consent comes before the camera | `app/start/page.tsx`, `lib/client/copy.ts` (`CONSENT_LINES`), `app/capture/page.tsx` (camera and upload shown only after consent) | none dedicated (see "Known limits") |
| The photo stays in memory in the browser; nothing is stored after the session | `components/SessionProvider.tsx`, `lib/client/photo.ts` | none dedicated (see "Known limits") |
| The model never sees photos, the treatment date, the hair-loss stage or any health detail | `lib/agent/agent.ts` (`modelBrief`), `lib/agent/claims.ts` (`stripHealthDetails`) | `test/agent/privacy.test.ts` |
| Stylist brief: ids, two colours and a note only; unguessable id (144 bits); expires after 7 days; not indexed | `lib/store/briefs.ts`, `app/api/brief/route.ts`, `app/api/brief/[id]/route.ts`, `app/brief/[id]/page.tsx` | `test/platform/wave2.test.ts` ("stylist brief"), `test/api-clients.test.ts` ("brief client") |
| Briefs are rate limited per IP | `app/api/brief/route.ts` | `test/platform/wave2.test.ts` ("is rate limited per IP") |

### Integrity check, brows and lashes

| Claim | Implemented in | Proven by |
|---|---|---|
| Every render is checked in the browser against the photo it came from | `lib/image/integrity.ts` (`integrityCheck`), `lib/image/browser.ts` (`checkRender`), `lib/client/image.ts`, `components/results/ResultCard.tsx`, `components/results/IntegrityLine.tsx` | `test/image/integrity.test.ts`, `test/components.test.tsx` ("ResultCard", "IntegrityLine") |
| Measured on both cheeks, the nose bridge and the chin; never the forehead | `lib/image/landmarks.ts` (`INTEGRITY_REGIONS`, `skinSamplePoints`) | `test/image/raw.test.ts` ("places skin samples inside the face outline, chin above the jaw edge") |
| Above ΔE2000 2 the original inner face is pasted back with a feathered mask and re-measured | `lib/image/integrity.ts` (`INTEGRITY_THRESHOLD`, `restoreInnerFace`, `innerFaceMask`) | `test/image/integrity.test.ts` ("is corrected ... every region ends at or below ΔE2000 2", "has no visible seam"), `test/image/colour.test.ts` (`deltaE2000`) |
| The card says in plain words what was corrected | `lib/image/integrity.ts` (`PLAIN`) | `test/image/integrity.test.ts` ("P1B__W03 lightened the whole face ... a genuine correction", "says lightened when the render lightened the skin") |
| Hair shadow from a new bob is not counted as a skin tone change, and the card says which part was left out | `lib/image/integrity.ts` (`HAIR_SHADOW`, `hairShadedRegions`), `components/results/IntegrityLine.tsx` (`skippedClause`) | `test/image/integrity.test.ts` ("recordings rec__P{1..4}B__W*", "hairShadedRegions"), `test/components.test.tsx` ("says in plain words when a region was left out") |
| If the face cannot be found or the skin cannot be restored, the card says so (amber), never a false pass | `lib/image/integrity.ts` (`PLAIN.noFace`, `PLAIN.notRestored`) | `test/image/integrity.test.ts` ("fails plainly without landmarks"), `test/components.test.tsx` ("is amber when the check failed") |
| Brows: only the brow region of a makeup-vto render is used; the global lightening is removed | `lib/image/composite.ts` (`compositeFeature`, `BROW_COMPOSITE`) | `test/image/composite.test.ts` ("the raw makeup-vto render trips the integrity check", "brings cheeks, nose bridge and chin back to about 0 change") |
| Brow colour is the person's own, about 10 L\* darker, same hue | `lib/image/sample.ts` (`browDefault`), `catalogue/personas.json` | `test/image/sample.test.ts` ("browDefault is about 10 L\* darker with the same hue") |
| Brows go on a wig or wrap render without painting over hair or a wrap, and never lighten | `lib/image/brows.ts` (`applyBrows`, `BROW_APPLY`), `lib/client/brows.ts` | `test/image/brows.test.ts` ("applyBrows never paints over hair or a wrap"), `test/brows.test.ts` |
| Brows are on by default for a sample person whose hair is gone; the toggle says what it does | `lib/client/brows.ts` (`browsAvailable`, `browsToggleLabel`) | `test/brows.test.ts` |
| Lashes: a thin band along the lids is composited; cheeks, nose bridge and chin stay unchanged | `lib/image/composite.ts` (`LASH_COMPOSITE`) | `test/image/composite.test.ts` ("compositeFeature lashes") |
| `skin_smooth` strength 0 removes the lightening | recorded request in `fixtures/youcam/rec__P1B__lashes_raw.meta.json` | truth table row 20 (measurement, no code path builds a makeup-vto request; see "Known limits") |

### Matching, colour and copy

| Claim | Implemented in | Proven by |
|---|---|---|
| Ranking weighs texture, then length, then colour; "close" needs colour under ΔE2000 5 and a neighbouring texture | `lib/rank.ts` | `test/rank.test.ts` |
| A sample person is ranked only among the wigs and wraps recorded on her face | `lib/rank.ts` (`pool`), `catalogue/personas.json`, `lib/client/personas.ts` | `test/rank.test.ts` ("top 3 and labels for each sample person"), `test/agent/shortlist-brief.test.ts` ("P1 never gets W08") |
| An own photo is matched on colour only, and says so | `lib/rank.ts` (`matchLabel`), `components/results/ResultsView.tsx` (`hairLine`) | `test/rank.test.ts` ("an own photo is ranked on colour only") |
| The match card shows the real hair crop next to the swatch and says to bring a lock of hair | `components/results/MatchCard.tsx`, `lib/client/copy.ts` (`lockLine`, `SCREEN_COLOUR_NOTE`), `lib/client/image.ts` (`hairCrop`) | `test/markdown.test.ts` ("hairCropBox"), `test/agent/shortlist-brief.test.ts` ("draft_brief") |
| The app asks "Has your hair loss started?" because length detection cannot tell short hair from none | `app/stage/page.tsx`, `lib/client/copy.ts` (`WHY_WE_ASK`, `STAGES`) | none dedicated (see "Known limits"); truth table row 10 |
| The measured hair colour becomes the accent colour, darkened until it passes 4.5:1 contrast; fallback `#5B4636` | `lib/client/accent.ts`, `lib/image/colour.ts` (`accentFromHair`) | `test/accent.test.ts`, `test/image/colour.test.ts` ("accentFromHair", "contrastRatio") |
| Every person and product image carries an "AI-generated" label | `components/AiImage.tsx`, `components/SiteFooter.tsx` | `test/catalogue.test.ts` ("every item is labelled AI-generated"), `test/components.test.tsx` ("Landing ... labels every image as AI-generated") |
| Every preview says it is style and colour, not cap fit, density or comfort | `lib/client/copy.ts` (`PREVIEW_DISCLAIMER`, `CONSENT_LINES`), `lib/agent/brief.ts` (`PREVIEW_LINE`) | `test/components.test.tsx` ("shows the render, the AI label, the name, the check and the disclaimer") |
| The honesty page is generated from the truth table | `app/how-we-tested/page.tsx`, `lib/client/markdown.ts` | `test/markdown.test.ts` ("reads the real truth table", "honesty page") |

### Consult agent

| Claim | Implemented in | Proven by |
|---|---|---|
| The planner tries Groq, then Gemini (6 s each), then a rule-based plan, and says which one answered | `lib/agent/agent.ts` (`runPlan`), `lib/agent/providers.ts` | `test/agent/agent.test.ts` ("providers", "Gemini -> Groq -> rule-based", "both fail -> rule-based plan"). Order and timeout are being changed in wave 3; the ledger line is to be re-checked against the merged code (see "Known limits") |
| The calendar is computed locally, deterministically; "Have your wig or wrap ready" falls on the first treatment day; order-by is 7 days before | `lib/agent/timeline.ts` | `test/agent/timeline.test.ts` ("ready falls ON day 0 and the order-by date is 7 days before it", "owner example") |
| The 1 to 3 week hair-loss window and the unopened-return note come from the FACTS list, not from a model | `lib/agent/timeline.ts` (`WINDOW_START_DAY`, `WINDOW_END_DAY`, `RETURNS_NOTE`) | `test/agent/timeline.test.ts` |
| A claim linter blocks medical wording in all agent text | `lib/agent/claims.ts` (`CLAIM_RULES`, `lintText`), `lib/agent/agent.ts` (`runPlan`) | `test/agent/claims.test.ts`, `test/agent/timeline.test.ts` ("passes the claim linter"), `test/api-clients.test.ts` ("no medical wording in the local plan") |
| The agent uses the beauty MCP server for `tools/list` and never calls a tool | `lib/agent/mcp.ts`, `docs/youcam-mcp-tools.json` | `test/agent/mcp.test.ts` ("lists the 50 recorded tools ... and never calls a tool") |
| A try-on through MCP interoperates with REST polling and deletion | truth table row 23 | measurement only (MCP test 23 Oct, 2 units); the app does not call MCP tools that spend units |
| A paid try-on waits for the person's approval; at most 3 are proposed; 30 units per session | `lib/agent/budget.ts` (`SESSION_CAP_UNITS`), `lib/agent/tryon.ts` (`proposeTryOns`, `approveTryOn`), `app/api/agent/approve/route.ts` | `test/agent/approve.test.ts` |
| A sample person's try-ons are free saved recordings and need no approval | `lib/agent/agent.ts` (`isSamplePerson`), `lib/agent/tryon.ts` | `test/agent/approve.test.ts` ("demo face (free recording)"), `test/agent/agent.test.ts` ("sample person on the LLM path") |
| The plan route needs a session and never runs a paid step | `app/api/agent/plan/route.ts` | `test/agent/agent.test.ts` ("POST /api/agent/plan") |

### Pending in wave 3 (not in this branch's code yet)

| Claim | Where it will live | Proof expected |
|---|---|---|
| Live try-on on your own photo needs a tester code | `lib/youcam/tester.ts` (platform agent); `UnitStatus.testerRequired` already exists in `lib/types.ts` | platform tests |

## 4. Known limits (stated plainly, not hidden)

- **No code path builds a makeup-vto request.** The brow renders shown for sample people are recordings made before we found YouCam's default skin smoothing (row 20); they are composited and checked, which is why every render is checked. The `skin_smooth` strength 0 request is recorded in `fixtures/youcam/rec__P1B__lashes_raw.meta.json`. Live brows for an own photo are not wired (`lib/client/brows.ts`: brows are offered for sample people only).
- **Lashes** are built and tested in the compositor (`lib/image/composite.ts`) but the UI does not offer them yet.
- **Skin-tone analysis** (20 units) is measured (row 9) but not called by the app; hair and brow colour are read in the browser (`lib/image/sample.ts`).
- **No dedicated tests** for: consent before the camera, in-memory photo handling, and the stage question. They are covered only by the code paths listed.
- **Planner order and timeout**: the ledger line above is checked against the code merged into `master`; at the time of writing, `lib/agent/providers.ts` on this branch still lists Gemini first with a 25 s timeout, and the consult agent is changing it to Groq first, 6 s each.
- **The honesty page test** (`test/markdown.test.ts`) asserts at least 18 truth-table rows and checks the first 18 row numbers; rows 19 to 23 are rendered by the same code but not asserted individually.
