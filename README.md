# Handplan

**Three things. By hand.** A hands-first morning planner for Meta Quest and Meta VR Glasses, built with the Immersive Web SDK (WebXR).

Working title. Entry candidate for the Meta VR Start Developer Competition 2026, Productivity track, New Experience division.

## What it does

A three-minute ritual at your desk, in passthrough:

1. Your open tasks appear as paper cards in a row in front of you.
2. Pinch a card and drop it on **Today**, **Later** or **Drop**.
3. **Today holds three cards.** A fourth is refused until you move one out. That limit is the product.
4. Pinch-tap a Today card to start a focus timer. Pinch **Done** when it is finished.
5. Next morning, everything you did not finish comes back to the row, marked "carried over", so it gets decided again instead of rotting in a list.

Add a task by pinching **+ Say a task** and speaking, or type it on the flat browser page. Pinch the **move** handle to seat the workspace where you like it; it comes back there next time.

## Why it fits the brief

- **Hands only, start to finish.** Every action is a pinch or a pinch-drag. No controller path exists.
- **Seated, two-foot radius.** The whole workspace sits within arm's reach and follows a `move` handle if you want it elsewhere.
- **Narrow-view friendly.** Drop targets are judged by direction from the head, not exact position, so the same gesture works with a hand ray, gaze-and-pinch on glasses, or a mouse.
- **Daily moment.** Built around one recurring context: the first minutes at the desk.
- **Fast cold start.** No downloaded models or audio files; all surfaces are drawn at runtime.

## Run it

```
npm install
npm run dev          # managed dev session with the browser XR emulator
npm run build        # static site in dist/ for GitHub Pages or any host
```

Requires Node 20.19+, 22.12+ or 24+.

## Code map

| File | Role |
| --- | --- |
| `src/plan-store.ts` | Plan data, the three-card rule, daily roll-over, local storage |
| `src/planner.ts` | Layout, grab and drop handling, focus timer |
| `src/visuals.ts` | Canvas-drawn cards, trays, header, dial, buttons |
| `src/sound.ts` | Synthesized audio cues |
| `src/voice.ts` | Speech capture for adding a task in the headset |
| `src/panel.ts` | Start panel on the flat page |

## Status (11 Nov 2026)

Verified in headless Chrome:

- production build and the flat-page mouse flow (sort into all three trays, refusal of a fourth Today card, tap to focus);
- an emulated passthrough session that seats the workspace in front of the head;
- **Meta VR Glasses profile** (gaze tracking granted): every element measured inside the 37° / 37° / 25° up / 43° down view. Tightest margins: move handle 41.7° down, Today tray 37.7° down, inbox row 31.7° to the side;
- the voice button adds a card, tested with a stand-in recogniser;
- a moved workspace seat is stored and restored on the next visit.

**Not yet verified:** real hand tracking and real gaze on a device, and whether the Quest browser provides speech recognition. Where it does not, the button says so and the flat page's text field remains the way to add tasks.

## Before submission (deadline 18 Nov 2026, 12:00 PST)

- [ ] Test on a Quest (or the XR Simulator) with hands only; tune pinch distances
- [ ] Confirm voice entry on the device
- [ ] Turn on GitHub Pages (Settings > Pages > Source: GitHub Actions) and put the link in the Devpost form
- [ ] Record the demo video, under three minutes, best moment first
- [ ] Confirm in the full rules that one person may submit more than one entry
