# Demo script (target 2:40, hard limit 2:50)

Format: phone screen recording at 390 px width (the app is mobile first), voice-over added after. Speak at an easy pace, about 2.3 words a second. Sample person P1 throughout, because the P1 x Short pixie card (W03) is a genuine correction.

## Timed table

| Time | Length | Beat | On screen | Voice-over |
|---|---|---|---|---|
| 0:00 | 2 s | Silent open | The landing triptych, full screen: P1A (today) \| P1B (hair gone) \| the full look (wig and brows). No text, no sound. | (silent) |
| 0:02 | 16 s | The problem | Landing headline "Try on your next hair, before you lose this one." Small caption under it: "77% of patients called hair loss the most feared side effect (Kargar et al. 2011)". | "In one study, seventy-seven percent of patients called hair loss the most feared side effect of treatment. Wigs are usually returnable only unopened. Ahead lets you try one on first." |
| 0:18 | 22 s | Live phone flow | Tap "Try with a sample person", pick Sample person 1, tap "My hair is gone", tap "Show my matches". Cards fill in with the wig on her, each with an "AI-generated" label. | "No photo needed to try it. Pick a sample person, tell it the hair is gone, and you see her in the wigs closest to her own hair: texture first, then length, then colour. Every person and product here is AI-generated." |
| 0:40 | 20 s | Brows, wraps and the match card | Brows are already on; tap "Show without brows", then "Show with brows". Open the Wraps tab for two seconds. Tap one wig's colour match card: her real hair crop next to the swatch, "Bring a lock of her hair to her stylist." | "Brows are on, because they can fall out too. Head wraps are here as well. And the match card is honest: a photo reads hair colour only approximately, so it shows her real hair and says to bring a lock of hair to the stylist." |
| 1:00 | 25 s | The integrity check corrects a real render | On P1's results, scroll to the Short pixie card (W03). Hold on the green line "Corrected: the try-on lightened her skin slightly, restored". Show the compare view or the card's before and after. | "Every render is checked in the browser. Cheeks, nose bridge and chin are measured before and after. Here the try-on lightened her skin. Above a colour difference of two, Ahead pastes her original face back, re-measures, and tells her in plain words what it did." |
| 1:25 | 20 s | The truth-table moment | Cut to /how-we-tested, scrolled to row 20. Highlight "skin_smooth" and "forehead -0.3, cheeks +0.1, nose -0.2". Caption: "YouCam smooths skin by default; we measured it, turned it off, and check every render." | "YouCam smooths skin by default; we measured it, turned it off, and check every render. This page shows every test we ran on the API, including what failed and what we changed because of it." |
| 1:45 | 30 s | The agent plan | Tap "Plan around the treatment dates" (record this beat with P1 on "Not yet" and a first treatment date about ten days from the recording date). Tap "Make my plan". The timeline appears: order-by date, then on the treatment day "Have your wig or wrap ready", then "Hair loss often starts around here", ending "Check details with your care team." Brief on-screen line: "The assistant never sees photos, dates or health details." | "The planning assistant builds a calendar around the first treatment day. Order a week before, and on the treatment day: have your wig or wrap ready. The calendar is worked out on our side. The assistant never sees your photos, your dates, or any health detail, and every paid step waits for your OK." |
| 2:15 | 10 s | The stylist brief | Back to results, tap "Make a brief for my stylist". The brief page: chosen styles, hair colour, "I will bring a lock of hair", the preview line. Show the link. | "One tap makes a brief for her stylist: the styles, the colours, and a link that expires. No photos, no accounts." |
| 2:25 | 15 s | Close on the APIs | Black-on-light end card, one line per API, each named: "YouCam hair transfer v2.1: wigs and wraps", "YouCam makeup VTO v2.0: brows and lashes, skin_smooth 0", "YouCam skin tone analysis: measured, documented", "YouCam task delete: your try-ons are deleted at the end", "YouCam beauty MCP server: tools/list for the agent". Last frame: "Ahead. Try on your next hair, before you lose this one." and the live link. | "Ahead runs on YouCam's hair transfer, makeup try-on, task delete and beauty MCP server, shaped by our own tests of skin tone analysis. Try on your next hair, before you lose this one." |

Total: 2 + 16 + 22 + 20 + 25 + 20 + 30 + 10 + 15 = 160 seconds = **2:40**. That leaves 10 seconds under the 2:50 limit for pauses.

## Word budget (check before recording)

At about 2.3 words a second the voice-over must stay within these counts: problem 37, flow 50, brows and match card 46, integrity 57, truth table 46, plan 69, brief 23, close 34. The text above is written to fit; if a take runs long, cut the sentence about wraps (0:40) or the "Order a week before" sentence (1:45) first.

## Pre-flight checklist (do these before recording)

1. Open https://try-ahead.vercel.app in a phone-size window (390 px). Check the footer shows the deletion line.
2. The P1 x Short pixie (W03) card is the "something new" card on P1 results. Confirm on screen that its green line reads "Corrected: the try-on lightened her skin slightly, restored" with brows on. If the brows-on line differs, tap "Show without brows"; the plain render of P1 x W03 is the genuine correction measured by `test/image/integrity.test.ts` ("P1B__W03 lightened the whole face"). Record whichever view shows the correction and say only what the screen says.
3. The plan beat: "Have your wig or wrap ready" appears when the stage is "Not yet" and a first treatment date is entered. With "My hair is gone" the calendar has no treatment-day step (`lib/agent/timeline.ts`). Record the plan beat as a separate take with P1 on "Not yet", and cut it in.
4. Mock or live does not matter for the sample person: its try-ons are recordings and spend 0 units. Do not record an own-photo take without checking the unit balance first; the 150-unit reserve is for judging.
5. Do not show a tester code on screen.
6. Say "AI-generated" at least once in the voice-over, and keep the "AI-generated" labels visible when recording the cards.

## Rules for the cut

- Cosmetic language only: never say treat, cure, prevent or regrow in connection with the app. "Treatment" is used only for the person's own treatment dates.
- The only statistic spoken is the Kargar et al. 2011 figure, with its source on screen. No other numbers except our own measurements (row 20).
- Global framing: no country-specific examples, no insurance or charity claims.
- Say "YouCam smooths skin by default". Never call it a bug or a bias.
