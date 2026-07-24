# ClipFlow — Session Handoff

_Last updated: 2026-07-24 — Session 124 — **Render speed overhaul (overlay frame-skip + FFmpeg streaming, 3-5x faster); four pre-alpha.8 upgrades (viewer screenshot → Shorts thumbnail, Recordings auto-refresh + NEW chips, Scheduled/Published visibility + honest DONE, Queue click-outside save); alpha.8 shipped with an editor-mount crash, hotfixed and re-cut as alpha.9 (installed, Fega-confirmed).**_

---

## One-line TL;DR

Killed the remaining ~60s of render time (subtitle overlay now skips provably-identical frames and streams PNGs straight into FFmpeg's stdin — a 15s clip renders in ~16s total, was ~75s), built Fega's four asks (camera button that saves a WYSIWYG thumbnail PNG through the real render pipeline; Recordings tab reloads itself after renames with glowing NEW chips; Projects tab shows Scheduled/Published badges + "To schedule" filter and DONE now means all-scheduled; Queue descriptions save on click-outside) — then alpha.8 crashed every editor open (`onScreenshot` defined in Topbar, referenced in EditorLayout — same file, different component; build/boot checks are blind to editor mount). Fixed by making the screenshot self-contained in PreviewPanelNew with the payload builder extracted to `renderPayload.js`, verified by CDP-driving the real app (editor opens, camera saves a real PNG), re-cut as **0.3.0-alpha.9 — installed, editor confirmed working.**

## Current State

- **Installed daily driver: 0.3.0-alpha.9.** Fega confirmed the editor opens fine. Everything from the alpha.8 batch is in it.
- Master is clean and pushed through `8b366ac` (+ session-end commit). No uncommitted app code.
- #180 (render speed) closed with `status: untested` — Fega hasn't explicitly confirmed the speed on his install yet.
- Queued next build: **Facebook Reels publishing** (Wick's spec, Fega-approved: `tasks/specs/facebook-reels-publishing.md`, summary in tasks/todo.md) — swap `/{page-id}/videos` for the three-phase Reels flow; out-of-range durations fall back to the legacy path.

## What Was Just Built

- **Render speed (commit `6a16202`):** overlay page computes a visual-state signature per frame (`__renderFrame__` in `public/subtitle-overlay/overlay-renderer.js`); unchanged frames re-send the cached PNG (85-95% skipped on real clips). `subtitle-overlay-renderer.js` rewritten to a session API (`createOverlaySession` → `captureFrames`/`captureFrameAt`/`destroy`); `render.js` spawns FFmpeg first and pipes PNGs via image2pipe stdin, encode runs concurrently; unified monotonic 0-99% progress. Verified on real dev clips: 15s/451-frame clip → 27 captured, 16.0s total; 26s animateOn clip → 76 captured, 26.0s.
- **Viewer screenshot (commits `13668e6` + `8b366ac`):** camera button in the preview's top-left controls → `thumbnail:capture` IPC → `renderThumbnail` in render.js (single pre-seeked input through `buildNleFilterComplex` with new `{audio:false}` opt + one overlay frame via `captureFrameAt`) → `<title>_thumbnail.png` in the output folder, toast + Show in folder. Payload builder shared with doRender lives in `src/renderer/editor/utils/renderPayload.js`.
- **Recordings auto-refresh:** RenameView calls `onFilesRenamed` after a rename batch → App bumps `recordingsRefreshKey` → RecordingsView (UploadView.js) re-runs `loadAndReconcile`; rows unseen in the previous load get a NEW chip until the tab is left (session-only state).
- **Projects scheduling visibility:** `makePublishState(trackerData)` in ProjectsView (tracker entry + `clip.scheduledAt` = Scheduled; entry without = Published); Scheduled/Published badges on ClipRow, purple mini-bars, "To schedule" filter chip, three-stage card status, `getProjectStatus(p, pub)` gained the "schedule" state — DONE now requires every clip rejected or scheduled/published. Zero new persisted state.
- **Queue click-outside save:** description/caption textarea saves on blur with a green "Saved" flash by the label; Save button removed; Cancel via `onMouseDown` + `preventDefault` (runs before blur), Escape unchanged.
- **Installers:** alpha.8 cut (`ca4a379`), then hotfix + alpha.9 (`8b366ac`).

## Key Decisions

- **Frame-skip is signature-based, not pixel-diff** — the overlay picture is a pure function of (segment idx, word idx, progressive-fill %, pop growT, active captions); equality is exact, so skipping never loses quality. If a new time-varying input joins renderSubtitle/renderCaption it MUST join the signature (comment at the top of the signature block).
- **PNG via image2pipe, not raw BGRA** — keeps toPNG's premultiply handling (byte-identical quality to the old file-based path) while eliminating disk I/O; duplicates cost one small buffer re-send.
- **Screenshot = one-frame render through the real pipeline** (Fega's pick over a clean instant frame) — WYSIWYG including reframe + unsaved edits; ~1-2s.
- **DONE = all scheduled** (Fega's pick) — publishing fires automatically after scheduling, so scheduled counts as finished; Published still gets its own badge.
- **Scheduling state derived, never stored** — all from trackerData + clip.scheduledAt, mirroring App.js's queue-badge exclusion logic; can't drift.

## Next Steps

1. **Facebook Reels publishing** (`tasks/specs/facebook-reels-publishing.md`) — approved, scoped, ready to build.
2. Fega's remaining alpha.9 test pass: render speed feel (#180 untested), camera button on a real clip, NEW chips after a rename session, Scheduled/Published badges vs his real queue, Queue blur-save feel, plus the still-unexercised alpha.6/alpha.7 leftovers (right-click merge/split, auto-caps).
3. #178 product guard (ALAC/undecodable-audio ingest warning) still open.

## Watch Out For

- **The overlay frame-skip signature must track renderSubtitle/renderCaption** — any new animation/time-varying styling added to the overlay page needs a matching signature term or skipped frames will freeze it (overlay-renderer.js, comment above `subtitleSignature`).
- **`buildNleFilterComplex` gained `opts.audio`** — `{audio:false}` is single-segment-only (thumbnail path). The render path still always maps audio.
- **EditorLayout.js holds FIVE components** (ClipNavigator, Topbar, MiniPlayerBar, EditorLayout + helpers) — the alpha.8 crash came from inserting a handler in Topbar and referencing it in EditorLayout. Check the enclosing function before inserting; rule now in clipflow-code-review.
- **Editor-touching changes need a CDP clip-open drive** — build + boot smoke CANNOT catch editor-mount crashes (the editor is the only conditionally-mounted view). Script pattern: launch `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`, then click `.pl-open` → "Open in Editor", assert no "Editor Crash" text (session 124 scratchpad `cdp-editor-check.js` / `cdp-camera-check.js`).
- **Queue Cancel button relies on mousedown-before-blur** — converting it to onClick would make blur save first and Cancel a no-op.
- **Dev profile now has `outputFolder` set** to `C:/Users/IAmAbsolute/AppData/Local/Temp/claude/clipflow-thumb-test` (set during CDP verification) — harmless, but dev-profile renders/thumbnails land there until changed.

## Logs / Debugging

- **Editor crash signature (fixed):** `ReferenceError: onScreenshot is not defined` in the Editor Crash boundary — if anything similar reappears, it's a cross-component scope error; check which of EditorLayout.js's five components owns the identifier.
- **Render pipeline logging:** `[OverlayRenderer]` lines now report `N captured, M skipped of T` — a healthy clip skips 85-95%; captured≈total means the signature is churning (check for a new time-varying style input). `[Render] Overlay frames:` mirrors it from render.js.
- **Thumbnail path logging:** `[Thumbnail] FFmpeg args:` prints the one-frame graph; failures surface in the in-app toast verbatim ("Output folder not configured. Go to Settings." was the only failure seen, on the unconfigured dev profile).
- **CDP harnesses:** `render-harness.js` (full render + `--thumb` mode), `cdp-editor-check.js`, `cdp-camera-check.js` in this session's scratchpad — patterns worth recreating; traps in memory `project_cdp_verification_gotchas`.
