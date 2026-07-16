# ClipFlow — Session Handoff
_Last updated: 2026-07-16 — Session 106 — **#164 Phase B gate PASSED; build plan B1-B4 written and AWAITING FEGA'S GO. Zero src/ changes this session.**_

---

## One-line TL;DR
Planning + prototype session: the Phase B (auto-detect layout boxes) plan was revised against shipped Phase A reality and posted to #164, the detection prototype gate ran on Fega's real footage and PASSED decisively (100% recall incl. ~51px faces, boxes within 0-4px on 4/6 sources, clean refusal on the one adversarial case), Fega added a no-webcam requirement (two tweakable presets) mid-session, and the full build plan (B1-B4) is written in tasks/todo.md. **Next session opens by getting the green light on B1 — it was asked but Fega wrapped for token budget instead of answering.**

## Current State
- **Daily driver unchanged: 0.1.9-alpha.5** — no app code touched this session.
- master has: gate results + revised plan + BUILD PLAN in `tasks/todo.md`, gate harness preserved in `tasks/spikes/164-phaseb-gate/` (README = scorecard + final algorithm constants + re-run steps), CHANGELOG session-106 entry.
- #164 has two new comments: revised Phase B plan (issuecomment-4988743585) and the gate scorecard (issuecomment-4988885503).
- Approved decisions locked this session: **order flip** (first-recording auto-offer ships LAST, consuming detection) and **no-cam presets** ("Fully zoomed" + "Fit to screen", tweakable starting points, offered when detection finds no facecam).

## What Was Built (prototype only, session scratchpad + spike copy)
1. **Headless-Electron detection harness**: hidden window over localhost http, MediaPipe tasks-vision **0.10.35** blaze_face_short_range (~230KB model), full-frame pass + overlapping tile grids [2,4] (+6 on ≤1080p-scale sources) — tiling is load-bearing for small faces (every small-face hit came from tiles).
2. **snap.js** — the settled algorithm: consensus cluster (≥75% of frames, <2%-diag spread, containment dedupe) → stacked-world check (full-width temporal-variance band, quiet/loud ≥2.5, refined boundary) → overlay region (flood over sharp-in-mean OR abs-quiet mask from face seeds, box-averaged ds2, dilate r1, occupancy trim 0.12) → refusal caps. Constants final — B1 ports 1:1.
3. **Gate results**: v1 stacked 0/0/0/2px vs Fega's saved layout; v2 old-vertical band visually exact (robustness only, 9:16 skips reframe in-product); v3 borderless rounded overlay worst edge ~54px (~2% width); manufactured m240 2/3/2/4px, m320 2/2/2/2px; m480 (cam abuts RL boost HUD over dark corner) = clean refusal, never a wrong box. Annotated overlays delivered in chat.

## Key Decisions (this session)
- **Detector settled: MediaPipe only.** YuNet/onnxruntime fallback dropped — gate proved it unnecessary. Pure WASM, offline, ~11.5MB assets, zero native modules.
- **Refusal posture**: when segmentation runs away, propose NOTHING (manual calibration remains the path). Never ship a confident wrong box.
- **Two-world game-box rule**: overlay cam → game = full frame; full-width/height cam band → game = complement band. Geometry only, no game-box ML. Taste insets (Fega's 144px) are the user's nudge, not detection's job.
- **Third detection outcome 'nocam'** (Fega, this session): confident no-facecam → offer two presets — **Fully zoomed** (centered 9:16 crop fills the frame, slideable) and **Fit to screen** (full game centered, blurred bg behind). Presets prefill the normal draft: everything stays tweakable and library-saveable. Requires camRect to become nullable (B3).
- **Detection runs in a dedicated hidden window** (mirrors subtitle-overlay-renderer.js:189 pattern): own `public/detect.html` with page-scoped CSP (`wasm-unsafe-eval`, blob:) — **main window's CSP (index.html:7) untouched**. Assets vendored to `public/mediapipe/`; loaded via preload-fs → blob URLs + modelAssetBuffer; named fallback if blob dynamic-import fights file://: `protocol.handle('clipflow-detect')`. Infra-dashboard note due when B1 lands (CSP rule in CLAUDE.md).
- Version: no cut this session (planning/prototype). One installer after B4; sizing at that wrap — 0.2.0 line is the epic-completion candidate.

## Next Steps
1. **Get Fega's go on B1** (he read the plan summary but wrapped before answering). Plan: `tasks/todo.md` → "BUILD PLAN" section.
2. B1 detection engine (hidden window + IPC `detect:run` + native-res ±60px edge refinement — the one NEW piece vs the spike) → B2 Detect button (face path) → B3 nullable camRect + presets → B4 auto-offer banner.
3. Per-slice verification is spelled out in todo.md (CDP drives on the dev sandbox, real renders for B3, packaged-exe offline check for B1).
4. Carried, unrelated: Projects-tab preview consistency for reframe projects (cosmetic), #165 zoom tuning, #163 YouTube reconnect messaging.

## Watch Out For
- **`projects.js:265` updateReframe rejects a null camRect today** — B3 must relax it deliberately (both-rects assumption also lives at `render.js:58` isReframeActive and `PreviewPanelNew.js:917` + `:1244` guards). This is the session-104 whitelist-writer trap's cousin — handle all four sites together.
- **Game-only band placement is NEW math**: game band centers vertically (y=(1920−gameBand)/2) when camRect is null; feather/bg skip when gameBand ≥ ~1916 (Fully-zoomed fills the frame). Both engines must stay in lockstep (parity by construction, like bgSourceWindow).
- **Every hidden `<video>` needs teardown** (Chromium DOMDataStore crash memory) — the B1 frame sampler creates one per run.
- **Don't re-derive detection constants** — port from `tasks/spikes/164-phaseb-gate/snap.js`; the README lists them. Box-averaged downsample is load-bearing (point sampling aliases thin cam borders away).
- v2-style old vertical recordings classify as stacked — fine, but in-product true 9:16 sources skip reframe entirely; never wire detection into the 9:16 path.
- The pinned `@mediapipe/tasks-vision@0.10.35` goes in devDependencies only (assets vendored into public/) — remember the package.json-stripper check (99-line file, restore from HEAD if scripts/build/devDeps vanish).
- Session-106 scratchpad (id `8d14e408…`) holds the extracted frames + manufactured sets (~97MB) — reusable for B1 verification if still on disk; regenerate via spike README ffmpeg steps if wiped. Gate source videos are Fega-supplied W: paths listed in todo.md.

## Logs/Debugging
- **Spike re-run**: `tasks/spikes/164-phaseb-gate/README.md` has the full recipe (npm i pinned dep, model curl URL, ffmpeg frame extraction, `electron main.js v1` → `node snap.js v1`). Harness prints per-frame detections to stdout; `detections-*.json` / `proposal-*.json` are the artifacts.
- **Gate outputs in repo**: `proposal-*.json` (actual gate results) sit next to the spike. Annotated overlay JPGs were chat-delivered (not committed — frames contain Fega's face and 97MB of extractions stayed in scratchpad).
- **#164 trail**: plan revision comment 4988743585 → scorecard comment 4988885503. Commits: `6d204f3` (gate results), session-wrap commit (build plan + spike + changelog + handoff).
- No Sentry/app logs this session — the app never ran.
