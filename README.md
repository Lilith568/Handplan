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

Tasks are typed on the flat browser page (system keyboard, works with hands on Quest). Sorting and focus happen in the headset.

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
| `src/panel.ts` | Start panel on the flat page |

## Status (11 Nov 2026)

Verified in headless Chrome: production build, flat-page mouse flow (sort into all three trays, refusal of a fourth Today card, tap to focus), and an emulated Quest 3 passthrough session starting and seating the workspace in front of the head.

**Not yet verified:** real hand tracking on a headset, and the Meta VR Glasses field of view.

## Before submission (deadline 18 Nov 2026, 12:00 PST)

- [ ] Test on a Quest (or the XR Simulator) with hands only; tune pinch distances
- [ ] Add tasks inside the headset by voice
- [ ] Keep the workspace position between sessions (spatial anchor)
- [ ] Host the build (GitHub Pages) and put the link in the Devpost form
- [ ] Record the demo video, under three minutes, best moment first
- [ ] Confirm in the full rules that one person may submit more than one entry
