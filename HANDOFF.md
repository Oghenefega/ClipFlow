# ClipFlow — Session Handoff
_Last updated: 2026-06-05 — Session 55 — Editor reopen reliability: race-proof init + word-spacing + edited-clip data integrity. All fixes verified by Fega. Committed + pushed._

---

## One-line TL;DR

Edited clips were misbehaving on reopen — subtitles flickering on/off, saved style snapping to template default, and (after the load was fixed) words rendered with no spaces. Root causes were a **destructive async init re-firing on every autosave** (race), a **string-vs-numeric timestamp read** on the editor-saved path, and a **`join("")` text rebuild**. All three fixed in code. Separately, did a **one-time data repair** of Fega's clip library (reset 21 clips to the default template; regenerated 5 clips whose saved subtitle word-boundaries were destroyed). Fega verified spacing, positions, and caption style all correct.

## Current State

Renderer builds clean (`npm run build:renderer`, ~9s, only the pre-existing #73 chunk-size warning). Code changes committed + pushed. Working tree clean except the usual runtime churn (`data/clipflow.db`, `data/game_profiles.json` — intentionally NOT committed). `build/` is **not** git-tracked.

## What Was Built (session 55)

Three code fixes (all on the editor reopen path):
- **Race-proof init (the intermittency).** `initFromContext` ([useEditorStore.js](src/renderer/editor/stores/useEditorStore.js)) clears all stores then awaits a project load then applies template/style async — and the effect that called it was keyed on `localProjects`, which changes identity on every autosave. So autosaves re-fired the destructive init mid-edit and overlapping runs raced. Fixed two ways: (1) [EditorView.js](src/renderer/editor/EditorView.js) init effect now keyed on `editorContext` only; (2) added a module-level `_loadGen` generation guard — each run bails after every `await` (and inside the template/style Promise) if a newer run started.
- **String→numeric timestamp read.** The editor-saved branch of `initSegments` ([useSubtitleStore.js](src/renderer/editor/stores/useSubtitleStore.js):~402) read display-string `s.start`/`s.end` instead of numeric `s.startSec`/`s.endSec`; the shared `primaryRaw` map does `s.start + offset` → string concat → NaN → dropped segments. Now normalizes `sub1` to numeric `{start,end,text,words}`.
- **Word-spacing.** Final segment text was rebuilt with `repairedWords.map(w=>w.word).join("")` (~line 582) but `mergeWordTokens` outputs bare words → "isitmy". Changed to `join(" ")`. Fresh clips were re-segmented and escaped it; editor-saved clips (`_skipNextSegmentation`) kept the broken text.

One-time data repair of Fega's library (`W:\…\Vertical Recordings Onwards\.clipflow\projects\*\project.json`, via throwaway node scripts — **not** committed code):
- Reset 21 edited clips' subtitle + caption **style and position** to the default template `tpl-1773820239682` "Karaoke ClipFlow Style" (subtitle yPercent 34.4, caption yPercent 76.8).
- Cleared corrupted `sub1` on 5 clips ("You Have No Survival Instinct…", "I Can Carry 70 Pounds…", Clip 1, Clip 2, Clip 6) whose word boundaries were destroyed (lossy in `sub1`); they re-derive clean subtitles from intact `clip.transcription` on next editor open.
- Backups: `project.json.styleReset-*.bak` and `project.json.reset2-*.bak` next to each project file.

## Key Decisions

- **Going-forward style behavior is already correct** — each clip freezes its own style snapshot when edited; changing the default template later only affects new clips. No redesign needed; Fega confirmed this is what he wants (NOT a live "template = source of truth" model, which would retroactively restyle old clips).
- **Corrupted-word recovery = regenerate from transcription, not repair `sub1`.** `sub1` word boundaries were lossy; `clip.transcription` (and `project.transcription`) were intact. Clearing `sub1` lets the tested editor path re-derive correctly rather than hand-rolling segmentation in a script.
- **Data repair preserved** caption text (`captionSegments`), source transcription, and timeline cuts — only style/position changed (+ `sub1` cleared on the 5 corrupted).

## Next Steps (prioritized)

1. **#111 — Projects-tab preview shows no subtitles for the 5 cleared clips** until each is reopened + Saved (preview reads saved `sub1`; editor derives from transcription). Immediate workaround: open + Save those 5. Proper fix ties into #110.
2. **#110 — unify editor vs Projects-preview subtitle data path** (single shared "saved-clip → display-segments" function so the two can't drift). The overlay *components* are already shared; only the data-prep differs (`buildPreviewSegments` vs the editor's live pipeline). Fixing this resolves #111.
3. **Confirm subtitle position 34% reads right visually** — template stores subtitle yPercent at 34.4 (upper-middle). If Fega expected lower, adjust the template (not the clips).
4. Backlog: #108 (dead legacy `audioSegments`), #107/#95/#98/#87 (subtitle word/id edge cases), #64 (waveform "unavailable" — still showing on every clip), #57 (re-render storm), #40 (dead-code hygiene).

## Watch Out For

- **The Projects preview and the editor read subtitles from different sources** (saved `sub1` vs derived-from-transcription). This is the #110/#111 drift — any clip with empty `sub1` shows in the editor but not the preview.
- **Source vs timeline coordinate domains** remain the recurring editor footgun. Subtitle store `editSegments` `startSec`/`endSec`/`words[].start` = SOURCE-absolute; caption `captionSegments` = TIMELINE time; playback `currentTime`/`duration` = TIMELINE. **Saved `sub1` objects carry BOTH a display-STRING `start`/`end` and numeric `startSec`/`endSec` — always read the numeric ones.**
- **Don't read displayed subtitle text as ground truth on edited clips saved before this session** — word boundaries may be collapsed in `sub1`. The intact source is `clip.transcription` / `project.transcription`.
- **Data repair scripts were one-off node scripts run against the W: drive — not in the repo.** Backups (`.bak`) are next to each `project.json`. Don't commit `data/clipflow.db` / `data/game_profiles.json`.
- **`npm start` does NOT auto-rebuild** — always `npm run build:renderer` first or you'll test stale code. Fully close ClipFlow before relaunching so it loads rewritten `project.json` files and doesn't re-save stale in-memory state over them.

## Logs / Debugging

- **Build:** `npm run build:renderer` (~9s, only #73 warning). Renderer loads from `build/` (`isDev=false`).
- **Relaunch loop:** `taskkill //F //IM electron.exe //T` before a fresh `npm start`.
- **DevTools in prod:** `CLIPFLOW_DEVTOOLS=1 npm start`. NOTE: renderer `console.log` (e.g. `[initSegments] source=…`) goes to DevTools, **not** the terminal.
- **Clip data on disk:** `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\.clipflow\projects\<projectId>\project.json`. Each clip has `subtitleStyle`, `captionStyle`, `subtitles.sub1` (with `_format:"source-absolute"` if editor-saved), `captionSegments`, `transcription`, `nleSegments`.
- **Settings/templates:** `%APPDATA%\clipflow\clipflow-settings.json` — `watchFolder`, `defaultTemplateId`, `layoutTemplates[]` (each has `.subtitle` and `.caption` style objects).
