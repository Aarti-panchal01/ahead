# Devpost submission draft

YouCam API Skin AI & eCommerce VTO Hackathon, eCommerce VTO track. Deadline 2 Nov 2026, 10:15 pm IST.

## Name

Ahead

## Tagline

Try on your next hair, before you lose this one.

## Video

[PLACEHOLDER: video link]

## Inspiration

Losing your hair to treatment is one of the hardest parts of it. In one study, 77% of patients called it the most feared side effect (Kargar et al. 2011, cited in Clinical Journal of Oncology Nursing 21(2)). 47% of women cancer patients called chemo hair loss the most traumatic part of treatment, and 8% would decline chemo over it (Trueb 2010, cited in clinicaltrials.gov protocol NCT01986140).

The advice is practical: choose a wig before the hair goes, save a lock of hair, and photograph your current style (MedlinePlus; Oncolink; American Cancer Society tips). Hair loss mostly starts 1 to 3 weeks after the first chemo or radiation treatment (MedlinePlus), so the window to choose calmly is short. And wigs are hygiene-sensitive and usually returnable only unopened (retailer return policies), so you cannot simply order five and keep the best.

That is the gap: you have to pick something you cannot try on, at a time you did not choose. Virtual try-on can close it, but only if it still looks like you.

## What it does

Ahead lets you try wigs and head wraps on your own face, before and after the hair goes, and shows your brows too. It is a style and colour preview, not cap fit, density or comfort.

- **Matches.** Three wigs closest to your hair, plus one new look to try, ranked by texture first, then length, then colour. Head wraps have their own tab. Compare any two side by side.
- **Every render is checked.** In the browser, Ahead compares skin tone on both cheeks, the nose bridge and the chin before and after the try-on. If the render changed your skin tone, it pastes your original face back and says so in plain words, for example "Corrected: the try-on lightened your skin slightly, restored".
- **Colour match card.** Your real hair next to the wig's colour, and the honest part: a photo reads hair colour only approximately, so bring a lock of hair to your stylist.
- **A calm plan.** A planning assistant builds a calendar around your first treatment date, with a step that says "Have your wig or wrap ready" on the treatment day, a shortlist, and a stylist brief you can share as a link that expires after 7 days.
- **Private by design.** Consent before the camera, nothing stored after the session, try-ons deleted from YouCam at the end, and the assistant never sees your photos, your treatment date or any health detail.

All people and products shown are AI-generated (Gemini). Visible Gemini marks were cropped for layout; Google's invisible SynthID watermark is preserved.

## How we built it

Next.js and TypeScript on Vercel, mobile first. All YouCam calls are server-side; the browser polls a task id and never sees the key.

YouCam APIs used:

- **Hair transfer v2.1** for wigs and head wraps: your photo plus an on-model reference, `hair_color: "ref"`. It works on a bald head and a buzz cut (truth table rows 1, 2, 4).
- **Makeup VTO v2.0** for brows and lashes, with `skin_smooth` set to 0 (row 20). We paste back only the brow or lash region.
- **Skin tone analysis**, measured and documented (row 9): the hair colour it returns is approximate, which shaped the match card.
- **Task delete**, to remove every session's tasks and files at YouCam when the session ends (row 17).
- **The beauty MCP server**: the consult agent calls `tools/list` through the Vercel AI SDK's MCP client, and we verified that a try-on started through MCP can be polled and deleted by our REST client (row 23).

On top: MediaPipe face landmarks and selfie segmentation in the browser for the integrity check and for reading hair colour; CIELAB and ΔE2000 for colour; a planning assistant on Groq with Gemini as the fallback and a rule-based plan after that; a claim linter on every line of agent text; and a unit ledger, a daily cap, a per-IP limit, a 30-unit cap per session with approval before each paid step, and 150 units always kept in reserve.

Before building anything, we tested the API ourselves, 23 findings in all, and the app shows them on its own page, `/how-we-tested`. Every claim in the README is mapped to the code and test behind it in `docs/FACTS.md`.

## Challenges

**YouCam smooths skin by default; we measured it, turned it off, and check every render.** Our first brow test made the whole face about 5 L\* lighter, on every skin tone we tried (forehead +4.6 to +5.0, cheeks +4.1 to +5.0). We traced it to makeup VTO's default skin smoothing: without a `skin_smooth` setting it smooths at 50. Sending strength 0 removed the lightening (forehead -0.3, cheeks +0.1, nose -0.2 L\*). We still composite only the feature region back onto the original, and the browser checks every render, because hair transfer on a full look drifted cheeks and nose 2.1 to 2.8 L\* darker (row 16) and it has no smoothing option to turn off (row 22).

**Telling lighting from a skin change.** A new bob falls past the cheek and shades the skin next to it. That is lighting, not a change to your skin tone, and pasting the original back would be wrong. Ahead leaves a patch out of the check when it is near newly added hair and much darker than the rest of the face, and says which part it left out.

**References must show a person.** Mannequin and flat-lay wig photos are rejected with `error_no_face` at 0 units (row 3), so the catalogue uses only photos of a person wearing the item, and the app says plainly what went wrong.

**Bald is not "short".** The length detector reports a bald head as "above the ears" (row 10). We never infer baldness from it. We ask "Has your hair loss started?" and say why.

**Brows stay soft.** Brow colour and intensity barely change the render (row 14), so we use the person's own brow colour, about 10 L\* darker, and describe brows as soft rather than promising a bold look.

## Accomplishments we are proud of

- 16 of 16 on-model wig renders scored 5 out of 5 in our own review, across fair to deep skin and straight to coily hair (row 1), and the same call works on buzz cuts and bald heads (row 2).
- An integrity check that is honest in both directions: it corrects real drift, it does not blame hair shadow on the face, and it says amber when it could not check.
- A hard budget that holds: ledger, daily cap, IP limit, per-session cap with approval, and a judging reserve the app will not go below.
- A privacy story that is verified, not promised: task delete confirmed live (row 17), and the planning assistant is tested to receive no photos, dates or health details.
- An honesty page built from our own measurements, and a claim map from every README line to a file and a test.

## What we learned

- Read the defaults. The biggest skin tone change in our tests came from a setting we had not set.
- Measure before you promise. Every limit above (no mannequins, soft brows, approximate hair colour) came from a test, and each one changed the design.
- MCP and REST can share a task. A try-on started through YouCam's MCP server can be polled and deleted through the REST API (row 23), which let us keep paid steps inside our own safety rails.
- A preview is only useful if you still recognise yourself in it.

## What is next

- Offer lashes in the app (the compositor is built and tested) and live brows for your own photo.
- A shared catalogue format so a wig retailer can supply on-model photos and appear in the matches.
- More hair textures and skin tones in the sample people, and more recorded looks per person.
- Real conversations with people who have been through this, and with stylists who fit wigs, to shape what comes after the preview.

## User research

[PLACEHOLDER: user-research quotes]

## Built with

Next.js 15, React 19, TypeScript, Vercel, YouCam API (hair transfer v2.1, makeup VTO v2.0, task delete, beauty MCP server), MediaPipe Tasks Vision (face landmarker and selfie segmentation), Vercel AI SDK with its MCP client, Groq, Google Gemini (planning assistant and the AI-generated demo images), Upstash Redis, sharp, Zod, Vitest.

## Try it

- **Live app:** https://try-ahead.vercel.app
- **Sample person path (30 seconds, no photo needed):** open the app, tap "Try with a sample person", pick one of the four people (P1 to P4), choose "My hair is gone". Her hair is gone and the matched wigs and wraps appear on her, each with its skin tone check. Direct link: https://try-ahead.vercel.app/results?person=P1&stage=gone
- **Testing instructions for your own photo:** live try-on on your own photo needs a tester code, because each live render spends YouCam units. Request a tester code privately from the project owner. Take one photo (consent comes first), answer "Has your hair loss started?", and your matches appear. Without the code, your photo still sets your hair colour and matches on your device and previews use the sample people.
- **No key needed:** `npm install && npm run dev` runs mock mode, which replays recorded YouCam results at 0 units.
- **The honesty page:** `/how-we-tested`.
- **Code and claim map:** the repository README and `docs/FACTS.md`.
