# ClipFlow — Session Handoff
_Last updated: 2026-07-15 — Session 102 — **Waveform trust bug found+fixed (7s misalignment, root-caused with real data), Auto-Reframe epic researched/planned/approved (#164) — next session BUILDS Phase A, non-destructive architecture.**_

---

## One-line TL;DR
The editor waveform never matched the subtitles because of an integer-truncation bug in peak extraction — proven with cross-correlation on Fega's real recording (7.0s off, fixed to one 40ms bucket) and shipped in `c492be8`. Then the Auto-Reframe epic (horizontal 1080p → vertical shorts) was researched via two agents, planned, filed as **#164**, and **approved: Phase A builds NEXT SESSION with the non-destructive live-layout architecture** (Fega's call — use Fable-class capacity on the hard version while it's here). No installer cut this session.

## Current State
- **Installed daily driver: 0.1.8-alpha.16.** The waveform fix (`c492be8`) is committed/pushed but NOT in any installer yet — it reaches Fega on the next cut (batch rule).
- Working tree: usual never-commit `data/` pair + the untracked `tasks/mocks/` scratch files (unchanged, deliberate).
- Wick (GM agent) briefed via his vault inbox: #164 decision + scope, waveform fix, alpha.16 status.

## What Was Just Built
- **Waveform alignment fix** (`src/main/ffmpeg.js` extractWaveformPeaks): bucket boundaries now computed proportionally per index instead of a floor()'d integer samplesPerPeak. The old math made each peak cover ~39ms but render as 40ms — error grew ~2.6% of the clip's depth into the source (Clip 1 of the EO project, 266s in, displayed audio from 7.0s earlier; displayed-vs-real correlation was -0.06, i.e. none). After fix: correlation 0.86, residual 0.04s. Verified by replicating the exact JS math in Python against the real source file.
- **Waveform cache key bumped to `.v2`** (`src/main/main.js` waveform:extractCached) so every project regenerates peaks with fixed math on next editor open (first open shows "Extracting waveform…" a few seconds).
- **Auto-Reframe epic #164**: two research agents (competitor landscape; local-tech feasibility), phased plan in `tasks/todo.md` + full findings in the issue body.

## Key Decisions
- **#164 architecture LOCKED by Fega: Option 2 — non-destructive live layout in the editor.** Crop rects are stored data; editor previews the vertical composition live; render bakes at export; NO intermediate vertical file, NO whole-source reformat at ingest. Chosen over the (recommended-as-safer) ingest option because Fable is only available a couple more days — spend it on the hard build.
- **#164 hard scope (memory `project-autoreframe-no-tracking`): NO face tracking, NO auto-zooms.** Static webcam/game crops, calibrated/auto-detected once per OBS layout. Research says tracking jitter is the category's most-hated failure — static is the differentiator.
- Phase B (MediaPipe box auto-detection) comes only after Phase A ships.
- Zoom feedback ("a bit too zoomed in" on the 1440p scaling) parked as **#165** — do not tune it ad hoc.

## Next Steps
1. **Build #164 Phase A** (fresh session, this is the whole session): suggested order in `tasks/todo.md` — (1) HTML mock of the calibration UI first (house rule), (2) layout data model + electron-store schema migration (pipeline hard rule), (3) editor preview compositing spike — two crops of one source in PreviewPanelNew, (4) render.js baking. Biggest pipeline change since the editor; treat as multi-session.
2. Next installer cut: includes the waveform fix — Fega should verify Clip 1 of "2026-02-12 EO Day2 Pt1" (the loud burst should sit under "MOVE,").
3. #165 zoom tuning when UI work next comes up. #163 (YouTube reconnect messaging) still open.

## Watch Out For
- **Editor preview compositing (Phase A step 3) is the risk center**: every `<video>` needs unmount cleanup (blink::DOMDataStore crash, memory `feedback_video_cleanup`); two `<video>` elements on one multi-GB source may double decode cost — consider one video + canvas compositing; the imperative-src teardown pattern in PreviewPanelNew:686-704 exists for a reason.
- **Old waveform caches** (`.clipflow/projects/<id>/.waveforms/*.json` without `.v2`) are orphaned, not auto-deleted — harmless, but a cleanup candidate.
- **WaveformTrack render math was verified correct** — if waveform looks off after the fix reaches the installed app, suspect the cache or extraction, not the renderer. Diagnosis method that worked: extract ground-truth envelope for the clip range via ffmpeg → cross-correlate against the app's cached peaks slice (script pattern in session 102 transcript).
- The renderer-side `src/renderer/editor/utils/waveformUtils.js` is DEAD CODE (zero importers) — don't reason from it; flagged for eventual removal, not deleted (surgical-changes rule).

## Logs/Debugging
- Waveform extraction logs under `[waveform]` tags (main process logger, videoProcessing module) — start/cache-hit/extracted/error lines with timings; ffmpeg stderr tail is captured on failure.
- No errors this session; `node --check` clean on both edited main-process files; app boot smoke-tested via `npm start` (killed after clean start — the "failed, exit 127" background-task notice was the kill, not a crash).
- Fega's prod data locations used for diagnosis: settings `%APPDATA%\clipflow\clipflow-settings.json`, projects under `W:\...\Vertical Recordings Onwards\.clipflow\projects\`.
