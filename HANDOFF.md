# ClipFlow — Session Handoff
_Last updated: 2026-06-22 — Session 91 — **Cleared the entire alpha.11 verification backlog (5 items closed), fixed the choppy exported-subtitle animation (#148), and cut 0.1.8-alpha.12 to promote it + the Review Rail card to the installed daily app. Fega verified the animation is smooth. Clean stopping point.**_

---

## One-line TL;DR
Exported clips no longer play their subtitle "pop"/karaoke animation as stop-motion: the offscreen overlay now captures at **30fps** (was 10) and the per-word pop is recreated as a **time-driven ease** (the offscreen DOM is rebuilt each frame, so CSS transitions couldn't carry). Shipped in **0.1.8-alpha.12** (installer cut) alongside the session-90 Review Rail Projects card; Fega confirmed it's smooth and #148 is closed.

## Current State
On **0.1.8-alpha.12** (bumped this session; installer `dist/ClipFlow Setup 0.1.8-alpha.12.exe` cut, ~121MB). Renderer + installer build clean. Working tree is the usual always-dirty `data/clipflow.db` + `data/game_profiles.json` (never commit) + pre-existing untracked scratch in `tasks/mocks/`. **No open in-flight task** — this is a clean checkpoint.

## What Was Just Built (this session)
- **#148 — smooth exported subtitle animation (the main work).** Two stacked defects in the export-only overlay path, both fixed:
  - **Frame rate:** `OVERLAY_FPS` 10 → **30** in `src/main/subtitle-overlay-renderer.js`. The subtitle layer was only redrawn 10×/sec while the video ran at source fps (e.g. 60), so FFmpeg held each overlay frame ~6 video frames → stop-motion. `render.js` already forwards `overlayResult.fps` to FFmpeg's input framerate; output is still conformed to source fps. No `render.js` change.
  - **Eased pop:** the editor preview animates the per-word pop via CSS (transition + `@keyframes subGrow`, `PreviewOverlays.js`), but the offscreen renderer **rebuilds its DOM every frame** (`overlay-renderer.js:141 inner.innerHTML=""`) so CSS transitions can't carry, and it applied only a **static** scale (active snapped to 1.2; single-word didn't grow). Recreated the pop as a pure **function of time** in `public/subtitle-overlay/overlay-renderer.js` (`popScale`/`growT`/`easeOutCubic`), mirroring `animateSpeed`/`animateScale`/`animateGrowFrom`, including the **shrink-back handoff** on the previous word.
- **Verified + CLOSED the whole alpha.11 backlog:** #140 (cancel render), #138 (ALL CAPS), #137 (timeline split), #99 (caption bleed) — all `status: untested` labels removed — plus the **Bucket-A** export-with-subtitles check (subtitles present + Latina Essential font). Bucket A is now fully done.
- **Cut alpha.12** (clipflow-update-launcher): version bump + CHANGELOG + installer, committed `package.json` + `CHANGELOG.md` only.

## Key Decisions
- **30fps overlay, not 60.** Fega picked the smoothness/render-time sweet spot (30fps = ~3× the old overlay-render time; 60 would be ~6×). 60 (match-source) stays an option if 30 ever looks insufficient — it's a one-constant change.
- **Time-driven pop is the correct model, not a workaround.** A frame-by-frame renderer must compute animation state as f(t); relying on CSS transitions across a per-frame-rebuilt DOM is what was broken. The steady-state scales are identical to the old static values, so the change is strictly additive (no regression to the settled look).
- **Cut an installer because Fega tests on the installed daily build.** A source-only fix + "close and reopen" does NOT reach him. Recorded as memory `feedback_test_on_daily_build` (I wrongly inferred he was on source earlier this session — see lessons.md S91).

## Next Steps (prioritized)
1. **Finish the Projects tab** — the last deferred piece of the locked Review Rail design: premium **tab header** (title + clip count + filter chips) + **width-capped centered column** (cards are still full-bleed). Card itself is done + shipped.
2. **Backlog picks:** #69 user-facing trim toggle, #7 projects search, #128 timeline-scrub frame-skip on long sources, #114 preview/editor line-break parity, #135 caption corner-scale handles.
3. **Audit coverage gap (from session 85):** Publish/OAuth flows (YouTube/TikTok/etc.) are entirely unaudited — the most likely next "works-from-source-only" surprise on a fresh machine. Bucket B (#145/#146/#147/#68) stays parked under `track: launch-ops`.

## Watch Out For
- **Fega verifies on the INSTALLED daily build, not source runs.** Reaching him with a change = cut an installer (respect the batch-versions rule), not "close and reopen." (memory `feedback_test_on_daily_build`.)
- **Subtitle-overlay edits load from `build/`:** the offscreen window loads `build/subtitle-overlay/index.html` (Vite copies `public/subtitle-overlay/` → `build/` on `build:renderer`). Edit `public/`, then rebuild. The **main-process** `subtitle-overlay-renderer.js` (`OVERLAY_FPS`) only re-reads on an **app restart** (require-time), so a running instance keeps the old fps until relaunch.
- **Don't commit `data/clipflow.db` or `data/game_profiles.json`** — always dirty. Stage explicitly; never `git add -A`.
- **`package.json` silent-strip gotcha** ([[project_package_json_strip]]) — if builds break for no reason, check it still has `scripts`/`build`/`devDependencies` (currently 105 lines, healthy) and `git checkout HEAD -- package.json`.
- **`ProjectsView.js` is CRLF + has `\uXXXX` emoji escapes** — big `Edit` matches fail; use a Node patch script with newline detection + ASCII-only anchors (lessons.md S90). Relevant if you do the Projects tab follow-up.

## Logs / Debugging
- **Renderer build:** `npm run build:renderer` → `build/` (Vite). Clean this session (2741 modules, ~14s, 0 errors). The ">500 kB chunk" warning is the standing desktop-app one — ignore.
- **Installer build:** `npm run build` (vite + electron-builder) → `dist/ClipFlow Setup 0.1.8-alpha.12.exe` (~121MB). "author is missed" / "@electron/rebuild not required" warnings are cosmetic.
- **Export/overlay render path (for future subtitle work):** `main.js:2231` (`render:clip` IPC) → `render.renderClip` (`render.js:120`) → `renderOverlayFrames` (`subtitle-overlay-renderer.js:86`). Frame loop at `:258`; each frame calls `window.__seekTo__(t)` → `renderSubtitle` (`overlay-renderer.js:325`→`138`). FFmpeg composite: `render.js:287` (`-framerate` = `overlayResult.fps`) + output `-r sourceFps` (`render.js:314`).
- **To verify a subtitle-export change:** render a clip on the **installed** build, open the `.mp4`, compare the pop to the editor preview. Can't be verified from source-only edits or by just launching the app (it's export-path code).
- **App log file:** `%APPDATA%\clipflow\logs\app.log`. Bash tool is Git Bash — resolve `%APPDATA%` via `node -e "console.log(process.env.APPDATA)"`.
