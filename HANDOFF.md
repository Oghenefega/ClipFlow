# ClipFlow — Session Handoff
_Last updated: 2026-06-02 — Session 51 — #78/#84 subtitle persistence implemented (untested) + #66/#77 root cause found (the blocker)_

---

## One-line TL;DR

Implemented the full #78/#84 subtitle-persistence fix (6 changes, builds clean, **committed but UNTESTED**). Manual verification was blocked because the editor's left panel is unusable: it shows the **whole recording's** transcript instead of just the clip, and the **play-along highlight is dead**. Traced both to one pre-existing root cause (#66 + #77) — NOT caused by this session's work. That blocker must be fixed before #78/#84 can be verified.

## Current State

Renderer builds clean (`npm run build:renderer`, only the pre-existing #73 chunk warning). `main.js`/`render.js`/`subtitle-pollution-migration.js` syntax-checked. Everything committed to master. v0.1.5-alpha, prod profile.

## What Was Built / Done (#78 + #84 — 6 changes, IMPLEMENTED, UNTESTED)

1. **Save filter** — `useEditorStore.js:641` `_doSilentSave`: `persistedSubs` filters `editSegments` to the clip's current `nleSegments` source range before writing `sub1`. Stops the whole-recording pollution (#84).
2. **Load priority** — `useSubtitleStore.js:~380` `initSegments`: editor-saved `sub1` (`_format: "source-absolute"`) wins over `clip.transcription`. `effectiveSource` adds `"clip-subtitles-edited"`.
3. **Skip re-chunk on saved load (the #78 crux)** — `initSegments` populates `editSegments` directly from saved subs + sets `_skipNextSegmentation`; `setSegmentMode` honors it (records mode, no re-chunk) so `applyTemplate`'s open-time call doesn't regenerate manual splits/merges/timestamps. Explicit later mode change still re-chunks. New store field defaulted in initial state + `clearAll`.
4. **Retranscribe reset** — `main.js:~1246` (disk) + `EditorLayout.js:~560` (in-memory) clear `sub1`/`_format` so a redo wins over stale edits.
5. **render.js mirror** — `render.js:~144`: editor-saved `sub1` preferred over `clip.transcription` (mirrors load priority so Queue/Projects renders match editor).
6. **Migration** — `subtitle-pollution-migration.js` (new), wired into `main.js` startup after file-migration, gated by store flag `subtitlePollutionRepairComplete`. Trims polluted `sub1` to clip range; idempotent; covered by `build.files` glob `src/main/**/*`.

Design decision (Fega-approved): persist the **current** nleSegments range (covers trims + extends) so edits to extended audio survive; shrinking past an edit drops it (intended).

## THE BLOCKER — #66 + #77 (next session starts here)

**Symptom (Fega, with screenshots):** a ~1-min clip's Transcript + Edit-subtitles panels scroll through the entire ~30-min source recording; and pressing play no longer highlights the spoken word in the panel.

**Root cause (verified, trace-confirmed — NOT this session's regression):** `LeftPanelNew.js` renders the RAW source-absolute arrays:
- Transcript tab → `originalSegments` (`LeftPanelNew.js:379`)
- Edit-subtitles tab → `editSegments` (`LeftPanelNew.js:627`, highlight at `:656` / `:707`)

No clip-range filter → shows whole recording (#66). Segments are in **source-absolute** time but playback `currentTime` is **clip/timeline** time → the highlight's `find(adjustedTime >= startSec && <= endSec)` never matches (#77). The **preview overlay works** because it uses the timeline-mapped view (`getTimelineMappedSegments` → `visibleSubtitleSegments(editSegments, nleSegments)`).

**Common fix direction:** drive the left panel from the same clip-trimmed, timeline-mapped segment list the preview already uses. That collapses the whole-recording list to clip range AND puts segments in clip time so the highlight matches.

**Why it needs a plan, not an inline patch:** the Edit-subtitles panel is also the EDIT surface — `splitSegment`, `mergeSegment`, `createSegmentAtTime`, `updateWordInSegment`, `updateSegmentTimes` act on these segments by id and time. Showing timeline-time segments means edits/new-segment times must map back to source-absolute correctly. Trace those actions first.

## Next Steps (prioritized)

1. **Fix #66 + #77 (the blocker).** Trace the edit actions in `LeftPanelNew.js` + `useSubtitleStore` (split/merge/createSegmentAtTime in source vs timeline time), then plan → approval → implement. Editor is barely usable until this lands.
2. **Then verify #78/#84** with Fega's simplified 5-test checklist (edit/split/merge/drag persist; trim persists; mode persists; retranscribe resets; untouched clip normal). Remove `status: untested` once confirmed; apply the label when filing.
3. Backlog unchanged: #64 waveform MAXBUFFER (root cause known), #40 Tier 1 dead-code, #105 sliver.

## Watch Out For

- **#78/#84 committed but UNVERIFIED.** Do not close the issues or claim done until Fega walks the test. The risky change is #3 (`_skipNextSegmentation`) — if reopened clips snap splits/merges back, that flag isn't firing.
- **Verify on real data via `npm start`** (prod profile, real clips, runs the migration once). Not the dev server. Fega is sole tester — panel edits need a human; can't be self-verified.
- **#66/#77 are pre-existing** (from the earlier source-absolute refactor), confirmed not caused by this session. Don't re-litigate that.
- **`_skipNextSegmentation` lifecycle:** set true only on editor-saved load; cleared by the first `setSegmentMode` call (applyTemplate fires it on open) and on `clearAll`. Retranscribe clears `sub1` so its reload goes through the transcription path (flag false) → re-chunks correctly.

## Logs / Debugging

- **Build:** `npm run build:renderer` clean (~10s, 2734 modules, only #73 chunk warning). `node --check` passed on main.js, render.js, subtitle-pollution-migration.js.
- **Console signals to confirm which subtitle source loaded (DevTools; prod needs `CLIPFLOW_DEVTOOLS=1 npm start`, dev auto-opens):**
  - `[initSegments] source=clip-subtitles-edited` → editor-saved subs won (new #78 path).
  - `[initSegments] source=clip-transcription` → transcription won (correct for never-edited clips).
  - `[Render] Subtitle source: clip.subtitles.sub1 (editor-saved)` → render used edits.
- **Migration log** is electron-log (main log `%APPDATA%\clipflow\logs\main.log`), line `Subtitle pollution repair: N clip(s) across M project(s)`. Runs once.
- **On-disk subtitles:** `<watchFolder>\.clipflow\projects\proj_*\project.json` → `clip.subtitles.sub1`. Polluted = source-absolute spans far beyond clip `startTime`–`endTime`.
- **Pre-existing unrelated console errors (not from this work):** `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` (#64 waveform), `Unable to preventDefault inside passive event listener` (#106). Screenshot this session showed "Waveform unavailable" in the timeline — that's #64.
- **Commits this session:** `<this commit>` (#78/#84 implementation + CHANGELOG session-51 + this HANDOFF).
