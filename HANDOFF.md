# ClipFlow — Session Handoff
_Last updated: 2026-07-15 — Session 104 — **#164 Phase A polish + user-tunable reframe style controls, SHIPPED in 0.1.9-alpha.3. Awaiting Fega's hands-on tuning pass.**_

---

## One-line TL;DR
Two batches in one session, both machine-verified end-to-end and cut as **0.1.9-alpha.3**: (1) the five Layout-editor polish items from Fega's first real-footage pass — click-to-select calibration boxes, snap-to-center/edge with guide lines (Alt bypasses), Result preview relocated into the Layout panel, background blur doubled + 50% darker, game band bottom feathered into the bg — and (2) a "Background & edge" control group (Blur / Darkness / Edge Fade-vs-Shadow / Edge size) so Fega tunes the look himself; values live on `reframe.style`, preview live, commit with Apply, carry through Save-as-default and auto-attach.

## Current State
- **Daily driver: 0.1.9-alpha.3 offered** — installer in `dist/`, in-app banner will surface it; Fega told to install. He confirmed installing 0.1.9-alpha.1 earlier; alpha.2 + alpha.3 banners pending his click.
- Commits (all pushed): `732b08b` polish batch → `bb001d0` style controls → `5812d73` version bump + installer. CHANGELOG current through alpha.3.
- **Both batches verified by machine before he saw them**: CDP-driven dev app (all assertions green, zero console exceptions), null-reframe filter args byte-identical, default-style filter args byte-identical to pre-controls output, real renders on synthetic 8x9 AND Fega's real `RL 2026-07-15.mp4`.
- Fega's verdict pending on: feather (default, matches his OBS reference) vs shadow — now HIS slider choice, not a code decision; and whether default 50/50/10 amounts feel right on his screen.
- Dev rig: `proj_polish_real` added to `%APPDATA%\clipflow-dev\spike164-watch` — clones his real prod project (source path + committed rects, READ-ONLY on prod) with clip 1 + real subtitles; currently carries a test style (blur 20 / darken 80 / fade 15). Prod untouched all session.

## What Was Just Built (session 104)
1. **Click-to-select calibration boxes** (`CalibrationBoxes`, PreviewPanelNew.js): nothing selected on open; pointer-down selects + drags in one gesture; only the selected box shows corner handles, the other dims to a 50%-alpha outline; selected renders on top; full-size backdrop (z28) deselects on left-click without breaking middle-click pan/wheel zoom. Root cause it fixes: cam bottom edge and game top edge sit 7px apart in Fega's real layout, and the old floating RESULT PiP covered the game's SE handle.
2. **Snapping + guides**: move snaps box center/edges to frame centerlines/edges; resize snaps the moving edge (incl. edge→centerline for exact half-splits); threshold 8 screen px at any zoom; Alt bypasses; 1px white guide lines (z33) flash while snapped. CDP-verified: cam snapped to EXACT source center (1280,1440 on 2560×2880).
3. **Result preview in the Layout panel**: floating PiP deleted; LayoutPanel registers a canvas via `useEditorStore.setReframePipCanvas` (callback-ref lifecycle); PreviewPanelNew's paint loop paints it through a mirror ref; repaint effect keyed on the registered element so it paints on mount; drawer closed = safe no-op.
4. **Look changes, BOTH engines (parity invariant held)**: bg blur doubled (canvas W/45; render boxblur 28 @ 270×480), 50% darken (canvas black overlay; render limited-range lutyuv y=16+(val-16)*k, chroma toward 128), game-band bottom feather over 192px (canvas destination-out gradient via offscreen scratch; render split-strip + yuva444p geq alpha ramp — commas in geq exprs escaped `\\,`). Feather skipped when bands fill the frame.
5. **Style controls (#164 session 104b)**: `reframe.style = {blur:0-100, darken:0-100, seam:"fade"|"shadow", seamSize:0-25}`; shared CJS module `src/renderer/editor/utils/reframeStyle.js` (defaults, clamping resolver, semantic→unit mappings: blur 50→boxblur 28 / canvas W/45; darkenK formatted `+(x).toFixed(4)` so 0.5 prints byte-identically) required cross-tree by render.js/projects.js/ai-pipeline.js/main.js (editor/utils/** already in build.files). Draft seeds style; `updateReframeStyle` merges patches; commit carries it; **projects.updateReframe whitelist extended** (style was silently dropped otherwise); electron-store migration backfills style onto existing `reframeLayouts` entries (idempotent, fresh-install no-op); auto-attach + Save-as-default carry style. render.js: boxblur omitted at blur=0 (radius 0 is invalid), lutyuv omitted at darken=0, `format=yuv420p` kept unconditionally (10-bit guard), NEW shadow seam branch (`color=black` + geq alpha strip overlaid below seam — infinite color source is fine, overlay ends on main EOF). UI: "Background & edge" group in the calibrating view (EffectSlider rows + Fade/Shadow chips), between rect rows and Apply/Cancel.

## Key Decisions (this session)
- **Item 5 semantics corrected by Fega**: he wanted the game footage itself to go see-through at its bottom (feather), not a shadow — shadow kept as the B-option, then both became a user setting (the A/B verdict is now his slider, permanently).
- **Slider placement**: Fega chose "inside Edit layout" (draft + Apply, one commit path) over always-visible instant-commit sliders (AskUserQuestion, 2026-07-15).
- **Style values are semantic 0-100/0-25 numbers**, not engine units — each engine maps them; parity holds by construction; defaults reproduce the polish-batch look byte-for-byte (proven).
- Version sizing: alpha tick (polish + one control-surface feature on the existing subsystem), stated in changelog per delegated policy.

## Next Steps
1. **Fega installs alpha.3** (banner or `dist\ClipFlow Setup 0.1.9-alpha.3.exe`) → real-footage pass: calibrate on a real recording, feel the selection/snapping, tune Background & edge to his taste, render, judge.
2. If his preferred look differs from 50/50/Fade/10 → consider changing `REFRAME_STYLE_DEFAULTS` so future users start at his taste (one-line change in reframeStyle.js).
3. Then (carried from session 103): **first-recording auto-offer** slice (approved), Projects-tab preview consistency for reframe projects (cosmetic), **Phase B** (MediaPipe box detection pre-filling calibration).
4. **0.2.0** when the Auto-Reframe epic completes and verifies on his real workflow.
5. Parked: #165 zoom tuning, #163 YouTube reconnect messaging, old non-v2 waveform cache cleanup, session-102 waveform regression check (Clip 1 of "2026-02-12 EO Day2 Pt1", burst under "MOVE,").

## Watch Out For
- **Preview == render parity now flows through `reframeStyle.js`** — change a mapping there, BOTH engines follow; never re-hardcode look values in paintComposite or render.js. Band-height even-rounding (≤1px divergence) still applies.
- **projects.updateReframe WHITELISTS reframe fields** — any future reframe field must be added there or it silently drops on save (bit us this session; style was the first casualty).
- **geq expressions in filter_complex**: commas inside `lum(X,Y)` must be `\\,` in the JS string; alpha plane needs `format=yuva444p` first; keep geq on small strips only (full-frame geq is slow).
- **TaskStop on a bash-wrapped `npx electron` ORPHANS electron.exe on Windows** — the zombie keeps port 9222, and the next launch silently fails to bind, so CDP connects to the STALE bundle (cost us one confusing failed verify run). Kill with `taskkill //F //IM electron.exe` (installed app runs as ClipFlow.exe, unaffected).
- **Headless render harnesses need `app.on("window-all-closed", () => {})`** — the offscreen overlay window closing otherwise quits Electron mid-encode and FFmpeg dies orphaned/never-spawned with exit 0 (looks like success; no mp4).
- Pre-#164/pre-style projects: every consumer resolves missing `reframe.style` to defaults at read time — keep it that way.
- `%APPDATA%\clipflow-dev\clipflow-settings.json` is the dev electron-store file (NOT config.json).

## Logs/Debugging
- Render: `[Render] FFmpeg args:` logs the full filter_complex — grep `boxblur=`, `lutyuv=`, `(1-Y/` to confirm style values reached FFmpeg (blur→radius via *0.56, darken→k=1-d/100, seamSize→px via *19.2 even-rounded).
- Editor compositor still logs nothing (60fps path) — diagnose via the panel Result canvas (draft) vs main canvas (committed), or `reframe.style` in project.json.
- `project:updateReframe` errors surface inline in the Layout panel (red text).
- Session-104 scratchpad `spike/` (this session's id `46523e5d…`): CDP drivers `cdp-polish.js` (selection/snap/deselect/panel assertions + shot mode) and `cdp-style.js` (slider drive via Radix keyboard: focus thumb + Home/End/arrows), `make-real-project.js` (dev clone of a real prod project), fixed render harness `render-test-real.js`, all screenshots (p0*, s0*, real-feather/shadow, polish-AB, style-mix-render), plus session-103's harnesses copied over.
- Verify what shipped in the installer with `npx asar list dist/win-unpacked/resources/app.asar | grep reframeStyle` if a packaged-app crash ever points at the cross-tree require.
