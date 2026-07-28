# ClipFlow — Session Handoff

_Last updated: 2026-07-28 — Session 134 — **Media assets epic (#201): asset library (Phase 1, verified by Fega on alpha.26) + sounds on clips (#202, built + machine-verified). Installer `0.3.0-alpha.27` cut — Fega installs and tests placing sounds.**_

---

## One-line TL;DR

The editor's dead upload areas are now a real asset library (import sounds/images, auto-scanned SFX folder — Fega-verified), and sounds can be placed ON clips: SFX stick to their footage moment through trims/reorders, a music bed spans the clip with volume + fades, everything plays in the preview and mixes into the rendered MP4 (spectrally verified) — pictures (#203) is the remaining phase.

## Current State

App is on **0.3.0-alpha.27** (installer in `dist/`, awaiting Fega's install + verification of #202). #201 epic: Phase 1 done + verified, Phase 2 (#202) built + machine-verified (open, untested by Fega), Phase 3 (#203 pictures) not started.

## What Was Just Built

- **Phase 1 — asset library (verified live by Fega on alpha.26):** `src/main/assets.js` (copy-import into `{libraryRoot}/.clipflow/assets/` + `assets.json` index; SFX-folder files linked in place and absorbed into the index so favorites persist), IPC `assets:list/import/delete/favorite`, Audio panel wired to real data (search, All/Favorites, click-to-preview, two-click delete), Upload drawer drop zone + button with an images list, Settings SFX folder auto-scan. `dialog:openFile` gained a `properties` passthrough (multi-select; single-select callers unchanged).
- **Phase 2 — sounds on clips (#202, alpha.27):** `audioPlacements` on useEditorStore (persisted via the revived `clip.sfx` field, restored on load, in the shared cross-store undo snapshot), Audio panel "+" places SFX at the playhead / sets the music bed, timeline **Sounds** lane replaces the dead "Audio 2" row (drag SFX to move, settings popover: volume, music fades, remove), preview `<audio>` engine synced to the rAF clock with per-frame fade volume + full unmount teardown, render mixing (asset inputs AFTER the overlay pipe → aformat → atrim/afade (music) → volume → adelay → amix normalize=0 duration=first). 8 new jest tests on the filter graph (`src/main/__tests__/renderAudioMix.test.js`).

## Key Decisions

- **SFX (and later pictures) anchor to SOURCE time** (follow their moment through trims/reorders, like subtitles); **music anchors to the timeline** (spans the clip, like captions). Fega's calls: sounds before pictures; SFX folder auto-scanned; music v1 = manual volume + fades (auto-duck parked).
- **One music bed per clip** — adding another replaces it (undoable, panel says so).
- **Volume is 0–100% (no boost)** so preview (`el.volume` caps at 1) and render (`volume=` filter) stay in exact parity. Music defaults to 40%.
- **Missing sound file fails the render loudly** with a plain-language message — never a silently different-sounding export.
- **No-placement clips build a byte-identical FFmpeg graph** (unit-asserted) — zero regression surface for ordinary renders. `renderThumbnail` (`{audio:false}`) skips the whole mix block by construction.
- Parked (listed on #201): animated GIFs/stickers, video overlays/outros, auto-duck, bundled royalty-free pack, TikTok trending audio.

## Next Steps

1. **Fega verifies alpha.27** (test list in chat: place the Fahh sound at a moment, drag it, trim before it, music + fades, render, Ctrl+Z). Then close #202 (respect the `status: untested` flow).
2. **#203 — pictures on clips** (last #201 phase): image layer in `PreviewOverlays.js` + the offscreen overlay page (`__OVERLAY_CONFIG__` in `subtitle-overlay-renderer.js:245`, rendering in `overlay-renderer.js`, and a **frame-skip signature term** — mandatory or frames freeze), reuse `DraggableOverlay` for position/size, persist via `clip.media`. Check the overlay page's CSP allows `file://` images.
3. Possible #202 follow-ups if Fega asks: multiple music beds, SFX trimming, boost >100%, drag-from-panel-to-timeline.

## Watch Out For

- **Sounds lane z-order:** the full-width music block must render BELOW SFX blocks (music-first sort + zIndex 1 vs 2 in TimelinePanelNew) — first live-drive bug of the session; don't regress it.
- **render.js input-index arithmetic:** asset inputs come AFTER the overlay pipe so the pipe keeps index n. Anything adding further inputs must extend that arithmetic (`buildNleFilterComplex` doc comment).
- **`_snapshotStyling` in useSubtitleStore now carries `audioPlacements`** — any new undoable editor state must join that snapshot or Ctrl+Z will skip it.
- **Fega's real "Fahh" sound:** my cleanup deleted `assets.json` and I rebuilt it from disk (entry id `asset_..._rebuilt`); he re-starred it. His EO clip (`clip_1784997236854_h88y`) was used for the drive — nleSegments verified byte-identical afterward, test placements stripped.
- **The ≥60s music/SFX split** applies only to untyped imports (Upload drawer drops); Audio-panel imports use the active tab's type.
- Preview SFX straddling an NLE cut keeps playing across the seam (timeline time is continuous); render does the same via adelay — intentional parity.
- Dev-profile projectsRoot points at the REAL W:\ tree — any test assets/placements written there must be cleaned (this session: done, verified).

## Logs & Debugging

- Render logs: `[Render] Audio assets: N of M placements active` shows how many placements survived timeline mapping; legacy-path renders warn `sounds skipped`.
- Spectral check for "did the sound land": `ffmpeg -i out.mp4 -af "bandpass=f=<hz>:w=80,atrim=<t1>:<t2>,volumedetect" -f null -` — compare mean_volume inside vs outside the expected window (this session: -24dB in-window vs -57.6dB outside for the 880Hz test tone; music bed steady -32.6dB; max_volume -1.6dB).
- CDP driving: session-134 scratchpad (`70c9c478…`) has `cdp.js` (one-shot evaluator), `cdp-input.js` (trusted click/drag/rclick/undo — the `buttons` bitmask is REQUIRED), `cdp-shot.js`. Four new traps recorded in memory `project_cdp_verification_gotchas` (#17–20); the reload-wedge is the nasty one — only an app relaunch fixes it.
