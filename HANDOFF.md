# ClipFlow — Session Handoff

_Last updated: 2026-07-28 — Session 135 — **Sounds usability pass (#202 follow-ups): waveforms on blocks, Music/SFX lanes split, trim handles, Alt+drag duplicate, right-click settings, multiple songs per clip. Installer `0.3.0-alpha.28` cut — Fega installs and edits with it for real.**_

---

## One-line TL;DR

Sounds on clips went from "technically works" to actually editable: every block draws its waveform, songs and one-shots have their own lanes, either end of a block can be trimmed (cutting head silence leaves the audible part where it is), Alt+drag duplicates, right-click opens settings, and a clip can carry more than one song with a one-click hyped→sad switch.

## Current State

App is on **0.3.0-alpha.28** (installer in `dist/`, awaiting Fega's install). #201 epic: Phase 1 verified, Phase 2 (#202) built + twice machine-verified (open, `status: untested` — Fega never verified alpha.27 before asking for these follow-ups), Phase 3 (#203 pictures) not started.

## What Was Just Built (session 135, commit 2814841)

Fega's five asks after seeing alpha.27, plus multiple songs (asked during planning):

1. **Waveforms on every sound block** — `assets:peaks` IPC → `assets.js:getPeaks` extracts peaks per file and caches them under `{assetsRoot}/peaks/<sha1(path)>.json`, invalidated on mtime/size. New `timeline/SoundBlock.js` owns the block: canvas waveform sliced to the trimmed window, module-level peaks cache keyed by file path (one fetch per file per session, survives clip switches).
2. **Music + SFX lanes** replace the single Sounds lane (`renderSoundLane()` in TimelinePanelNew). Overlapping blocks in a lane stack into two half-height rows via `assignRows`. `EditorLayout` timeline height 234 → **276** (5 lanes + ruler + toolbar + scrollbar).
3. **Trim handles both ends.** Left handle moves `sourceTime` AND `trimStart` together → the audible part doesn't move. Popover shows the window + Reset (which also walks the anchor back).
4. **Alt+drag duplicate** — `duplicateAudioPlacement`, SegmentBlock's proven pattern (window listeners, 3px threshold, Alt read at press OR live off `ev.altKey`). Popover has a Duplicate button too.
5. **Right-click = settings popover**, left-click = select (reveals handles), Delete = remove. `handleSplit` ignores a selected sound so S doesn't split a subtitle behind your back.
6. **Multiple songs per clip.** Adding a song at the playhead ends the song playing across that moment and fills the room up to the next song / clip end / file length. One undo entry. Nothing deleted — a song dropped between two others fills the gap.

## Key Decisions

- **Both kinds now share ONE shape**: anchor at a source moment + the file window `[trimStart, trimEnd]` that plays. Timeline length is derived (`trimEnd - trimStart`). This killed the music-bed special case and collapsed the split music/SFX paths in the preview and the render. New `models/audioPlacements.js` (CJS — main process requires it) is the single resolver: `normalizePlacements`, `resolvePlacements`, `placementLength`, `assignRows`.
- **Songs clamp forward, one-shots drop.** New `timeMapping.sourceToTimelineClamped`: when a song's anchor moment is trimmed away it moves to the next surviving footage instead of vanishing (a song belongs to a stretch, not an instant). SFX keep the strict drop rule.
- **No migration file.** Old clips carry no `trimStart`/`trimEnd`/`sourceTime`; all three are derived on read in `initFromContext` AND in `render.js`, so a legacy music bed still spans the clip and renders identically. Verified live with a hand-written legacy entry.
- **`asetpts=PTS-STARTPTS` after `atrim` is mandatory** in the render chain — `atrim` keeps the source timestamps, so `adelay` would stack on top and land the sound late.
- Dragging song B later does NOT stretch song A back out (rolling edits deliberately out of scope — Fega told).
- Songs may overlap if dragged onto each other (both play, mixed); the row stacking makes it visible.
- Still parked (on #201): animated GIFs/stickers, video overlays/outros, auto-duck, bundled royalty-free pack, TikTok trending audio, boost >100%, drag-from-panel-to-timeline.

## Next Steps

1. **Fega installs alpha.28 and edits a real clip with it.** Then close #202 (respect the `status: untested` flow). Watch for: does 42px less preview height bother him; do the half-height stacked rows read clearly at his usual zoom.
2. **#203 — pictures on clips** (last #201 phase): image layer in `PreviewOverlays.js` + the offscreen overlay page (`__OVERLAY_CONFIG__` in `subtitle-overlay-renderer.js:245`, rendering in `overlay-renderer.js`, and a **frame-skip signature term** — mandatory or frames freeze), reuse `DraggableOverlay` for position/size, persist via `clip.media`. Check the overlay page's CSP allows `file://` images.
3. Possible follow-ups if Fega asks: rolling edit (drag one song's edge and the neighbour follows), fade handles drawn on the block, drag-from-panel-to-timeline, boost >100%.

## Watch Out For

- **Sound blocks must `stopPropagation` on `onClick`** — the scroll container's `onClick={handleTrackBgClick}` deselects everything, and pointerup (where selection is set) fires BEFORE click. This was the one live bug this session: selection silently never stuck, so trim handles only appeared on hover and Delete did nothing. Every other lane's block already did this.
- **`extractWaveformPeaks` resamples to 1000Hz** — anything above ~500Hz draws a flat waveform. Real SFX/music always carry low-frequency content; only synthetic test tones hit this (my first 880Hz fixture read as pure silence and looked like a bug in my code).
- **`resolvePlacements` is the only place the two kinds differ.** Any new consumer must go through it, or the timeline, preview and render will disagree about where a sound sits.
- **`_snapshotStyling` in useSubtitleStore carries `audioPlacements`** — any new undoable editor state must join that snapshot or Ctrl+Z skips it.
- **render.js input-index arithmetic**: asset inputs come AFTER the overlay pipe so the pipe keeps index n. Anything adding further inputs must extend that arithmetic.
- **Dev-profile `projectsRoot` points at the REAL W:\ tree.** Test assets/placements/peaks-cache written there must be cleaned. This session: cleaned and verified (assets.json back to just Fega's Fahh with its favorite flag, peaks folder removed, both test clips' `sfx` cleared, Clip 1's render record reverted via `projectDeleteClipRender`, temp render output deleted).
- **5 pre-existing test files (`segmentWords`, `trackerCalendarModel`, `signals`, `game-profiles`, `ai-prompt`) call `process.exit` and crash jest workers.** They predate jest here — "5 failed suites, 0 failed tests" is that, not a regression. Run `npx jest src/main/__tests__ src/renderer/editor/models/__tests__` for a clean signal (125 tests).

## Logs & Debugging

- Render logs: `[Render] Audio assets: N of M placements active` — how many placements survived timeline mapping. Legacy-path renders warn `sounds skipped`.
- **Spectral check for "did the sound land"**: `ffmpeg -hide_banner -i out.mp4 -af "bandpass=f=<hz>:w=60,atrim=<t1>:<t2>,volumedetect" -f null -` then read `mean_volume`. **Do NOT pass `-v error`** — it suppresses volumedetect's own output (cost me a confusing empty result). Session 135 numbers: trimmed 400Hz tone −22.8dB in-window vs −54dB out and −60dB immediately before; songA 150Hz −32.1→−58.0dB across the switch; songB 250Hz −48.9→−32.0dB; max_volume −10.2dB.
- Synthetic fixtures for sound tests (keep tones under 500Hz): `ffmpeg -f lavfi -i "sine=f=400:d=2" -af "adelay=5000|5000,apad=whole_dur=10" -ac 2 -ar 48000 trimtest.wav` gives silence/hit/silence — exactly the case trimming exists for.
- CDP driving: session-135 scratchpad (`7d152e07…`) has `cdp.js` (one-shot evaluator), `cdp-input.js` (click/move/drag/**altdrag**/rclick/del/undo/redo — the `buttons` bitmask and `modifiers:1` for Alt are REQUIRED), `cdp-shot.js`. Launch with `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`; `taskkill //F //IM electron.exe` between runs (a reload mid-session wedges input — only a relaunch fixes it).
- Hover-revealed buttons in the Audio panel need a separate `move` before the `click`, and the row's Y shifts when the status line appears/disappears — screenshot between steps rather than trusting earlier coordinates.
