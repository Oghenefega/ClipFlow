# ClipFlow — Session Handoff
_Last updated: 2026-06-05 — Session 56 — Projects-tab preview subtitles: fixed the domain mismatch + gave the preview the editor's transcription fallback (#111 closed). #110 (full shared resolver) planned + approved for next session. Closed #83 (TikTok, blocked on their approval)._

---

## One-line TL;DR

The Projects-tab preview showed no subtitles for edited clips, and for some clips only after a manual open + Save. Two root causes, both fixed and verified by Fega: (1) the preview compares 0-based playback time against **source-absolute** editor-saved `sub1` — now we subtract the clip origin; (2) the preview read **only** `sub1` while the editor falls back to transcription — added `resolvePreviewSegments` so the preview derives from `clip.transcription`/`project.transcription` when `sub1` is empty. #111 closed. The deeper unification (#110) is fully planned in `tasks/todo.md` and approved — do it next session.

## Current State

Renderer builds clean (`npm run build:renderer`, ~9s, only the pre-existing #73 chunk-size warning). Commit `63d065e` pushed this session (the #111 fix + changelog). Working tree clean except the usual runtime churn (`data/clipflow.db`, `data/game_profiles.json` — intentionally NOT committed) plus this wrap's `HANDOFF.md` / `tasks/todo.md`. `build/` is not git-tracked.

## What Was Built / Done (session 56)

- **#111 fix — two parts, commit `63d065e`:**
  - **Domain offset.** `buildPreviewSegments` ([buildPreviewSubtitles.js](src/renderer/editor/utils/buildPreviewSubtitles.js)) now takes `clipStart` and subtracts it from source-absolute editor-saved `sub1` (`_format: "source-absolute"`) so segments land in the preview's 0-based time. Pipeline (no `_format`) + legacy-array formats are already 0-based → untouched. Without this, the overlay compared `currentTime` 0–30s against segments at e.g. 125–155s → `findActiveWord` matched nothing → blank.
  - **Transcription fallback.** New `resolvePreviewSegments(clip, project, template)` — when `sub1` is empty, derive from `clip.transcription` (clip-relative, no offset) or `project.transcription` (source-absolute, origin subtracted), mirroring the editor's stale-transcription guard. Removes the "open + Save before subtitles appear" round-trip. `ProjectsView.js` now calls the resolver instead of `buildPreviewSegments` directly.
- **#83 closed** (TikTok Content Posting API audit) — all actionable work done on Fega's end; submitted to TikTok, blocked only on their approval. Reopen if rejected.
- **#110 planned + approved** — full shared-resolver unification (Step 1 + 2). See `tasks/todo.md` "NEXT SESSION" block and the #110 issue comment.

## Key Decisions

- **`sub1`/`sub2` naming is a vestige of a scrapped multi-track subtitle idea, but it is NOT the cause of the bugs.** `sub2` is always `[]` and only read (inertly) in `render.js:167,197` — dead weight, clean up under #108/#40. The real disease is **representational drift**: subtitles exist in multiple shapes (saved sub1 / transcription, source-absolute / clip-relative) read by multiple consumers that interpret them differently.
- **#110 will be done Step 1 + Step 2 together in one session** (Fega's call), NOT split. Step 2 touches the editor's working `initSegments`, so the editor regression pass is a hard gate.
- **Preview converts to clip-relative at the very edge; the shared core stays source-absolute** (matches `initSegments` internal domain).

## Next Steps (prioritized)

1. **#110 Step 1 + 2** — the full plan with file:line refs is in `tasks/todo.md`. Extract `mergeWordTokens`/`validateWords` → `utils/wordRepair.js`; new `utils/resolveSubtitles.js`; route BOTH preview and editor through it. Biggest *visible* win: the preview will honor manual chunking (today it re-chunks editor-saved clips, so manual splits show different groupings in the preview vs editor).
2. **#108** — remove dead `audioSegments` subsystem (`rippleDeleteAudioSegment` now 0 callers). Good first `/goal` candidate (grep-provable, no visuals).
3. **#40** — Phase 4 hygiene (dead DBG logs, dead actions/IPCs/constants), would also sweep up `sub2`.
4. Backlog: #64 (waveform "unavailable"), #57 (re-render storm), #107/#98/#95/#87 (subtitle word/id edge cases).

## Watch Out For

- **Source vs timeline/clip coordinate domains** remain the recurring editor footgun. `editSegments` `startSec`/`endSec`/`words[].start` = SOURCE-absolute; preview `currentTime` = clip-relative (0-based); caption `captionSegments` = TIMELINE time. Editor-saved `sub1` objects carry BOTH a display-STRING `start`/`end` and numeric `startSec`/`endSec` — always read the numeric ones.
- **The preview re-chunks editor-saved subtitles** (`buildPreviewSegments` runs `segmentWords`), while the editor honors the saved chunking (`_skipNextSegmentation`). This is a remaining #110 drift surface — manual splits/merges can look different in the preview until #110 Step 1 lands.
- **`clip.transcription` is clip-relative (0-based); `project.transcription` is source-absolute.** The resolver relies on this distinction for its offset.
- **Don't commit `data/clipflow.db` / `data/game_profiles.json`** (runtime churn). Stage source files explicitly.
- **`npm start` does NOT auto-rebuild** — always `npm run build:renderer` first or you test stale code. Fully close ClipFlow before relaunching.

## Logs / Debugging

- **Build:** `npm run build:renderer` (~9s, only #73 chunk-size warning). Renderer loads from `build/` (`isDev=false`).
- **Relaunch loop:** `taskkill //F //IM electron.exe //T` before a fresh `npm start`.
- **DevTools in prod:** `CLIPFLOW_DEVTOOLS=1 npm start`. Renderer `console.log` (e.g. `[initSegments] source=…, sourceOffset=…, segments=…`) goes to DevTools, NOT the terminal. That line is the fastest way to see which of the 5 sources a clip resolved from.
- **Preview subtitle path:** `ProjectsView.js` → `resolvePreviewSegments(clip, project, {subtitle})` → `buildPreviewSegments` → `SubtitleOverlay` → `findActiveWord` (matches `time >= seg.startSec && time < seg.endSec`). If a preview is blank, log the resolved `microSegments[].startSec` and confirm they're clip-relative (< clip duration).
- **Clip data on disk:** `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\.clipflow\projects\<projectId>\project.json`. Each clip: `subtitles.sub1` (+ `_format:"source-absolute"` if editor-saved), `transcription`, `captionSegments`, `nleSegments`, `subtitleStyle`, `captionStyle`. Project-level `transcription` is the source-wide fallback.
- **Settings/templates:** `%APPDATA%\clipflow\clipflow-settings.json` — `defaultTemplateId`, `layoutTemplates[]`.
