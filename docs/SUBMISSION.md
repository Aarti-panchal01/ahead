# Devpost submission draft — Ahead

**Hackathon topic:** eCommerce VTO  
**Position:** A personal wig and headwear try-on for treatment-related hair loss  
**Tagline:** See your next look, on you.  
**Deadline:** November 2, 2026, 10:15 p.m. IST  
**Live app:** https://try-ahead.vercel.app  
**Repository:** https://github.com/Aarti-panchal01/ahead  
**Demo video:** [ADD PUBLIC VIDEO URL BEFORE SUBMITTING]  
**Screenshots:** [UPLOAD CURRENT LANDING, OWN-PHOTO RESULTS, AND FITTING BRIEF]

## Project description

Choosing a wig or head covering during treatment-related hair loss is personal, but the shopping decision often begins with a photo of someone else wearing it. Ahead brings that first look closer to the person choosing: preview wigs and wraps on your own photo with YouCam Hair Transfer, compare the directions you like, and take a fitting brief to a wig specialist.

Ahead is built around a complete assisted-shopping journey: **own-photo preview → comparison → fitting shortlist**. It gives the shopper a concrete way to describe the style they want and gives the specialist a clearer starting point for matching a real, available product.

In one survey of 800 people receiving systemic cancer therapy, 202 responded. Hair loss was reported by 157 of those 202 respondents (78%); 109 of those 157 respondents purchased wigs. This is evidence from one survey, not a population-wide estimate. Source: https://pubmed.ncbi.nlm.nih.gov/39891884/

## What the prototype does

- Starts with a consented personal photo, or lets a judge explore recorded sample previews without uploading a photo or spending API units.
- Shows a 12-style wig catalogue and 4 headwear directions. With a personal photo in live mode, the available previews are requested in parallel and each result is tied to its own style.
- Uses YouCam Hair Transfer v2.1 for the live own-photo try-on. The browser checks each result against the original face and keeps the face/skin colour consistent.
- Lets a person compare favourites and make a short-lived, shareable fitting brief. The brief contains the selected style directions and optional notes; it never contains the person's photo.
- Gives the shopper a practical checklist for the specialist: confirm the closest in-stock item, cap construction and size, price, care needs, return terms, and colour in natural light.

The preview helps explore style and colour. It does not confirm fit, density, comfort, medical suitability, or product availability.

## Commerce status and pilot path

The current catalogue is illustrative. Its wig and wrap references are generated images, not purchasable SKUs, and Ahead does not yet show verified brands, prices, or live inventory. There is no retailer partnership, checkout, booking integration, or measured sales/return outcome today. The fitting brief makes the current step useful while creating a clear handoff to a real retailer or wig specialist.

A first retailer pilot would connect licensed product images and SKU/availability data, then test the journey against the retailer's existing fitting flow. Measure preview completion, shortlist creation, shortlist-to-fitting or purchase, time per consultation, and returns/exchanges against a baseline. These are validation metrics, not claims of results.

## YouCam implementation

The live own-photo preview uses YouCam Hair Transfer v2.1. The server uploads the source photo and an on-model style reference, creates and polls the task, and deletes finished tasks at session end. Each live render costs 2 units and is requested by the user. A photo is sent to YouCam only when a live preview is requested.

Ahead's browser-side face/skin integrity check is our own image processing. Makeup VTO and Skin Tone Analysis informed API research, but are not called in the current product flow. We name only the live integrations in the demo and submission.

## How judges can try it

- **Recorded sample journey:** open the live app and choose **Explore sample previews**. It uses saved results and costs no API units; the sample portrait and style references are illustrative.
- **Live own-photo journey:** the public deployment may require a preview access code for fresh API inference. Provide access through the submission's permitted private field or judge instructions; never publish the API key. The YouCam API Team has confirmed in the public event forum that a working, free test build with a clearly identified replay of a real API response is acceptable, and that judges may also evaluate the written description, images, and video.
- **API evidence:** `/how-we-tested` documents the endpoints, tests, measured limitations, and implementation decisions.

## Build period

The repository history for this submission starts October 22, 2026, during the official submission period. The current build includes the own-photo capture and consent flow, YouCam Hair Transfer orchestration, a multi-style wig and wrap catalogue, per-style result integrity checks, comparison, and the fitting brief. If an earlier version of Ahead existed outside this repository, explain the substantial changes made during the hackathon period in the Devpost submission.

## Sources

- Hackathon overview, topic description, judging criteria, and submission checklist: https://youcam-api-skin-ai-ecommerce.devpost.com/
- Official rules and schedule: https://youcam-api-skin-ai-ecommerce.devpost.com/rules
- Organizer resources and API documentation: https://youcam-api-skin-ai-ecommerce.devpost.com/resources
- Organizer response on free judge access: https://youcam-api-skin-ai-ecommerce.devpost.com/forum_topics/45693-judge-access-local-test-build-with-recorded-api-result-and-gated-fresh-inference
- 2025 patient survey: https://pubmed.ncbi.nlm.nih.gov/39891884/

## Submission checklist

- [ ] Record and publish a 1–3 minute demo that shows the working experience on its intended device and names YouCam Hair Transfer v2.1.
- [ ] Upload current screenshots of the landing page, own-photo results, and fitting brief.
- [ ] Confirm the no-code recorded sample journey is accessible from the public live app.
- [ ] Confirm the live own-photo preview and judge access instructions work without exposing the API key.
- [ ] Publish the latest repository changes and keep the repository reviewable.
- [ ] Submit before November 2, 2026, 10:15 p.m. IST.
