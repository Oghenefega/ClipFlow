# #164 Phase B gate harness (session 106, 2026-07-16) — PASSED

Prototype that settled the Auto-Reframe detection approach. The algorithm in
`snap.js` (consensus cluster → world classify → band/region snap) is the
1:1 port source for B1 — constants are final, don't re-derive.

## Scorecard

| Source | World | Recall | Cam rect vs truth |
|---|---|---|---|
| 2560×2880 stacked (Fega's canvas) | stacked | 8/8 | 0/0/0/2 px vs saved layout |
| 1080×1920 old vertical | stacked | 8/8 | band 702, visually exact (robustness only) |
| 2560×1440 borderless overlay cam | overlay | 8/8 | worst edge ~54px ≈ 2% width |
| m240 composite (~51px face) | overlay | 8/8 | 2/3/2/4 px |
| m320 composite | overlay | 8/8 | 2/2/2/2 px |
| m480 (cam abuts boost HUD) | — | 8/8 | clean refusal, no wrong box |

Detector: MediaPipe tasks-vision **0.10.35**, blaze_face_short_range
(~230KB), full-frame pass + overlapping tile grids [2,4] (+6 for small
sources), minDetectionConfidence 0.35. Pure WASM, no native modules.

## Re-run from scratch

```bash
npm init -y && npm i @mediapipe/tasks-vision@0.10.35 pngjs --no-audit
curl -sL -o blaze_face_short_range.tflite "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
# extract 8 frames per source (spread 10-90% of duration):
#   ffmpeg -ss <t> -i "<video>" -frames:v 1 -y v1/f<i>.png   (see job-v1.json for the frame list shape)
<repo>/node_modules/.bin/electron main.js v1   # -> detections-v1.json
node snap.js v1                                # -> proposal-v1.json + score
```

Gate videos (Fega-supplied, W: drive): paths in tasks/todo.md gate section.
proposal-*.json here are the actual gate outputs. Annotated overlays were
delivered in the session-106 chat; scorecard also on #164.

## Algorithm constants (final)

- Consensus: cluster by center dist < 4% of frame diagonal + size ratio <1.6;
  keep clusters in ≥75% of frames with spread < 2% diag; drop boxes nested
  (containment >0.8) inside a higher-score candidate.
- Stacked world: full-width temporal-variance row profile; quiet run around
  the face must reach a frame edge; loud/quiet ratio ≥2.5; boundary = max
  step of ±8-window means within ±24 ds rows, refined.
- Overlay world: mask = sharp-in-mean (|grad(mean)| > max(10, 6·median)) OR
  temporally quiet (V < clamp(0.2·medianV, 6, 10)); dilate r1; flood from
  face seeds; occupancy trim <0.12; ds2 box-averaged downsample (point
  sampling aliases thin borders away — keep the box average).
- Refusal: component >50% of frame or rect >60% of frame area → no proposal.
- B1 adds (not in this spike): native-res ±60px edge refinement.

## Session-107 appendix — B1 shipped; refinement rule + the 54px re-measurement

B1 ported this algorithm 1:1 into `public/detect-page.js` (in-app results matched
this gate on all three videos, dev + packaged). The refinement that shipped:
per edge, median |Δluma| per line between 2 far-apart frames over ±60px;
a candidate must pass long-window (12-line) quiet/loud (loud ≥ max(2q, q+8));
the WINNER is the sharpest 3-line gradient (floor 6). Hard boundaries step
~17-32/line; feather fades ramp ~1-2/line and must not win (argmax on
windowed delta alone dragged v3's left edge into the game).

**v3's "worst edge ~54px" was a feather, not a miss:** objective per-column
8-frame std (edge-probe.js in the session-106 scratchpad, gate PNGs) puts the
hard content boundary at x≈655 — quiet ≤3 inside, 18-33 damped-game in the
fade zone 656-712, 43-49 full game beyond. Objective boundaries: L≈29-30,
T≈431, R≈655, B≈783. B1's refined box {30,430,625,353} is 0-1px on all four.
