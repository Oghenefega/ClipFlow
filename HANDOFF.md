# ClipFlow — Session Handoff
_Last updated: 2026-06-18 — Session 84 — **Made clip generation work on the INSTALLED app for the first time ever (it had never worked packaged — all prior success was source runs). Fixed two asar-packaging bugs end-to-end: #142 (processingDir inside read-only asar) + #143 (Python tool scripts inside asar / not bundled). Cut installers alpha.6 then alpha.7, both verified by Fega (clips now generate). Then diagnosed a third, separate bug #144 (fresh never-saved clips show EMPTY subtitles in the editor) — fix is ready below but NOT yet applied (session wrap).**_

---

## One-line TL;DR
The installed daily-driver app can finally generate clips (two asar packaging fixes, shipped as alpha.6 + alpha.7, Fega-confirmed). Remaining blocker for editing: fresh clips open with no subtitles in the editor (#144) — root-caused, 2-line fix written below, needs implementing + an alpha.8.

## Current State
On **0.1.8-alpha.7** (installed). Clip generation works end-to-end on the installed exe (probe → transcribe → energy → signals → Claude → 10 clips, confirmed `Status: SUCCESS` in the pipeline log). **#142 and #143 closed.** Schema unchanged, no migrations. Working tree: only the usual runtime churn (`data/clipflow.db`, `data/game_profiles.json`) + untracked `tasks/mocks/`. **NEW open bug #144** (editor shows no subtitles on fresh clips) — diagnosed, not fixed.

## What Was Just Built (4 commits, 2 installers cut)
1. **#142 — processingDir → userData** (`34afd0b`) — **CLOSED.** The pipeline's working/scratch dir defaulted to `__dirname/../../processing`, which in the packaged app resolves *inside* the read-only `app.asar`; `ensureProcessingDirs`' first `mkdirSync` threw before the PipelineLogger even existed → instant "Clipped 0 of 1 — 1 failed" with **no log anywhere**. Now `app.getPath("userData")/processing` (writable, respects dev/prod split). [`src/main/ai-pipeline.js`]
2. **alpha.6** (`2088b01`) — version bump + installer promoting #142 + the session-83 batch (#140/#141/#137/#138/#99).
3. **#143 — Python tool scripts ship outside the asar** (`859b66f`) — **CLOSED.** `tools/transcribe.py` + `tools/signals/*` resolved via `__dirname` (→ inside asar, unreadable by external python) AND weren't in `build.files` at all → transcription failed with "script not found", leaving empty 0-clip projects. Fix: electron-builder `extraResources: [{from:"tools",to:"tools"}]` → `resources/tools/`, and resolve from `process.resourcesPath` when `app.isPackaged` (repo-relative from source). [`package.json`, `src/main/ai/transcription/stable-ts.js` (shared `TRANSCRIBE_SCRIPT` const, both call sites), `src/main/signals.js` (`SIGNALS_SCRIPT_DIR`)]
4. **alpha.7** (`c0fb90e`) — version bump + installer promoting #143 on top of alpha.6.

## Key Decisions
- **The installed app had NEVER generated clips before this session.** Every "done" clip in Fega's library was produced by a *source* run (`npm start`/`npm run dev`), where `__dirname` is the writable repo so the asar paths never bit. This session made the packaged pipeline actually work.
- **processingDir lives under userData now** (`%APPDATA%\clipflow\processing`). Pipeline per-video logs + API cost history moved there; the old `<repo>/processing` is orphaned (harmless).
- **`energy_scorer.py` deliberately left hardcoded to `D:\whisper\energy_scorer.py`** (#68). It's present on Fega's machine so it doesn't block him; making it portable (move into `tools/`, bundle, resolve via resourcesPath) is a pre-launch task tracked in #68 — NOT done here to keep the unblock surgical.
- **asar bugs are a FAMILY (new lesson → `clipflow-electron-ipc`).** Any `__dirname`-relative main-process path that's written to, or read by an external process (python/ffmpeg), breaks inside the packed asar. Fix the whole class at once: written→userData, external-read→extraResources+resourcesPath, Electron-read→fine. (Fixing #142 alone cost a wasted reinstall before #143 surfaced.)

## Next Steps (prioritized)
1. **Implement #144 (the ready fix below) + cut alpha.8.** This blocks editing every freshly generated clip — justified to cut an installer for it despite the batch rule.
2. **Fega verifies on alpha.8:** open a freshly generated clip → subtitles appear in Edit Subtitles + the timeline track. Close #144 on confirmation.
3. **Verification pile (now reachable on the installed app via alpha.6/.7):** #140 cancel-render, #137 timeline split (generated clip), #138 ALL-CAPS, #99 style-bleed/persistence. All shipped source-only in sessions 82–83 and never verified on the daily driver. Close each (remove `status: untested`) as Fega confirms.
4. **Housekeeping:** delete the two empty AR projects (`2026-01-26 AR Day17 Pt1`, `2026-01-23 AR Day16 Pt4`) left by the failed generation attempts (Projects tab → trash icon).
5. **Code backlog** (unchanged): #105 over-trim sliver (Option A banked, quick), #135 caption corner-handles (meatier), #128 scrub frame-skip, #114, #108, #68 energy_scorer portability.

### #144 — the ready fix (DIAGNOSED, NOT APPLIED)
**Bug:** Opening a fresh, never-saved clip shows "No subtitle segments" in Edit Subtitles + an empty timeline track, while the Transcript tab and the Projects preview show the subtitles fine.
**Root cause:** `initSegments` sets `originalSegments` (populated) but `editSegments: []` for a non-pre-chunked (fresh) clip, deferring chunking to `applyTemplate → setSegmentMode`. But `setSegmentMode` (`src/renderer/editor/stores/useSubtitleStore.js:1004`) gathers its word stream from **`editSegments`** (a #89 change, to preserve live text edits on a mode switch) — which is empty on first open → it produces `[]`. The Projects preview chunks independently (`buildPreviewSubtitles.js` → `segmentWords`), so it's unaffected — that's the divergence (the shared `resolveClipSubtitles` only unifies *source selection*, not *chunking*). Latent bug: both contributing commits (#89 `0e55482`, #110 `3abec02`) predate alpha.5; only surfaced now because fresh packaged-generated clips are newly openable.
**Fix (1 file, ~2 lines):** In `setSegmentMode`, before the word-gathering loop (~line 1037):
```js
// Fresh clip open: editSegments is still [] (initSegments defers chunking here),
// so fall back to originalSegments — otherwise the first chunk yields nothing (#144).
const wordSourceSegs = editSegments.length > 0 ? editSegments : originalSegments;
```
then change `editSegments.forEach((seg) => {` (~line 1038) to `wordSourceSegs.forEach((seg) => {`. Leave `manualSegs` reading `editSegments` (empty → `[]` on fresh, so nothing double-adds). When `editSegments` is populated (live mode-switch), behavior is unchanged → #89 preserved.
**Verify:** (a) generate a clip, open it → subtitles show in Edit Subtitles + timeline; (b) on an edited clip, switch 3-word↔1-word → text edits survive (#89 intact); (c) Transcript tab + preview unchanged.

## Watch Out For
- **#144 is live until alpha.8** — every fresh clip opens with empty subtitles in the editor. Saved clips (opened, edited, saved once → `isPreChunked`) load fine. Don't let this masquerade as a data-loss bug; the data is intact (`clip.transcription`/`clip.subtitles.sub1`), only the editor's chunk step drops it.
- **`data/clipflow.db` + `data/game_profiles.json` are always dirty (runtime churn) — never commit.** Stage files explicitly; never `git add -A`/`.`. `tasks/mocks/` is untracked scratch — leave it.
- **energy_scorer.py still `D:\whisper\`-hardcoded (#68)** — works only on Fega's machine; portability is a pre-launch task. Don't assume the packaged pipeline works for any other user yet.
- **Batch rule still holds for everything EXCEPT #144.** alpha.6/.7 were justified (hard generation blocker); #144's alpha.8 is justified (hard editing blocker). After that, go back to batching ~10.
- **Bash tool runs Git Bash, not PowerShell** — `$env:APPDATA` / `$var` get mangled when passed inside a double-quoted `powershell -Command "..."` string. Use `node` or literal absolute paths for log/settings reads.

## Logs / Debugging
- **Pipeline per-video logs (the real generation errors):** `%APPDATA%\clipflow\processing\logs\<name>_<timestamp>.log`. Written **only on `finalize()`** (header line `Status: SUCCESS|FAILED`, then per-step `[START]/[DONE]/[FAIL]`). NOTE: pre-`try` failures (e.g. the old #142 mkdir throw) and the strict-mode early-returns don't finalize, so they leave NO log — a missing log is itself a clue.
- **App log:** `%APPDATA%\clipflow\logs\app.log` — app lifecycle/db/preview/waveform only; the AI pipeline does **not** write here (it uses its own `PipelineLogger`).
- **A healthy generation run reaches:** `Probe → Create Project → Extract Audio → Transcription (resources/tools/transcribe.py) → Energy (D:\whisper\energy_scorer.py) → Signal Extraction (resources/tools/signals/yamnet_events.py + pitch_spike.py) → Frame Extraction → Claude Analysis (claude-sonnet-4-6) → Clip Metadata (lazy-cut) → Clip Retranscription → Save Project`. Confirmed: 38 source segments → 10 clips, ~$0.10 API.
- **#144 trace map:** clip open → `useEditorStore.initFromContext` (`:66`) → `clearAll()` (`:120`, baseline) → `useSubtitleStore.initSegments(project, clip)` (`:224`) → async `storeGet` templates → `applyTemplate(merged)` (`templateUtils.js:179` calls `setSegmentMode`) → **`setSegmentMode` reads empty `editSegments` → empty result**. `resolveClipSubtitles` (`utils/resolveSubtitles.js`) is the shared source-selector for editor + preview (#110) but chunking is per-caller.
- **Verify a packaged asar fix without reinstalling:** read `dist/win-unpacked/resources/` directly (e.g. confirm `resources/tools/transcribe.py` exists outside `app.asar`). That's how #143 was validated pre-push.
