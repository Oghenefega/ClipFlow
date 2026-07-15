# ClipFlow — Session Handoff
_Last updated: 2026-07-15 — Session 103 — **#164 Auto-Reframe Phase A BUILT + VERIFIED end to end: data model, live editor compositor, render baking, in-editor calibration UI. Not yet in an installer.**_

---

## One-line TL;DR
Phase A of the Auto-Reframe epic (#164) went from zero to working in one session: a project can carry a non-destructive reframe layout (webcam+game crop rects), the editor previews the vertical composition live (canvas compositor off the single `<video>` via requestVideoFrameCallback), render bakes the identical geometry with subtitles at 1080×1920, and calibration is an in-editor Layout panel (drag boxes on the source + live vertical PiP) per Fega's feedback. Every stage verified in the dev profile — including a real rendered file with karaoke subs burned in — and the non-reframe path is proven byte-identical (zero regression risk). Awaiting Fega's hands-on pass + next installer cut.

## Current State
- **Installed daily driver: 0.1.8-alpha.16.** NOT yet carrying: waveform fix (session 102, `c492be8`) or any of #164. Both ride the next installer cut.
- Commits this session: `11a119a` (substrate: data model + compositor + render baking) and the session-wrap commit (calibration UI + IPC + Settings + changelog/handoff). All pushed.
- **Dev-profile test rig** (for future #164 work): synthetic project `proj_spike164_reframe` under `%APPDATA%\clipflow-dev\spike164-watch` (dev profile's watchFolder points there; testWatchFolder → `...\spike164-watch\test-out`). Source = 30s synthetic 1920×1080@60 with a magenta "webcam" box at (28,782,470×270). One saved layout in the dev library. NOTE: dev's previous watchFolder value was overwritten (unknown; dev is disposable/re-seedable).
- Untracked scratch in `tasks/mocks/` (bb*.md etc.) untouched, still deliberately uncommitted. The #164 mock `reframe-calibration.html` IS committed.

## What Was Just Built (#164 Phase A, all verified)
1. **Data model**: `project.reframe = null | {layoutId, camRect, gameRect}` (source px, snapshot — editing a library layout never retroactively changes projects); `project.sourceWidth/Height/Fps` persisted from probe; app-level `reframeLayouts` + `reframeLayoutDefaultId` in electron-store (migration guarded); auto-attach of dimension-matched default layout at ingest (`ai-pipeline.js` Stage 1); summaries carry all new fields.
2. **Editor live compositor** (`PreviewPanelNew.js`): when `project.reframe` set, an opaque canvas over the (single) video paints cam band top / game band below / blurred game fill (downscale-blur-upscale), driven by rVFC + seeked/loadeddata + geometry effects. Overlays (subs/caption) unchanged on top. Null reframe = everything inert.
3. **Render baking** (`render.js`): `buildNleFilterComplex` gains a reframe branch — split=3, crop/scale ×2, cover+boxblur bg, two overlays, `format=yuv420p`, subtitle overlay composited LAST at explicit 1080×1920 (`subtitle-overlay-renderer.js` targetWidth/Height override). **Null-reframe args byte-identical to pre-change (deepStrictEqual proof against `git show HEAD` version).** batchRender inherits via renderClip.
4. **Calibration UI** (Fega's design calls: free-form boxes; fresh game box = FULL frame; lives in the editor): `useEditorStore.reframeDraft` + begin/update/commit/cancel/remove actions (commit re-checks project identity after await); preview flips to 16:9 source view with draggable purple/cyan boxes + live vertical "RESULT" PiP; right-rail **Layout** tab (horizontal sources only) with rect readouts, 16:9 snap chips, Apply/Cancel/Edit/Remove/"Save as default layout"; Settings → Files & Folders → **Recording Layout** library list (star = default, delete). IPC `project:updateReframe` (validated, preload-bridged).

## Verification methods that worked (reuse these)
- **Headless render through the REAL renderClip**: tiny electron main script (`scratchpad/spike/render-test-main.js` pattern) — no UI needed; output probed 1080×1920@60 yuv420p, frame PNG shows cam/game/blur + karaoke subs with active-word highlight.
- **CDP driving beats OS computer-use here**: `--remote-debugging-port=9222` + node WebSocket script (`cdp-verify.js` pattern) — DOM clicks, real Input events for drags, Page.captureScreenshot — immune to focus-stealing (textinputhost/Dimmer denied access ~5:30AM; assume auto-deny when Fega's away). Full loop verified: state transitions, drag→readout+PiP update, Apply persistence, Save-as-default library write, Settings list, Remove → horizontal, fresh defaults (game = 1920×1080@0,0), zero console exceptions.
- App boots clean on prod profile too (migration wrote empty defaults; data-layer agent verified against real prod settings).

## Key Decisions
- **Fega (mock feedback, this session)**: free-form dragging (no forced aspect); default game box covers the FULL frame (users trim sides themselves — that's also how the cam corner leaves the game band); calibration IN THE EDITOR with real-time preview; per-project layout editing required; Settings keeps the management list; first-recording auto-offer approved but DEFERRED to a next slice.
- Cam box default guess (fresh setup): bottom-left ~26%×28% at (2%,68%) — Phase B detection will replace the guess.
- Layout tab hidden for pre-#164 projects (sourceWidth null) — accepted Phase A constraint.
- "Save as default layout" does NOT backfill layoutId onto the project (provenance links only on auto-attach) — accepted.
- Subagent delegation pattern (per `feedback_fable_delegation`): 4 Sonnet implementation agents (data layer, render baking, panel+persistence) + 3 read-only research maps early; orchestrator kept the risk-center compositor + calibration view + all reviews.

## Next Steps
1. **Fega's hands-on pass** (needs next installer or `npm run dev`): calibrate on a REAL recording, render, publish-quality check. The synthetic rig can't judge visual quality of the blur/band proportions — his eyes can. Then decide Phase A remainder: first-recording auto-offer flow + any polish (#165 zoom feel is separate).
2. **Next installer cut** batches: session 102 waveform fix + all of #164 Phase A (batch rule — no per-fix installers).
3. **Phase B (after A ships)**: MediaPipe box auto-detection pre-filling the calibration UI (prototype gate: small-face recall on real footage).
4. Known small follow-ups: Projects-tab clip preview still plays the raw horizontal source for reframe projects (cosmetic inconsistency — preview letterboxes, editor/render are vertical); auto-offer calibration on first no-layout horizontal recording; old `.waveforms` non-v2 cache cleanup (from 102).

## Watch Out For
- **Preview == render parity is now a standing invariant**: `paintComposite` (PreviewPanelNew) and the render.js reframe branch implement the SAME geometry independently (width-fit bands stacked from top, cover-blur fill). Any change to one MUST change the other. Blur recipes differ slightly by construction (canvas blur px vs ffmpeg boxblur at 270×480) — visually close, not bit-identical; if Fega flags the blur, tune BOTH.
- Band heights: renderer uses exact floats; render uses even-rounded ints (yuv420p) — ≤1px band difference is expected, not a bug.
- The compositor canvas caps its backing store at 1440px wide — don't "fix" apparent softness at extreme zoom by removing the cap without measuring paint cost.
- `beginReframeDraft` falls back to project.sourceWidth/Height (1920×1080 final fallback) — projects probed before #164 have nulls; the Layout tab is hidden for them by design.
- Dimmer/textinputhost focus-stealing makes OS-level computer-use flaky on this machine in early-AM hours — use the CDP pattern for editor UI verification.
- Sentry userData ordering rule + cross-tree `build.files` rule unchanged (see project CLAUDE.md) — #164 added no new cross-tree imports (render.js changes are main-process local).

## Logs/Debugging
- Render: `[Render] FFmpeg args:` line logs the FULL command incl. filter_complex (main process console) — first thing to grab on a bad render. Overlay: `[OverlayRenderer]` lines log resolution override ("Using target resolution override: 1080 x 1920"), frame counts, first-frame size.
- Editor compositor has NO logging by design (60fps path) — diagnose visually via the PiP (draft) vs main canvas (committed), or `project.reframe` in project.json.
- CDP verification scripts + all stage screenshots (cdp-01…11) live in the session scratchpad `spike/` folder; screenshots show every verified state.
- `project:updateReframe` validation errors surface inline in the Layout panel (red text) and as `{error}` returns — not thrown.
