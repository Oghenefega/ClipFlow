# ClipFlow — Session Handoff
_Last updated: 2026-03-24 (Timeline Subtitle Physics + Selection Highlight)_

## Current State
App builds and runs clean — timeline subtitle drag/extend/resize/click all working correctly with no overlap bugs.

## What Was Just Built
- **Issue #2 fixed & closed** — Subtitle drag/extend overlap completely rewritten with originals-based snapshot pattern, 4-case overlap logic (left eat, right eat, middle split with phantoms, complete cover → delete), `getState()` for fresh store access in event handlers
- **Issue #3 fixed & closed** — Timeline header click targeting: clicking a subtitle block no longer seeks the playhead, only ruler row and empty space seek
- **Segment selection → left panel highlight** — Clicking a subtitle on the timeline now highlights that segment's first word in the Edit Subtitles panel, taking precedence over playhead tracking until playback resumes
- **Caption track** — Same push/consume/restore logic applied to caption segments
- **SegmentBlock improvements** — Near-zero segments hidden (`segDur < 0.01` → `return null`), `onResizeEnd` callback, `segment-block` CSS class for click detection
- **Issue #12 logged** — Undo captures intermediate drag positions (debounce bug), not yet fixed
- **Lessons written** — Object.entries string coercion, React hooks ordering, getState() pattern, root-cause-first debugging

## Key Decisions
- **Originals-based snapshots** over direction-based logic — snapshot all segment positions on first drag/resize call, compare against originals throughout operation. Simpler, no edge cases.
- **Phantom blocks for middle-case splits** — When dragging through a segment, the right portion shows as a dashed phantom during drag, created as real segment on drop
- **`getState()` in event handlers** — Drag/resize handlers use `useSubtitleStore.getState()` for fresh state instead of closure-captured selectors that go stale during long pointer operations
- **Delete on mouse-up, not during drag** — Segments shrunk to near-zero during drag/resize are kept alive (reversible), only deleted in the `*End` handler when `duration < 0.05s`
- **Selection > playhead** — Explicit segment selection takes precedence in left panel highlighting; playback clears selection and resumes auto-tracking

## Next Steps
1. **Fix Issue #12** — Undo debounce captures intermediate drag states; need pre-drag snapshot instead of debounced `_pushUndo`
2. **Test live uploads** — YouTube, Instagram, Facebook, TikTok (carried over)
3. **Fix MX Master horizontal scroll** on timeline (carried over)
4. **Continue Meta/YouTube publish pipelines** per `tasks/todo.md`

## Watch Out For
- **Segment IDs are numbers** (`Date.now()`) — NEVER use `Object.entries()` or `Object.keys()` to iterate and compare; keys become strings and `===` fails silently
- **React hooks ordering** — SegmentBlock has an early `return null` that MUST stay after all hooks
- **Undo during drag is broken** (Issue #12) — `_pushUndo` debounced at 300ms captures every intermediate position, not the pre-drag state
- **Meta app still in dev mode** — localhost OAuth works but won't in production
- **PAT** at `.claude/github_token.txt` — never log or expose

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/clipflow-2026-03-24.log`
- Publish log: `%APPDATA%/clipflow/clipflow-publish-log.json`
- Electron cache errors in console are harmless (Access is denied on GPU cache)
