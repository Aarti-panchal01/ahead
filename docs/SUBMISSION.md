# Ahead — Devpost submission copy

This is the source-of-truth draft for the Devpost form. Paste the fields below, then replace the demo-video placeholder after the video is public. The technical claims are limited to what the current app actually does.

## Project overview

**Project name**

Ahead

**Elevator pitch** (under 200 characters)

> Preview wigs and headwear on your own photo with YouCam Hair Transfer, compare looks, and take a fitting brief to a specialist.

## Project details

### About the project

Choosing a wig or head covering during treatment-related hair loss is personal. Online, the person making that choice often sees styles on someone else's face, with no simple way to compare the look before meeting a specialist. I built Ahead to make that first step more personal and more useful.

Ahead is a private try-on and fitting companion: a person can preview wig and headwear directions on their own photo, compare the looks they like, and create a fitting brief to bring to a wig specialist. The goal is not to replace a specialist or sell a specific wig. It is to help the shopper explain what they want and give the specialist a clearer starting point for finding a real, suitable product.

The live own-photo flow uses **Perfect Corp.'s YouCam Hair Transfer v2.1 API**. After the person confirms their photo and asks to see matches, Ahead starts the available style previews in parallel. Each two-unit task stays bound to its requested catalogue style; completed renders pass through a same-origin server proxy. The browser then runs Ahead's own face and skin-tone integrity check. When the face needs protection, it restores the original inner-face region with a feathered mask and checks the result again.

The shopper can compare two styles, save favourites, and make a short-lived fitting brief. The brief includes style directions, Ahead reference codes, colour references, and questions about construction, fit, price, care, returns, and availability. It does not contain the person's photo.

Building this taught me that the integration details shape the product. Hair Transfer needs a person wearing the style in its reference image; mannequin and flat-lay images failed with `error_no_face`. I also measured skin-tone shifts in some renders. I changed the catalogue and added a browser-side face/skin check rather than presenting every successful API response as automatically ready.

The current catalogue contains 12 wigs and 4 wraps/caps. It is illustrative: Ahead has no retailer partnership, verified retailer SKUs, live prices or stock, checkout, or measured sales or return outcomes. The `AHD-WIG-*` and `AHD-WRP-*` codes are Ahead matching references, not retailer SKUs. A retailer pilot would connect licensed product imagery and inventory, then measure preview completion, shortlist-to-fitting or purchase, consultation time, and returns against the retailer's baseline.

The preview helps explore style and colour. It does not confirm cap fit, density, comfort, medical suitability, or product availability. Sample people and catalogue references are illustrative AI-generated images, disclosed once in the app footer.

### Built with

Suggested Devpost tags:

- YouCam API / Hair Transfer
- Next.js
- React
- TypeScript
- MediaPipe Tasks Vision
- Playwright

### Try it out links

- **Live app:** https://try-ahead.vercel.app
- **Source code:** https://github.com/Aarti-panchal01/ahead
- **API test notes:** https://try-ahead.vercel.app/how-we-tested
- **Video demo:** `[PASTE PUBLIC YOUTUBE / VIMEO / YOUKU LINK AFTER UPLOAD]`

Judge paths:

- **Recorded sample:** on the landing page choose **Explore sample previews**. It requires no upload, access code, or API units; say clearly that these are saved results, not new live API requests.
- **Fresh own-photo try-on:** choose **Use your photo**, review consent, upload a consented photo, and continue to matches. The public deployment may request a judge access code. Share that access code only through Devpost's permitted private judge instructions; never publish the YouCam API key.

## Additional information for organizers and judges

**Text description: features, functionality, and consumer or retail value**

Ahead uses YouCam Hair Transfer v2.1 to preview wig and headwear styles on a shopper's own photo. The shopper can compare two looks and export a fitting brief for a specialist. It gives the shopper a more personal way to explore styles and gives a specialist concrete references for a fitting conversation. The catalogue is illustrative and has no live retailer products, prices, or inventory; the brief helps connect style discovery to a future retailer catalogue rather than claiming a checkout or sales result.

**Code repository URL**

https://github.com/Aarti-panchal01/ahead

**Was there a moment during the hackathon where the API surprised you—in a good or frustrating way?**

The biggest surprise was that a realistic-looking reference image was not necessarily a usable Hair Transfer input. On-model references worked, while mannequin and flat-lay references failed with `error_no_face`. I rebuilt the catalogue around images of people wearing the styles. I also found that some successful renders shifted skin tone slightly, so Ahead checks the face after try-on and restores the original inner-face region when needed.

**Are there industries or use cases you think Perfect Corp.'s API could serve that nobody is talking about yet?**

Specialist wig services could use virtual try-on as a preparation step before an in-person fitting: a shopper can arrive with a shortlist, while the specialist confirms construction, fit, comfort, and availability in person. The same assisted-shopping pattern may help people exploring hair changes related to alopecia or other forms of hair loss. These experiences should remain opt-in, avoid inferring health conditions from a face, and keep a specialist involved where fit and suitability matter.

**Where did you hit a wall technically? How did you work around it?**

The hard parts were reference-image requirements, asynchronous tasks for many styles, and protecting image quality without hiding failures. Ahead uses only on-model references, starts available previews together after the user requests them, keys every task and result to its own style, and never substitutes a different style when one fails. The API key stays server-side; unit limits and a persistent ledger protect the balance. In the browser, MediaPipe landmarks and a feathered composite support the face/skin check. A failed or unverified preview is shown as such instead of being counted as ready.

**Social post link**

Optional. Leave blank unless you have a public post about the project.

## Account and eligibility fields to complete in Devpost

- **Submitter type:** choose Individual or Team to match the actual submission.
- **Country of residence:** select the submitter's actual country.
- **App status:** choose **New** if Ahead was created for this hackathon. Choose **Existing & Enhanced** only if there was a pre-existing project; if so, describe the substantial hackathon-period work above.
- **Special prizes:** select only awards the submitter is eligible for (for example, student-only awards require student eligibility).
- **Terms:** confirm the official rules and Devpost terms before submitting.

## Media checklist

- Publish a public 1–3 minute video; use [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md) for the shot list and narration.
- Upload current screenshots of the landing page, own-photo results with a genuine YouCam render, comparison, and fitting brief.
- Keep the API key, private tester code, personal photos, and balance screen out of the video and public screenshots.
- Check the public video plays without login and the live app link opens before submitting.
