# Still Me

Try on your next hair, before you lose this one.

Still Me is for people facing treatment-related hair loss. Try wigs and head wraps on your own photo, before and after the hair goes, and every result is checked so it is still you. Built on the YouCam API for the YouCam API Skin AI & eCommerce VTO Hackathon (eCommerce VTO track).

**Status:** Ring 1 foundation (see `PLAN.md`). Cosmetic previews only: style and colour, not cap fit, density or comfort. No medical claims.

## AI-generated content

All demo people, test faces and catalogue wigs and wraps in this repo are AI-generated (Google Gemini). No real person appears in any image here.

## Run it

```bash
npm install
npm run dev        # mock mode by default: replays recorded YouCam results, 0 units
npm test
```

Live mode: set `YOUCAM_MODE=live` and `YOUCAM_API_KEY` on the server (see `.env.example`). The key never reaches the browser.

## What YouCam can and can't do here

Every API behaviour this app relies on was measured first: `docs/api-truth-table.md`.

## Licence

MIT
