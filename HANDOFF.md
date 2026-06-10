# ClipFlow — Session Handoff
_Last updated: 2026-06-09 — Session 77 — **Karaoke/subtitle fragile zone cleared.** The twice-reverted highlight/segment area got a full sweep: 9 issues closed one-per-commit (#136, #89, #131, #132, #95, #87, #90, #88, #107), plus a 10th boundary bug Fega caught during verification. Two new bugs filed (#137, #138). Fega verified the whole batch in-app — "it all works beautifully, nothing failed" — and confirmed the boundary follow-up._

---

## One-line TL;DR
Subtitle/karaoke bug cluster fixed end-to-end: word-delete now syncs `words[]`/`text` (#136), segment-mode switch keeps text edits (#89), trim-filtered words carry `srcWordIdx` so highlight + click-seek stay aligned (#131), mid-playback word-click no longer freezes the highlight (#132), split slices words+text by one boundary (#95), tight-gap insert can't overlap (#87), clip-load opens at the clip start (#90), `initVideoRef` uses `set()` (#88). Then a pre-existing boundary bug — clicking a row selected the row *above* — fixed by making segment time-ownership half-open `[start,end)`. All Fega-verified.

## Current State
Healthy on `0.1.6-alpha`, schema **v4** — unchanged (no migrations). 13 commits pushed this session (11 fixes/bookkeeping + the boundary fix + its changelog note). Working tree has ONLY runtime churn (`data/clipflow.db`, `data/game_profiles.json`) — never commit those. App is running from source (`npm start`, background) with all fixes built into `build/`. **Open code backlog: 37 → 30** (9 closed; #137/#138 filed). All 9 closes carry `status: untested` EXCEPT they're now Fega-verified — see Next Steps about removing the labels.

## What Was Just Built (all editor subtitle/karaoke; commit SHAs in parens)
1. **#136** `5befa4c` — new `deleteWordInSegment` store action splices `text` AND `words[]` by the same token index (re-synthesizes timing on legacy desync, deletes the segment on the last word). `SegmentRow` empty-confirm routes through it. *(found during the trace, filed + fixed same session)*
2. **#89** `0e55482` — `setSegmentMode` re-chunks from the CURRENT `editSegments` words (text = spelling ground truth, words = timing) instead of `originalSegments` (which hold pre-edit text). Text edits survive mode switches; deleted segments stay deleted; manual segments still preserved verbatim; word selection cleared on rebuild.
3. **#131** `af2f15d` — `visibleWords()` (timeMapping.js) tags each surviving word with `srcWordIdx` (its index in the unfiltered list). `getActiveWordInSeg` returns that text-space index; `SegmentRow.handleWordClick` looks the word up by it (nearest-surviving fallback when the clicked word's audio was trimmed away).
4. **#132** `861d9fe` — word clicks record `clickTime` in `selectedWordInfo`; a companion effect in `LeftPanelNew` clears the selection once the *video* reaches that word during playback (guarded by `vid.seeking`). No-clickTime selections made during playback clear immediately.
5. **#95** `afb70f5` — `splitSegment` slices text and `words[]` by one clamped boundary index (1:1 → slice at index; legacy desync → single complementary time predicate). `splitSec` clamped inside the segment (kills negative-duration half); 1-word segments no-op; undo pushed only on a real split.
6. **#87** `16f8ae5` — `createSegmentAtTime` re-clamps after the min-duration bump and rejects the insert (returns `null`, button already handles it) when the gap can't fit 0.05s; neighbour lookup uses `>=`.
7. **#90** `6c3eb84` — `setNleSegments(segs, {snapToStart})`; the clip-load path passes it to open at timeline 0 / first segment's source start explicitly instead of reading the previous clip's stale `<video>.currentTime`. Trim/recut/clear paths unchanged.
8. **#88** `af0939f` — `initVideoRef` routes through `set()` (behavior-neutral hygiene; all consumers read the ref imperatively).
9. **#107** — closed as resolved by #131/#95 (no code): clicks capture full-text positions, split slices by that same position, so the filtered-list mismatch can't occur.
10. **Boundary follow-up** `088d1b7` — Fega found that clicking a subtitle row selected the row ABOVE (adjacent segments share a boundary `A.endSec === B.startSec`; the inclusive `<= endSec` find returned the segment ENDING there). Fixed by making segment time-ownership half-open `[startSec, endSec)` in the auto-track `find()` and `getActiveWordInSeg`. **Both 1-word and 3-word mode.**

## Key Decisions
- **One commit per issue** in the fragile zone, in dependency order (#136 before #89 because #89 re-chunks from the words #136 keeps clean). Easy bisection if any regresses.
- **#89 changes one behavior on purpose:** deleted segments now STAY deleted across a mode switch (they used to silently reappear). Treated as part of the same data-loss bug; Fega didn't object.
- **#131 verified with a direct `node` module check** against the issue's exact trim-straddle scenario — there's no test runner installed (see Logs).
- **Half-open `[start, end)` over "set selectedWordInfo on row click."** The root cause was inclusive boundary ownership, not a missing selection. Half-open fixes the bar AND the double-highlight for every path (row click, timeline seek, playback) without adding a surprising "highlight word 0 on row click" behavior.
- **#137/#138 filed, not fixed.** #137 (timeline split passes timeline time into a source-absolute lookup) and #138 (AA toggle doesn't update `words[]` casing) surfaced during the trace; both are their own focused fixes.

## Next Steps (prioritized)
1. **Remove `status: untested` from the 9 closed issues** — Fega verified the batch in-app this session ("it all works beautifully") and the boundary follow-up. Run `gh issue edit <N> --repo Oghenefega/ClipFlow --remove-label "status: untested"` for #136, #89, #131, #132, #95, #87, #90, #88, #107. (Left ON at session end only because the wrap came right after his confirmation — clear them at next session start if not done.)
2. **#137** — timeline-toolbar/right-click subtitle split passes *timeline* time into `splitSegment`'s *source-absolute* lookup → splits the active segment's midpoint instead of the playhead on generated clips. Mirror the `LeftPanelNew.js:576-581` `timelineToSource` pattern; also fix the `hasSub` track-pick check.
3. **#138** — AA (ALL CAPS) toggle updates panel `text` but not `words[]`, so preview/export keep old casing until a mode switch re-syncs. Fix in `updateSegmentText` (re-sync `words[i].word` from text when counts match — same rule #89 uses).
4. **#135** — caption box corner handles (Photoshop free-transform; touches `DraggableOverlay` in `PreviewPanelNew.js`).
5. **#99** caption styling bleeds across clips · **#68→#62** pipeline pair (needs a silent screen-recording from Fega) · **#105** over-trim sliver.

## Watch Out For
- **Segment time-ownership is now half-open `[startSec, endSec)`** in `LeftPanelNew` (auto-track `find()` + `getActiveWordInSeg`). Don't "fix" it back to `<= endSec` — that reintroduces the click-selects-row-above bug. Distilled into `clipflow-editor-patterns` → Karaoke.
- **`words[]` must always cover `text` (or be empty)** — the #116/#136/#138 family. Any op that sets text or resizes must keep them in sync; a *partial* `words[]` silently drops a word from the preview/export while the panel still shows it. #138 is the open AA-toggle variant.
- **#89's re-chunk reads `editSegments`, not `originalSegments`.** The Transcript tab still reads `originalSegments` (unchanged, sentence-level) — they're independent by design. Don't merge them.
- **`selectedWordInfo` now carries `clickTime`** (#132). The mid-playback clear effect depends on it + `vid.seeking`. If you add a new word-selection path, set `clickTime` (or leave it null to clear immediately during playback).
- **Uncommitted, NOT mine — leave alone:** `data/clipflow.db`, `data/game_profiles.json` (runtime churn). The TikTok-audit files from before this session were committed in `540160c` (a non-session-77 commit) — not my workstream.

## Logs / Debugging
- **No test runner installed.** `src/renderer/editor/models/__tests__/nleModel.test.js` exists but jest/vitest aren't in `package.json` (CRA-era leftover; `npm test` won't work). Verify model/pure-function changes with a direct `node -e "require('./src/.../module.js')..."` check instead — that's how #131's `srcWordIdx` mapping was proven.
- **Renderer changes need `npm run build:renderer` (vite) before `npm start`** — `npm start` loads from `build/`. The >500 kB chunk warning every build is benign (desktop app, no code-splitting wanted).
- **Restart the running app:** `powershell -File C:\Users\IAmAbsolute\AppData\Local\Temp\clipflow-restart.ps1` stops only ClipFlow's electron processes, then relaunch with `npm start` (background). The killed `npm start` reports "exit 127" — expected, not an error.
- **Fega's installed Start-Menu exe does NOT have these fixes** — only the source build (`build/` + `npm start`) does. A `npm run build` + reinstall is needed to promote them to his daily driver (Stage-1 manual reinstall loop).
- **Prod log:** `%APPDATA%\clipflow\logs\app.log` (electron-log).
- **Issue hygiene:** reference issues in commits as `(#N)` — NOT `Fix #N`, which auto-closes on push before verification. Close via `gh issue close --reason completed --comment …`.
