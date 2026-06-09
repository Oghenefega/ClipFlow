# ClipFlow — Session Handoff
_Last updated: 2026-06-09 — Session 76 — **Session-75 verification + a full preview-zoom rework.** Fega verified last session's #133 (panel widths) and #124 (waveform logs) → both closed. Then #134 (zoom) went through five feel-iterations and became a ground-up rework: the preview now floats on an open "Photoshop layer" canvas (physical-resize zoom, translate pan, free movement, crisp text, smooth). #134 closed; a new caption feature (#135) was split out._

---

## One-line TL;DR

Preview zoom/pan was rebuilt from "enlarge the video inside a scroll box" to "video floats on an open canvas" — zoom-to-cursor with gentle proportional center-drift, physical resize (crisp text), free middle-mouse pan in all directions at any zoom (keep-visible clamp), Fit/Ctrl+0 recenter, jitter-free. All in `PreviewPanelNew.js`. #133/#124/#134 closed and Fega-verified; #135 filed.

## Current State

Healthy on `0.1.6-alpha`, schema **v4** — unchanged (no migrations). Renderer rebuilt many times this session (`build/` regenerated; gitignored). **One commit pushed this session:** `52048f5` (the zoom rework + CHANGELOG + lesson). This wrap adds a second commit (HANDOFF + distilled skill update + marker). Working tree otherwise has only runtime churn + unrelated files — see Watch Out For. The app is currently running from source (`npm start`, background) with the new code.

## What Was Just Built (all in `src/renderer/editor/components/PreviewPanelNew.js`)

The whole change is the preview zoom/pan model. Old model: canvas sized `height:${zoom}%` inside an `overflow:auto` scroll box, centered with `margin:auto`, panned by `scrollLeft/Top`. That box's walls were the video's own edges → zoom hit invisible limits and the cursor-anchor snapped near them. New model:

1. **Floating layer.** Canvas is `position:absolute; left/top:50%`, sized **physically** = `fitSize × scaleOf(zoom)` px (React-driven from `zoom` state). Pan is a CSS `transform: translate(calc(-50% + panX), calc(-50% + panY))` applied **imperatively** (`applyTransform`, reads `panRef` — a ref, no re-render). The `-50%,-50%` recenters the box on its anchor; `panRef` offsets the canvas center from the viewport center.
2. **Zoom-to-cursor + gentle center drift.** `onWheel` (±2% step) computes `pan' = dc − (dc − pan)·(scaleNew/scaleOld)` where `dc` = cursor offset from viewport center, then multiplies by a **zoom-proportional** drift `min(1, (sOld/sNew)^CENTER_DRIFT)` (CENTER_DRIFT=1) so the focal point eases toward center as you zoom IN, and zoom-OUT leaves the cursor anchor untouched (no snap).
3. **Free pan, keep-visible.** `clampPan` lets the layer move in every direction at any zoom (even <100%), stopping only when `KEEP_VISIBLE` (48px) of the canvas remains on-screen — can't be lost. **Fit / Ctrl+0** resets pan to {0,0} (recenter; also resets zoom to fit). Middle-mouse `onPanDown` now drags `panRef` (was `scrollLeft/Top`).
4. **Crisp text.** Because zoom is a physical resize (not `transform: scale()`), the caption/subtitle fonts re-rasterize at the new size instead of being bitmap-stretched → no blur. `scaleFactor = canvasWidth/1080` still drives font size; `canvasWidth` (ResizeObserver, layout box) now grows with the physical resize.
5. **No jitter.** Size (React) + pan (imperative translate) are reconciled **together** in a `useLayoutEffect` keyed on `[zoom, fitSize]` (runs after the size commit, before paint). The wheel handler no longer pre-applies the transform — doing so painted a displaced "old-size + new-pan" frame that the next commit corrected = the jitter Fega saw.

Removed orphans: `zoomAnchorRef`, `panStartRef`, the old rAF/scroll nudge, `margin:auto`, `overflow:auto`. Added `useLayoutEffect` import + module consts `scaleOf`/`clampv`/`CENTER_DRIFT`/`KEEP_VISIBLE`.

## Key Decisions

- **Floating-layer (transform/physical-resize) over the scroll-box model.** Fega explicitly approved the rework when the scroll model couldn't deliver "infinite canvas." This supersedes session 75's `margin:auto` scroll-centering for the same #106/#134 complaints.
- **Physical resize for zoom, transform only for pan.** Pure `transform: scale()` was tried first and **blurred text** — a real regression. Physical resize keeps text crisp; transform is reserved for translate. (Distilled to `clipflow-editor-patterns` → Zoom.)
- **Center drift is proportional to the zoom delta, capped ≤1.** A fixed per-notch pull (the first attempt) snapped a 2% step across the screen. Proportional drift is smooth and snap-free.
- **Recenter = Fit for now.** Fega was offered a dedicated "recenter at current zoom" button (keeps zoom); he didn't take it this session. Easy 5-line add if he wants it (set `panRef={0,0}` + `applyTransform()` without touching `zoom`).
- **Caption corner-resize handles split to #135, not bolted on.** It's a distinct caption-overlay feature (free-transform / scale the text layer independent of font size), filed rather than rushed into the zoom session.
- **#92 left closed + `status: untested`.** Only observable on a real disk-write save failure; couldn't trigger live, trace-confirmed last session. Not worth a synthetic failure harness right now.

## Next Steps (prioritized)

1. **#135** — caption box **corner handles** to scale the text layer without changing the font-size number (Photoshop free-transform). Touches `DraggableOverlay` in `PreviewPanelNew.js` (currently only left/right edge handles → `widthPercent`); persist a `scale` in `useCaptionStore`; make the **render/export** path honor it, not just preview.
2. **Optional quick win:** dedicated **recenter-at-current-zoom** control (Fega offered, deferred).
3. **#87** — `createSegmentAtTime` min-duration clamp can overlap the next segment (small subtitle-store fix).
4. **Karaoke fragile zone** (`tasks/backlog-triage.md` §C): #89 → #131 (+#132) → #95 → #90+#88 — one-per-commit, verified on a GENERATED clip.
5. **#68 → #62** (pipeline pair) — Part A (relocate `energy_scorer.py` → `tools/`) then #62 silent-audio tolerance. Needs a silent screen-recording from Fega.

## Watch Out For

- **Preview zoom centering depends on `position:absolute; left/top:50%` + the translate's `-50%,-50%`.** Don't reintroduce flex `margin:auto` / `overflow:auto` on the container — that's the old scroll-box model the rework removed. The container is now `overflow-hidden relative`.
- **Never CSS-`transform: scale()` the preview canvas** — it blurs text. Zoom must be a physical width/height resize. (Captured in `clipflow-editor-patterns` → Zoom.)
- **Apply size + pan atomically.** Size is React-driven (`zoom` state → canvas width/height); pan is imperative (`applyTransform`). They're reconciled in the `useLayoutEffect` keyed on `[zoom, fitSize]`. If you add a new zoom trigger, route it through `setZoomState` so that effect fires — don't set the transform from an event handler before the size commits (jitter).
- **`zoomRef.current = newZoom` in `onWheel` is load-bearing** for rapid scrolling — it feeds the *next* wheel event's `oldZoom` before React re-renders. Don't remove it.
- **#92 is closed but `status: untested`** — verify on a real save failure if it ever comes up.
- **Uncommitted, NOT mine — leave alone:** `data/clipflow.db`, `data/game_profiles.json` (runtime churn — never commit); `tasks/specs/tiktok-content-posting-audit.md` (modified) and `tasks/session-39-tiktok-audit-transcript.md` (untracked) — a separate TikTok-audit workstream, not touched this session.

## Logs / Debugging

- **Renderer changes need `npm run build:renderer` (vite) before `npm start`** — `npm start` loads from `build/`. The >500 kB chunk warning every build is benign (desktop app, no code-splitting wanted).
- **Restarting the running app from here:** `powershell -File C:\Users\IAmAbsolute\AppData\Local\Temp\clipflow-restart.ps1` stops only ClipFlow's `electron.exe` processes (filtered by `CommandLine -like '*ClipFlow*' -and -notlike '*claude*'`), then `npm start` relaunches. The killed background `npm start` reports "exit 127" — expected, not an error. The Chromium `disk_cache: Access is denied` lines on startup are benign GPU-cache noise.
- **Verifying the zoom by eye is the only real test** — build-pass is necessary but not sufficient for feel. Fega drove the verification: cursor-follow, tiny-step smoothness, free pan all directions, crisp text, no jitter. Overlay (#65) regression risk was specifically checked — subtitles/captions stay pinned and crisp at all zooms.
- **Prod log:** `%APPDATA%\clipflow\logs\app.log` (electron-log); waveform diagnostics under scope `(video-processing)` (confirmed working this session, #124).
- **Issue hygiene:** close via `gh issue close --reason completed --comment …` and `gh issue edit --remove-label "status: untested"`; reference issues in commits as `(#N)` (NOT `Fix #N`, which auto-closes on push before verification).
