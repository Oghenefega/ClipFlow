# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## DONE this session (54) — "Delete subtitle + clip" cut-only-span + #109 refactor

**Status:** SHIPPED + verified by Fega. Commits 28d167c (fix) + 26d5c8a (#109 refactor).
- Fix: cut only the subtitle/caption span out of the live `nleSegments` timeline
  (splitAtTimeline ×2 → deleteNleSegment the isolated middle; plain non-ripple
  sub/cap delete). Was wiping the whole timeline because both handlers deleted the
  entire overlapping NLE segment.
- #109: extracted `useEditorStore.deleteSpanWithClip(track, segId)`; both menus delegate.
  Closed #109 (status: untested — post-refactor not re-clicked).
- Filed #108 (dead legacy `audioSegments` subsystem — next).

**Decision:** Cut ONLY this subtitle's span out of the live `nleSegments` timeline,
removing video + subtitle. Abandon the legacy `audioSegments` path entirely.

**Root cause of current broken button** (LeftPanelNew.js:967–994):
- Calls `rippleDeleteAudioSegment` (useEditorStore.js:367) — the ONLY caller. The live
  timeline is `nleSegments`, not `audioSegments` (legacy, never rendered).
- Overlap check (LeftPanelNew.js:977) mixes spaces: clip-relative `audioSegments`
  (start at 0) vs source-absolute `editSegments` (useSubtitleStore.js:443). On mid-source
  clips it misfires; when it hits the lone segment, rippleDeleteAudioSegment zeroes the
  whole timeline (useEditorStore.js:374–380) → "wipes the timeline" symptom.

**Fix (single file — LeftPanelNew.js ~967–994, rewrite the onClick):**
1. Map subtitle source-abs `[startSec,endSec]` → timeline via `sourceToTimeline`.
2. `splitAtTimeline(tlStart)` then `splitAtTimeline(tlEnd)` — isolate the span.
3. `deleteNleSegment(middleSegId)` — gap ripple-closes (timeline derives position; no recut).
4. `rippleDeleteSegment(seg.id)` — remove the subtitle.

**No store changes.** `rippleDeleteAudioSegment` becomes fully dead → flag for #40, don't
delete this session.

**Verify:** mid-source clip → "Delete subtitle + clip" on a middle line → that span gone,
clip shortens by ~span, neighbors ripple-close, undo restores. Test on freshly-cut clip
(editor-saved clips still hit #78 empty-panel).

---

## Active Plan — #78 + #84: subtitle persistence (one root cause)

**Status:** IMPLEMENTED — renderer builds clean, main-process syntax OK. Awaiting Fega's
manual verification (subtitle edit→save→reopen persistence can only be confirmed
interactively). Not committed yet.

### Implemented (6 changes)
- [x] **1. Save filter** — `useEditorStore.js:641` `_doSilentSave`: `persistedSubs`
  filters `editSegments` to current `nleSegments` source ranges before writing `sub1`.
- [x] **2. Load priority** — `useSubtitleStore.js:380` `initSegments`: editor-saved
  `sub1` (`_format`) wins over `clip.transcription`. `effectiveSource` updated.
- [x] **3. Skip re-chunk on saved load (the #78 crux)** — `initSegments` populates
  `editSegments` directly from saved subs + sets `_skipNextSegmentation`; `setSegmentMode`
  honors the flag so applyTemplate's open-time call doesn't algorithmically re-chunk away
  manual splits/merges/timestamps. Explicit later mode-change still re-chunks.
- [x] **4. Retranscribe reset** — `main.js:1246` (disk) + `EditorLayout.js:560`
  (in-memory) clear `sub1`/`_format` so a redo wins.
- [x] **5. render.js mirror** — editor-saved `sub1` preferred over transcription.
- [x] **6. Migration** — `subtitle-pollution-migration.js`, wired into `main.js` startup,
  gated by `subtitlePollutionRepairComplete`; filters polluted `sub1` to clip ranges.

### Manual verification still owed (Fega)
- Edit text → save → close → reopen → text persists.
- Split + merge a segment → save → reopen → splits/merges persist (this is what change #3 buys).
- Change segmentMode → save → reopen → mode persists; then explicitly toggle mode → re-chunks.
- Retranscribe → fresh transcription wins, prior edits cleared.
- Fresh never-edited pipeline clip → unchanged behavior.
- Render from Queue/Projects matches editor preview.
- Existing polluted clips (e.g. the #84 RL clip) load clip-range subs after migration runs once.

### Original root cause / design notes (for reference)

### Root cause (verified, trace-confirmed)
`editSegments` carries two different things: (a) the clip's real subtitles, and
(b) source-wide "extra" segments merged in for extend-coverage
([useSubtitleStore.js:446-465](src/renderer/editor/stores/useSubtitleStore.js:446)).
On save, **both** are dumped into `clip.subtitles.sub1` with `_format:"source-absolute"`
([useEditorStore.js:641](src/renderer/editor/stores/useEditorStore.js:641)) → `sub1`
gets the whole recording = **#84 pollution**. Because `sub1` is then untrustworthy,
both the reopen loader ([useSubtitleStore.js:380-396](src/renderer/editor/stores/useSubtitleStore.js:380))
and render ([render.js:141-188](src/main/render.js:141)) prefer raw `clip.transcription`
— which the editor never updates — so **user edits in `sub1` are silently ignored = #78.**
The `_format` marker is written **only** by editor save, so it cleanly distinguishes
"user-edited" (authoritative) from "pipeline-born" (transcription wins).

### Design decision (approved)
Persist the **current `nleSegments` range** (not the original clip range) so edits to
extended audio survive. Known/intended tradeoff: shrinking past an edited subtitle then
saving drops that edit (re-derived from raw transcription if re-extended).

### Steps
1. **Stop the pollution (#84)** — `useEditorStore.js:641` save: filter `editSegments`
   to segments overlapping the union of `nleSegments` `[sourceStart, sourceEnd]` before
   writing `sub1`. Predicate only (no remap); keep source-absolute. Extras re-derive
   live on open.
2. **Make saved edits win (#78)** — `useSubtitleStore.js:380` load priority becomes:
   editor-saved `sub1` (`_format === "source-absolute"`) → `clip.transcription` (if not
   stale) → pipeline `sub1` (no `_format`) → `project.transcription`. Fresh pipeline
   clips (no `_format`) unchanged.
3. **Retranscribe resets** — `EditorLayout.js:560`: `updatedClip` clears `subtitles`
   (`{sub1:[],sub2:[]}`, drop `_format`) before `initSegments`, and persist the clear
   via `projectUpdateClip` so disk matches and the new transcription becomes truth.
4. **render.js mirror** — `render.js:141-188`: reorder to prefer `_format` sub1 over
   `clip.transcription`, matching step 2.
5. **Migration (main.js)** — for clips with `_format:"source-absolute"` sub1 spanning
   well past their range, filter `sub1` to the clip's `nleSegments` ranges (same
   predicate as step 1) — preserves in-range edits, drops only pollution. Fallback:
   clear `sub1` if a clip has no `nleSegments`. (pipeline.md hard rule: every shape
   change gets a migration; must handle fresh installs.)

### Verification criteria
- Edit text / split / merge a subtitle → save → close → reopen → edit persists exactly.
- Extend clip → edit revealed subtitle → save → reopen → persists.
- Shrink clip → save → reopen → out-of-range subs gone, in-range intact (intended).
- Retranscribe → fresh transcription wins, prior edits cleared.
- Fresh never-edited pipeline clip → behaves as today (transcription used).
- Render from Queue/Projects matches editor preview (no empty-subtitle renders).
- Inspect `project.json`: an edited clip's `sub1` spans only its `nleSegments` range.
- Migration: existing polluted clips load clip-range subs, no whole-recording spans.
- `npm run build:renderer` clean + `npm start` manual walk of the above.

### Files
`useEditorStore.js` (save), `useSubtitleStore.js` (load), `EditorLayout.js`
(retranscribe), `render.js` (render-from-disk), `main.js` (migration).

### Session-48 context (kept for reference)
#103 closed not-reproducible; spun out #104 (done), #105 (open sliver design call).

---

## Deferred plans

### #85 Chunk B/D — title/caption clip-signal forwarding (was active session 45)
Plan to forward `energyLevel` + `confidence` into the title/caption prompt
(`useAIStore._collectClipParams` → `title-caption-prompt.js buildUserContent` →
`main.js anthropic:generate`). Chunk D (wire full `creatorProfile`) is
**deliberately deferred** — profile is detection-only by design; feeding
`archetype` into wording re-introduces the generic template-y copy session 42
removed. Full body recoverable from `git log -p tasks/todo.md`. Re-introduce when
returning to #85.

### Interactive architecture/flows visualizer
A previous session drafted a single-page HTML architecture visualizer for the
Obsidian vault (`context/architecture/`) using vis-network 9.x. Never approved or
started. Body recoverable from git history. Re-introduce when there's appetite for
a docs-quality artifact.
