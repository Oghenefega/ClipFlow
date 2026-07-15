# ClipFlow — Session Handoff
_Last updated: 2026-07-15 — Session 103 — **#164 Auto-Reframe Phase A built, verified, and SHIPPED (0.1.9-alpha.2): any-format reframe engine, live editor compositor, in-editor calibration, render baking. Awaiting Fega's real-footage pass.**_

---

## One-line TL;DR
Phase A went zero→shipped in one session: non-destructive reframe layouts (webcam+game crop rects on the project), live vertical preview (canvas compositor off the single `<video>` via requestVideoFrameCallback), render baking with subtitles at 1080×1920, and an in-editor Layout panel (drag boxes on the source + live vertical PiP). Two mid-session course corrections from Fega are now standing rules: (1) **version bumps scale with release size** (the sizing judgment is delegated — this shipped as 0.1.9, not an alpha tick), and (2) **his real canvas is 2560×2880 (8:9, taller than wide)** — all "horizontal-only" gates were removed; any format reframes, only true 9:16 skips, and the Layout panel is ALWAYS visible ("hiding features doesn't make sense").

## Current State
- **Daily driver: 0.1.9-alpha.2 offered** (he confirmed installing 0.1.9-alpha.1; alpha.2 was cut ~30min later with the any-format fixes — the in-app update banner offers it; he was told to install).
- Commits (all pushed): `11a119a` substrate (data model + compositor + render baking) → `ea71270` calibration UI + IPC + Settings → `441a4e9` mislabeled alpha.17 bump → `a137c54` re-version 0.1.9-alpha.1 + version-sizing policy → `b1bba78` any-format fixes → `545119a` alpha.2 cut. CHANGELOG current through alpha.2.
- **Dev-profile test rig** (`%APPDATA%\clipflow-dev\spike164-watch`, dev watchFolder points there; testWatchFolder → `...\test-out`): three synthetic projects — `proj_spike164_reframe` (1920×1080 horizontal + magenta cam box), `proj_spike164_8x9` (2560×2880, Fega's real format, magenta cam strip on top), `proj_spike164_916` (1080×1920 already-vertical). One saved layout in the dev library. Dev's PREVIOUS watchFolder was overwritten (unknown value; dev is disposable/re-seedable).
- Untracked `tasks/mocks/bb*.md` etc. scratch: untouched, deliberately uncommitted.

## What Was Just Built (#164 Phase A — machine-verified at every stage)
1. **Data model**: `project.reframe = null | {layoutId, camRect, gameRect}` (source px, SNAPSHOT — library edits never retroactively change projects); `sourceWidth/Height/Fps` persisted from probe; `reframeLayouts` + `reframeLayoutDefaultId` in electron-store (migration guarded); auto-attach at ingest when dims exactly match the default layout AND source isn't already 9:16; list summaries carry all new fields.
2. **Editor compositor** (`PreviewPanelNew.js`): opaque canvas over the single video paints cam band / game band / blurred cover fill; rVFC-driven + seeked/loadeddata + geometry effects; backing store capped 1440px. Inert when reframe null.
3. **Render baking** (`render.js` + `subtitle-overlay-renderer.js`): reframe branch in `buildNleFilterComplex` (split=3 → crop/scale ×2 → cover+boxblur bg → overlays → `format=yuv420p`); subtitle overlay rendered at explicit 1080×1920 and composited LAST. **Null-reframe args proven byte-identical to pre-#164** (deepStrictEqual vs `git show` copy). batchRender inherits via renderClip.
4. **Calibration** (in-editor, per Fega): `reframeDraft` in useEditorStore (begin/update/commit/cancel/remove; commit re-checks project id after await; draft stamps the dims it was seeded from); preview flips to the source's OWN aspect with free-form draggable boxes (purple cam #a78bfa / cyan game) + live vertical RESULT PiP; right-rail **Layout** tab (ALWAYS visible) with readouts, 16:9 snap chips, Apply/Cancel/Edit/Remove/Save-as-default; Settings → Files & Folders → **Recording Layout** library (star default, delete). IPC `project:updateReframe`.
5. **Any-format rules** (session 103b): fresh game box = FULL source frame at native aspect; only |w/h − 9/16| < 0.01 counts as "already vertical" (skips auto-attach, shows "layout optional" note, never hides the panel); `beginReframeDraft` dims chain: args → project probe → live `video.videoWidth/Height` (covers pre-#164 projects) → 1920×1080.

## Key Decisions (this session)
- **Version sizing delegated to Claude** (memory `feedback_version_semantics`, policy in the `clipflow-update-launcher` skill): alpha tick = small batch; minor bump + `-alpha.1` reset = substantial feature; `0.2.0`-tier = flagship epic complete. State the call in the changelog line; never ask.
- **Fega's main canvas = 2560×2880 8:9** (memory `project_fega_canvas_8x9`): never gate on "horizontal"; epics' concrete numbers are EXAMPLES unless confirmed (lesson in tasks/lessons.md).
- **Features stay visible** with explanatory states instead of hiding — Fega's explicit product stance.
- Mock feedback (earlier): free-form boxes; game default full-frame; calibration in the editor; Settings = management list; first-recording auto-offer approved but deferred.

## Next Steps
1. **Fega verifies on real footage** (0.1.9-alpha.2): Layout icon on any clip (incl. vertical ones, with the "optional" note) → drop a real 2560×2880 recording through the pipeline → calibrate (game box starts full-frame; drag cam onto his webcam strip) → Apply → Save as default → render → judge layout/quality/blur. Also the session-102 waveform regression check (Clip 1 of "2026-02-12 EO Day2 Pt1", burst under "MOVE,").
2. After his pass: **first-recording auto-offer** slice (approved), Projects-tab preview consistency for reframe projects (still letterboxes raw source — cosmetic), then **Phase B** (MediaPipe box detection pre-filling calibration; prototype gate on small-face recall).
3. **0.2.0** when the Auto-Reframe epic is complete and verified on his real workflow (my sizing call, stated in advance).
4. Parked: #165 zoom tuning, #163 YouTube reconnect messaging, old non-v2 waveform cache cleanup.

## Watch Out For
- **Preview == render parity is a standing invariant**: `paintComposite` (renderer) and the render.js reframe branch implement the same geometry independently (width-fit bands stacked from top; cover-blur fill). Change one → change both. Blur recipes differ slightly by construction (canvas blur vs boxblur at 270×480) — visually close, not identical; if Fega flags blur, tune BOTH.
- Band heights: preview uses floats, render uses even-rounded ints — ≤1px divergence is expected.
- **CDP is the way to verify editor UI on this machine** (`--remote-debugging-port=9222` + node global WebSocket; scripts in session-103 scratchpad `spike/`): OS computer-use gets blocked by Dimmer/textinputhost focus-stealing (both denied app-control access — likely auto-deny while Fega's away). Remember togglePanel: clicking the rail icon of an ALREADY-OPEN panel closes it — check drawer state before clicking in scripts.
- Pre-#164 projects have null sourceWidth/Height — every consumer must tolerate that (draft stamps dims; snap chips clamp via draft; render clamp degrades to round-only).
- The prod watch folder is literally named "Vertical Recordings Onwards" but will now receive 8:9 recordings — path semantics are Fega's business, nothing in code cares.
- The mislabeled `0.1.8-alpha.17` installer was deleted before install; version history in git shows the bump commits either side — don't be confused by `441a4e9`.

## Logs/Debugging
- Render: `[Render] FFmpeg args:` logs the full command incl. filter_complex; `[OverlayRenderer]` logs the 1080×1920 override + frame counts. First grabs on any bad render.
- Editor compositor intentionally has no logging (60fps path) — diagnose via the RESULT PiP (draft) vs main canvas (committed), or `reframe` in project.json.
- `project:updateReframe` errors surface inline in the Layout panel (red text) and as `{error}` returns.
- Session-103 scratchpad `spike/` holds: synthetic sources + projects generator, headless render harnesses (`render-test-main.js`, `render-test-8x9.js`), CDP drivers (`cdp-verify.js`, `cdp-verify2.js`), and screenshots of every verified state (cdp-01…11, v2-01…04b).
