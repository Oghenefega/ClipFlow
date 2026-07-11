# ClipFlow — Session Handoff
_Last updated: 2026-07-10 — Session 98 — **Subtitle editing fixes (transcript sync, split-at-playhead, Add word) + queue title batch, installer 0.1.8-alpha.14 cut (awaiting Fega's reinstall).**_

---

## One-line TL;DR
Fixed the Transcript tab showing stale text after subtitle edits (`853cd19`), fixed split-at-playhead cutting at the wrong word boundary + made the menu item disable with a reason instead of silently no-opping, built right-click **"Add word"** on subtitle blocks, and gave the Queue title a visible pencil + old-title propagation into custom captions (`c54fa63`); cut installer **0.1.8-alpha.14** (`645a8bf`). Filed #162 (undo doesn't restore mode dropdown label).

## Current State
- **Installed daily driver: 0.1.8-alpha.13; alpha.14 installer is cut and waiting in `dist/`** — Fega hasn't reinstalled yet. The in-app "Install update" banner will surface it.
- All session-98 work is verified in the source-run app EXCEPT the Queue pencil/propagation (source-profile queue is empty; needs his real queued clip).
- Working tree: usual never-commit `data/` pair + untracked `tasks/mocks/` scratch.

## What Was Just Built
- **Transcript tab live-sync (`853cd19`)** — TranscriptTab now renders `getTimelineMappedSegments()` (live editSegments) instead of the frozen `originalSegments` snapshot, with a `_chunkPending` fallback for the clip-open window. Also makes transcript-side inline word edits actually work (they were silent no-ops — snapshot segment ids never match live ids after a re-chunk) and maps word indices through `srcWordIdx` (#131 pattern). [src/renderer/editor/components/LeftPanelNew.js]
- **Split-at-playhead boundary fix (`c54fa63`)** — in `splitSegment`, `findIndex(w.start >= splitSec)` returning -1 (playhead inside the LAST word) or 0 fell back to the MIDDLE of the block; now snaps to the nearest real boundary. Verified live: "This guy's just" with playhead on "just" → "This guy's" + "just". [useSubtitleStore.js ~:705]
- **Split menu item disables with a reason** — computed at menu-open in the sub-track `onContextMenu` ("needs 2+ words" / "playhead not over this subtitle") and rendered dimmed in TrackContextMenu. No more silent dead click. [TimelinePanelNew.js, timeline/TrackContextMenu.js]
- **"Add word" (new store action `addWordToSegment`)** — timeline right-click on a subtitle block appends a placeholder word (takes the tail gap after the last word, else the back half of the last word's span; existing timings untouched), then the previously-unused `editingWordKey` store field ({segId, wordIdx} one-shot) makes LeftPanelNew switch to Edit subtitles and open the inline editor with the placeholder selected. Verified live end-to-end.
- **Queue title (`c54fa63`, via Sonnet subagent)** — visible pencil button next to the detail-panel title (double-click still works), and `saveTitle` now rewrites exact old-title occurrences inside `captionOverrides` values and a custom `youtubeTitle` (split/join, no regex) in the same `projectUpdateClip` call. [QueueView.js ~:676, ~:1505]
- **Installer 0.1.8-alpha.14 (`645a8bf`)** — promotes all of session 98.

## Key Decisions
- **Transcript = live view.** Deleting a segment now removes its words from the Transcript tab (they used to linger). Flagged to Fega, accepted.
- **No file rename on queue title edit.** Fega asked whether renaming the clip on disk makes sense; recommended against auto-rename (violates "files are never auto-renamed" + scheduled publishes point at renderPath). Optional explicit "also rename file" control parked as a possible follow-up — NOT filed as an issue yet.
- **Add word = word inside the existing block**, not a new block (drag-on-empty-lane + "+" toolbar already cover new blocks). Escape during the inline edit leaves the "word" placeholder (undo removes it) — acceptable for now.
- **Caption propagation is exact-match text replacement** — only occurrences of the old title inside custom captions change; the rest of the custom wording is untouched.

## Next Steps (prioritized)
1. **Fega reinstalls alpha.14** (Install update banner or `dist\ClipFlow Setup 0.1.8-alpha.14.exe`) → Settings should read v0.1.8-alpha.14.
2. **Fega verifies on real data:** rename queued "Clip 2" via the new pencil → all platform captions follow (this is the one unverified piece). Then the session-98 editor fixes: transcript follows an Edit-subtitles word edit; split lands at the playhead; Add word grows a 1-word block.
3. **#162** — undo of a segment-mode switch restores segments but not the mode dropdown label (found during verification; small, cosmetic, in-memory only).
4. Carried from session 97: Tracker Phase 1 closeout check (first REAL publish through the Queue), #161 (Sundays product decision).

## Watch Out For
- **TranscriptTab now depends on editSegments being populated** — the `_chunkPending` fallback covers the async clip-open window (applyTemplate runs after a Promise.all in useEditorStore ~:262). If a future change clears editSegments without setting `_chunkPending`, the transcript goes empty by design (user deleted everything) — don't "fix" that by re-reading originalSegments.
- **`editingWordKey` is now live plumbing** ({segId, wordIdx} object, one-shot, consumed+cleared by EditSubtitlesTab). It was a dead string field before session 98 — don't repurpose it.
- **Split eligibility is computed at menu-OPEN** (playhead position frozen into contextMenu state). If playback is running while the menu is open, the reason string can go stale — accepted, menu use while playing is rare.
- **Queue propagation only rewrites EXACT old-title matches** — if Fega edited the title portion inside a custom caption manually before renaming, it won't match and won't update (correct-but-worth-knowing).

## Logs/Debugging
- No new error patterns this session. Verification was done via computer-use on the source-run app (`npm start`, prod profile reading `<repo>/data/`); all editor test edits were undone in-app and nothing was saved, so repo test data is unchanged (the always-dirty `data/` churn is from app launches, not edits).
- Reminder from this session's verification: the source-run prod profile's queue is EMPTY — his real queue lives in `%APPDATA%\clipflow\` under the installed app. Don't conclude a Queue feature is broken from the source profile's empty state.
