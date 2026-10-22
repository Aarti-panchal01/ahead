# Ahead
Try on your next hair, before you lose this one.
For people facing treatment-related hair loss: wigs, head wraps, brows
and lashes on your own face, before and after the hair goes, with every
render checked so it is still you. Never describe the product as
"refusing to change who you are" (too close to a past winner).
YouCam API Skin AI & eCommerce VTO Hackathon, eCommerce VTO track.
Target finish Oct 30 2026. Hard deadline Nov 2 2026, 10:15 pm IST.

## Stack
Next.js (App Router) + TypeScript on Vercel, mobile-first. All YouCam
calls in server routes. Server creates the task and returns task_id;
the browser polls. Key in env YOUCAM_API_KEY, never sent to the
client, never logged.

## YouCam truth (from docs/api-truth-table.md, do not relearn)
- Wigs and wraps: POST /s2s/v2.1/task/hair-transfer with src_file_id,
  ref_file_id, hair_color "ref". 2 units, 9 to 30 s, show progress.
  Works on fair to deep skin, straight to coily hair, glasses,
  ponytails, braids, buzz cuts and bald heads.
- References MUST show a person wearing the wig or wrap. Mannequin or
  flat photos fail with error_no_face (0 units): tell the user plainly.
- Never use built-in hair templates (colour unreliable). Never use the
  hat or scarf APIs (they replace the person).
- Makeup-vto (brows, lashes, 1 unit) lightens the whole face by about
  +5 L* on every skin tone. ALWAYS composite only the feature region
  back onto the original (landmark mask, feathered, global shift
  removed). Colour comes from the user's eyebrow_color.
- skin-tone-analysis: 20 units, once per session, cached, crop tight
  to the face first. Hair colour is approximate (greys read darker),
  so the match card shows the user's real hair crop next to the swatch
  and tells them to bring a lock of hair to their stylist.
- hair-length-detection: 2 units, optional. Right on normal hair, but
  reports a bald head as "above the ears". Never infer baldness from
  it: ask the user, and say why.
- Hair type, density and frizz detection are NOT used.
- Errors can arrive in HTTP 200 with task_status "error" and cost 0
  units. A create that returned an error may be retried once. Never
  retry a create that might have succeeded. Poll every task to the end.
- Every paid call goes through the ledger and cache. Mock mode replays
  saved results at 0 units and is the default in development.
- Keep at least 150 units in reserve for judging (Nov 3 to 20).

## Core rule: integrity on every render
After every YouCam result, in the browser: MediaPipe face landmarks,
sample both cheeks, nose bridge and chin (never the forehead, hair may
cover it). Compare with the original in Lab: ΔE2000 and ΔL*. Above
ΔE2000 3, paste the original inner face back with a feathered mask,
re-measure, and tell the user in plain words what was corrected. Every
result card shows the check result.

## Product rules
- Cosmetic language only. No medical claims, no treatment advice.
  A claim linter in CI blocks medical wording, including agent output.
- Every preview says: style and colour preview, not cap fit, density
  or comfort.
- Privacy: consent before the camera, nothing stored after the session,
  YouCam tasks deleted at the end (verify the delete endpoint in the
  docs), images never logged. Stylist brief links expire.
- All demo people and catalogue items are AI-generated and labelled
  in the UI and README. Every persona or catalogue image renders through
  components/AiImage.tsx, which always shows an "AI-generated" label.
- Global framing: no country-specific insurance or charity claims in
  the core flow.
- First-time user must get the value in 30 seconds: one selfie, then
  themselves in matched wigs. Everything else comes after.

## Design
- Feel: a private fitting mirror at home. Not clinical, not glossy
  beauty, no pink ribbons.
- The one bold thing: the user's measured hair colour becomes the accent
  colour across the app. Everything else stays quiet. If it fails 4.5:1
  contrast on the background, darken or lighten it until it passes.
  Fallback accent #5B4636.
- Palette: background #F3F5F2, ink #1E2A2A, integrity green #2F6F5E,
  warning amber #A86B12.
- Type: Atkinson Hyperlegible everywhere; Newsreader only for the
  landing headline.
- Layout: mobile-first, single column, left-aligned, big tap targets.
  The user's own photo is the hero on every screen.
- Avoid: cream plus terracotta, all-caps labels, 01/02 markers unless
  it's a real sequence, fade-in on every section, arrows on buttons.
- Copy: plain sentence case, buttons say exactly what happens, errors
  say what to do next.

## Agent
- YouCam's beauty MCP server (https://mcp-api-01.makeupar.com/mcp/beauty,
  same bearer key) where tools exist. Verify with tools/list first.
  Steps not available through MCP use the REST client, and the README
  says which.
- Flow: preferences + treatment start date -> one skin-tone call ->
  catalogue shortlist by colour and length (local tool) -> try top 3
  -> integrity check in the browser -> timeline + match card + brief.
- Guardrails in code: 30 units max per session, user approves before
  any paid step, claim linter on all agent text.
- Vercel AI SDK with its MCP client.

## User research
Quote people only with permission, first name and role only, never
store anyone's health details.

## Working style
- Read PLAN.md at the start of every session; work on the current ring.
- Small commits, clear messages. Lint, typecheck and tests before each.
- Ask before adding big dependencies or spending more than 20 units
  in one go.
