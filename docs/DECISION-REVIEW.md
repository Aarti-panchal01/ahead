# Hackathon decision review — 31 October 2026

## The honest call

I would stop adding features and make the own-photo fitting flow the product. Ahead is for people facing hair loss during cancer treatment: preview styles on yourself, compare, and bring a shortlist to a wig specialist. A previous results bug showed catalogue models when the shopper expected their own face; the current implementation removes that fallback. The largest remaining product gap is that the catalogue is illustrative, not connected to real retail inventory.

I would not predict a first-place finish from the current evidence. The product has a plausible path, but its retail value has not been validated with a retailer, a patient, or a conversion/return pilot. Do not state that it increases conversion or reduces returns as a fact.

## Competition facts

- The current Devpost has two topics: **Skin AI** and **eCommerce VTO**. The organizer's written clarification to Aarti says a focused Apparel VTO project qualifies for eCommerce VTO, so Ahead belongs in that topic. The event does not list separate prizes for those two topics.
- The four judging criteria are equally weighted: technological implementation, design, potential impact, and quality of the idea. The project must use a YouCam API in a functional prototype and make the real consumer or retail value immediately understandable.
- The listed awards are 1st ($2,500), 2nd ($1,000), 3rd ($500), Women in Tech ($1,000), and Rising Star/student ($1,000). An entry can receive only one prize. The special awards apply only if the entrant meets their eligibility rules.
- The official deadline is **November 2, 2026, 11:45 a.m. Eastern / 10:15 p.m. India Standard Time**. Winners are scheduled to be announced around November 24. The current edition has no announced winners yet.
- Required submission assets include the repository, a written description, screenshots, and a public 1–3 minute video showing the working project on its target device and explaining the YouCam API used.

Sources: [current hackathon page and judging criteria](https://youcam-api-skin-ai-ecommerce.devpost.com/), [official rules and schedule](https://youcam-api-skin-ai-ecommerce.devpost.com/rules).

## What the previous winner teaches us

Aloud won first place in the earlier YouCam Skin AI & Apparel VTO Hackathon. Its public submission leads with a specific user—blind shoppers—then demonstrates a coherent voice-first product that they can use without the screen. It explains a real retail barrier, shows multiple complete flows, and describes exactly how YouCam data is used and bounded. That is a useful pattern; the public materials do not establish the judges' private reasons for selecting it.

Ahead should borrow the clarity and evidence, not imitate the voice interface. Its underserved audience is people navigating treatment-related hair loss who must choose a wig or wrap from photos. The distinct product promise is: **preview a style on yourself, compare a short list, and take it to a stylist**.

Sources: [Aloud's winning Devpost submission](https://devpost.com/software/aloud-lxqr70), [Aloud's source repository](https://github.com/StephenSook/aloud).

## Evidence and where the product fits

- A 2025 survey invited 800 patients receiving systemic therapy; 202 responded. Among respondents, 78% reported hair loss, and information/consultation about hair loss was one of the leading appearance-care needs. This is useful evidence of a need, not a population-wide prevalence estimate.
- The American Cancer Society advises people who want to match their current hair to plan ahead, take photos, and save a lock of hair. It points to cancer centres and online or in-person retailers as places to find wigs.
- UK Parliament's 2026 answer describes NHS pathways that signpost patients to wig suppliers and notes a 42-supplier NHS wig framework. That supports clinics as a plausible referral channel; it does not prove NHS adoption or a purchase commitment for Ahead.

The most plausible use moments are at home before a wig fitting, in a wig service, or through a referral from a cancer-centre navigator. The patient is the user. A wig retailer or specialist is the likely first product-data and distribution partner because it can connect previews to actual SKUs, fitting appointments, and purchase. Clinics and support organizations are potential referral partners, not the audience to lead the pitch with.

The current build does not yet connect to a retailer's live catalogue, checkout, or appointment system. It has no measured conversion lift, return reduction, or partner adoption. Treat those as pilot hypotheses. Measure try-on completion, shortlist-to-booking/purchase, return/exchange rate, and stylist time per fitting before claiming ROI.

Sources: [2025 patient survey (PubMed)](https://pubmed.ncbi.nlm.nih.gov/39891884/), [American Cancer Society wig guidance](https://www.cancer.org/cancer/side-effects/hair-skin-nails/hair-loss/choosing-and-wearing-wig.html), [UK Parliament answer](https://questions-statements.parliament.uk/written-questions/detail/2026-03-02/116799/).

## Current technical truth to use in the submission

- Product code supports live **YouCam hair-transfer v2.1** for wigs and wraps, plus YouCam task deletion. It has server-side orchestration, usage limits, and a browser-side skin-colour integrity check. The results rail stays horizontal on desktop and mobile; a personal photo is never replaced by a different model as the try-on result.
- The app's YouCam beauty MCP integration performs `tools/list` discovery only; it does not call paid MCP tools. Skin-tone analysis and makeup VTO informed API research and tests, but are not called by the current product flow. Do not say the live app uses those APIs to render brows, lashes, or skin analysis.
- Personal-photo previews use the live endpoint only when the status API reports live mode. `TESTER_CODE` gates selfie renders only when it is configured. The lookbook queues the styles the available daily budget can cover (each render costs 2 units), up to the full 16-item catalogue. Test recordings remain for engineering validation; the user-facing journey leads with the patient's own photo. Never describe a recording as a live call.

## Submission blockers and next actions

1. Replace the video placeholder and record a 1–3 minute demo. Show two genuine live Hair Transfer outputs on the same patient's photo and browse the horizontal rail. Do not show a catalogue model as a personal result.
2. Replace the screenshot placeholder with current app screens and show the user's own face in the results flow.
3. Keep the Devpost description explicit that the current styles are illustrative and not verified retail products; catalogue, price, and availability integration is a next pilot, not an existing feature.
4. Keep the API account/key and tester code out of public screenshots and video. Use a synthetic test photo for the live proof if possible, and confirm available units before recording.
5. Do not invent patient quotes. The submission can cite published research; add interviews only if they happen and participants consent.

This matches the repository's feature-freeze direction: finish the demo, screenshots, write-up, and submission instead of growing the feature list.
