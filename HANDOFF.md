# ClipFlow — Session Handoff
_Last updated: 2026-06-08 — Session 72 — Shipped **#57 Phase D2** (memoized `SegmentRow` stops the Edit-subtitles 60fps row storm) and **CLOSED the #57 epic**. Then a user-requested "fresh eyes" pass ran a 27-agent find→verify bug hunt: **zero bugs in the new code**, four pre-existing low-sev subtitle bugs surfaced (filed #129–#132); fixed the two safe ones (#129, #130). All Fega-confirmed. Clean checkpoint._

---

## One-line TL;DR

**#57 is done and closed.** D1 (session 71, timeline) + D2 (this session, subtitle list) isolated both per-frame re-render storms into tiny memoized children. The Edit-subtitles list now re-renders only the one playing row per frame instead of all ~200. Three commits pushed (`985fa12` D2, `507347a` #129+#130 fixes; D1 was `c74c30e` last session). Editor feels smooth — Fega-confirmed.

## Current State

Healthy on `0.1.6-alpha`, schema v4. App left **running from source** (`npm start`, background) on the latest build. Working tree clean except the usual runtime churn (`data/clipflow.db`, `data/game_profiles.json`) — **DO NOT commit those**. Three GitHub issues closed this session (#57, #129, #130); two filed-and-deferred (#131, #132).

## What Was Just Built

1. **#57 Phase D2 — `SegmentRow` memo extraction (`985fa12`).**
   - **New `src/renderer/editor/components/leftpanel/SegmentRow.js`** — `const SegmentRow = React.memo(forwardRef(...))`. The whole subtitle-row JSX + `renderWords` + `TimecodePopover` + the ALL-CAPS/delete handlers were relocated **verbatim** from `EditSubtitlesTab`. Highlight DECISION logic is unchanged; it now reads `isActive` / `activeWordInSeg` / `selectedWordIdx` / `anySelected` / `editing` / `setEditingWord` from props. Store actions are called via `getState()` inside event handlers (event-time, never render path), so almost nothing is threaded as callback props → prop set stays small + referentially stable → memo bails on inactive rows.
   - **New `src/renderer/editor/components/leftpanel/InlineWordEditor.js`** — moved out of `LeftPanelNew` verbatim; shared by `TranscriptTab` (unchanged) + `SegmentRow`. Extracted to avoid a circular import.
   - **`LeftPanelNew.js` `EditSubtitlesTab`** — the `editSegments.map` body now computes per-row props (`activeWordInSeg = getActiveWordInSeg(seg)`, `selectedWordIdx`, `anySelected`, `editing`) and renders `<SegmentRow ref={isActive ? activeSegRef : undefined} ... />`. Parent still owns the `currentTime` sub, `getActiveWordInSeg`, the auto-track effect (writes `activeSegId`), the auto-scroll effect, search, and the toolbar. Dropped orphaned imports (`Button`, `Slider`, `Trash2`, `Film`, `sourceToTimeline`, `fmtTime`, `parseTime`) and the `deleteSegment`/`updateWordInSegment` selectors.
   - Net per-frame cost: ~200 full row reconciles → 1 (the playing row). `PreviewPanelNew` remains the sole writer of store `currentTime`.
2. **#129 fixed (`507347a`)** — ALL-CAPS (AA) toggle gated on `/[a-z]/i.test(seg.text)` so digit/punctuation/emoji-only captions don't falsely read as all-caps (no "on" state, no silent no-op). `SegmentRow.js`. Pre-existing.
3. **#130 fixed (`507347a`)** — `warning` ("Long segment — consider splitting") recomputed from the new duration in `updateSegmentTimes`, `splitSegment`, and `mergeSegment` (all three spread `...seg` and recomputed `dur` but not `warning`). `useSubtitleStore.js`. Pre-existing.
4. **Filed #131, #132** — the two pre-existing highlight bugs that touch the fragile (Phase B/C revert class) logic; deferred to focused sessions (details in the issues + `tasks/todo.md` Deferred plans).

## Key Decisions

- **Component extraction + memoization, NOT store-derivation.** Same approach as D1. The fix isolates per-frame work into a memoized child; the heavy parent stops doing 200× row reconciles. Highlight logic was relocated byte-for-byte — D2 cannot regress highlighting by construction (verified).
- **Prop remap preserves the exact original rules:** `selectedWordInfo` → `selectedWordIdx` (this seg's word or −1) + `anySelected` (`!!selectedWordInfo`, the GLOBAL "any selection suppresses playback highlight everywhere" rule); `editingWord` → `editing` (this row's slice, stable obj ref); `activeWordInSeg` computed in the parent for **every** seg (not gated on `isActive`) so behavior matches the original exactly. `-1` sentinel (not 0/undefined) avoids falsy-0 confusion.
- **`ref` only on the active row** (`ref={isActive ? activeSegRef : undefined}`) through `memo(forwardRef(...))`; on an active-seg A→B change both rows re-render (isActive changed → memo can't bail), React detaches A's ref then attaches B's, so `activeSegRef.current` = B before the `[activeSegId]` auto-scroll effect runs. No stale-ref window.
- **#57 closed; D3 not done.** D3 (push active-word derivation into each row via a fine-grained `currentTime` selector so the parent drops its `currentTime` sub) was always *conditional*. The editor feels smooth after D2, so it's unnecessary. The only residual per-frame parent cost is `getActiveWordInSeg` over all rows — a light numeric loop, no DOM. If a future profile shows the parent map as the hotspot, D3 is the lever.
- **Pre-existing fixes shipped separately from D2** (own commit, own issues) to keep the D2 commit a clean, reviewed unit and avoid auto-closing issues before verification.

## Next Steps (prioritized)

1. **No active plan.** Run the start-session ritual and pick from open issues.
2. **#131 / #132** (the two deferred highlight bugs) are good focused-session candidates — both are low-sev but touch the twice-reverted highlight logic, so each needs its own commit + full highlight verification on a GENERATED clip (split, delete, ALL CAPS, word-edit, both tabs).
3. Backlog unchanged: subtitle family (#95/#107/#87/#101/#89/#84/#114/#121), #112/#62 (EPIPE/silent audio), #90/#93/#105/#106/#32/#92/#88 (editor/timeline), #108/#40 (dead-code), #124 (logs→app.log), #127/#86 (icons), #128 (scrub frame-skip). Commercial-launch: #20–#23, #50–#56, #63, #54, #70, #73/#74, #85, #82, #68.

## Watch Out For

- **#131/#132 are in the fragile highlight area** (the part reverted twice as Phases B/C). Do NOT move highlight *logic* into the store. #131 wants `srcWordIdx` plumbed through `visibleWords`/`getActiveWordInSeg`/`handleWordClick`; #132 wants the play-clear effect to also clear selection once `adjustedTime` passes the selected word. Verify on a GENERATED clip with subtitles, never a source preview.
- **Source-preview (Play-in-editor) has NO transcript** (`transcription:null` by design) — cannot test subtitle highlighting/editing. Use a generated clip from Projects.
- **New per-frame timeline/left-panel subscribers** must go in their own small component (like `TimelinePlayhead`/`SegmentRow`) — never re-add a `currentTime` selector to `TimelinePanelNew` or `EditSubtitlesTab`'s render of all rows, or you reintroduce the storm.
- **`SegmentRow` memo correctness depends on `seg` identity being stable per-frame** — it is, because `editSegments` is `useMemo(() => getTimelineMappedSegments(), [rawEditSegments, nleSegments])` (NOT keyed on `currentTime`). If anyone adds `currentTime` to that memo's deps, the memo bail breaks and the storm returns.
- **No single-instance lock in `main.js`** — kill any open ClipFlow Electron before `npm run build`/relaunch: `powershell.exe -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Where-Object Path -Like '*Desktop\ClipFlow*' | Stop-Process -Force"`.
- **Pre-existing latent edge case (NOT fixed):** `renderWords` (`split(/(\s+)/)`, counts non-space tokens) and `handleEditConfirm` word-delete (`split(/\s+/).filter(Boolean)`) misalign their word indices if `seg.text` has LEADING/TRAILING whitespace — could delete the wrong word. The transcript pipeline trims text, so it doesn't occur in practice; left as-is (pre-D2, byte-identical).
- **`data/clipflow.db` / `data/game_profiles.json`** = runtime churn, never commit. Stage source/docs explicitly.

## Logs / Debugging

- **Build/run this session:** `npm run build:renderer` (Vite, ~9–10s, clean — the >500 kB chunk warning is pre-existing/expected, ignore). App launched via `npm start` (loads `build/`, background). Boot was clean each time: `App started … electron 40.9.1`, `Database initialized … (schema v4)`, `File migration already complete`, then Recordings preview-frame generation. No errors/exceptions in launch output.
- **A background `npm start` that shows `exit code 127`** in a task notification is just an instance I force-killed (the Stop-Process), not a code failure — ignore it; check the NEW instance's output file for the boot lines.
- **The Bash tool is POSIX, not PowerShell** — `Select-Object`/`$null` fail there; use `tail`/`head`/`grep`, or shell out via `powershell.exe -NoProfile -Command "…"` for Windows-specific ops (e.g. killing electron, `Start-Sleep`). Foreground `sleep` is blocked.
- **Adversarial review pattern (worked very well, reusable for fragile changes):** a `Workflow` find→verify pipeline. This session: 7 bug-hunt lenses (editing-lifecycle / dropped-updates / memo-ref / highlight-truth-table / carried-over-bugs / crashes-edgecases / devils-advocate), each finding then independently re-verified by a skeptic that defaults to "not a bug." 27 agents total; cleanly separated D2-introduced (zero) from pre-existing (4). Earlier in the session a lighter 4-lens review also came back clean. Scripts persisted under the session's `workflows/scripts/` dir; results land in `tasks/<taskid>.output` (parse with `node -e` since the result can be huge/truncated in the notification).
- **A verification subagent left a stray junk file** (`C:UsersIAmAbsolute…_pre_d2_LeftPanelNew.js`, a `git show HEAD~1` redirect with a mangled name) in the repo root — removed this session. If agents run `git show … > <abs windows path>`, the `C:` mangles into a U+F03A filename; clean with `find . -maxdepth 1 -name "*_pre_d2_*" -delete`.
- **Prod log:** `%APPDATA%\clipflow\logs\app.log` (electron-log; `[ts] [level] (scope) msg`). Raw `console.log` only reaches a terminal (#124).
- **Key files (#57 area):** Left-panel rows = `src/renderer/editor/components/leftpanel/SegmentRow.js` (new) + `InlineWordEditor.js` (new) + `LeftPanelNew.js` (`EditSubtitlesTab` ~:449, map ~:636, `getActiveWordInSeg` ~:535, auto-track effect ~:514, auto-scroll ~:526; `TranscriptTab` ~:381 unchanged). Timeline = `timeline/TimelinePlayhead.js` + `TimelinePanelNew.js`. 60fps driver = `PreviewPanelNew.js` rAF loop (`setCurrentTime`). Subtitle store = `stores/useSubtitleStore.js` (`updateSegmentTimes` ~:527, `splitSegment` ~:705, `mergeSegment` ~:715, `getTimelineMappedSegments`/`_mapSegmentsToTimeline` ~:49). Trim/word filtering = `models/timeMapping.js` (`visibleWords` ~:155 — relevant to deferred #131).
- **30-min sources for testing:** the Recordings list has several ~1804s sources (e.g. `2026-01-07 12-11-45.mp4`) — open via Play-in-editor to exercise the editor at scale (no transcript, so not for highlighting tests).
