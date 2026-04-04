# ClipFlow — Session Handoff
_Last updated: 2026-04-03 — "Subtitle Timing Rebuild — Phases 1-3 Implemented, Advance Buffer Reverted"_

## Current State
App is stable. Subtitle timing rebuild (Phases 1-4) implemented and mostly working. One attempted fix (advance buffer) was reverted per user feedback. Header title overflow still broken.

## What Was Built

### Subtitle Timing Rebuild — Phases 1-4 (SHIPPED)

**Phase 1: Word Timestamp Post-Processing** (`cleanWordTimestamps.js` — NEW)
- 4-pass pipeline: monotonicity enforcement, min duration (50ms), micro-gap fill (150ms), suspicious detection + character-count redistribution
- Integrates into `useSubtitleStore.initSegments()` (per-segment with anchors) and `setSegmentMode()` (cross-segment, no anchors)
- Thresholds: SHORT_COUNT=3, COVERAGE_RATIO=0.6, IDENTICAL_PAIRS=2 (originals restored after revert)

**Phase 2: Progressive Karaoke Highlight** (OPT-IN)
- Progressive fill (CSS gradient sweep like Aegisub `\kf`) available as `highlightMode: "progressive"`
- Default is `"instant"` (original behavior) — user explicitly rejected progressive as default
- Supported in both PreviewOverlays.js and overlay-renderer.js

**Phase 3: Unified Preview/Burn-in** (`findActiveWord.js` — NEW)
- Shared word-driven lookup used by both PreviewOverlays.js (ES import) and overlay-renderer.js (CJS require)
- Returns `{seg, wordIdx, wordProgress}` for karaoke rendering
- syncOffset now applied in burn-in path (`render.js` → `subtitle-overlay-renderer.js`)
- **REVERTED**: ADVANCE_BUFFER (40ms delay on non-first words) was removed — made timing visually worse

**Phase 4: Segmentation Safe Fixes** (`segmentWords.js` — MODIFIED)
- startSec clamping: segment can't start before first word
- Last-word extension through segment linger time
- Intra-segment gap fill
- Expanded FORWARD_CONNECTORS: added contractions (let's, I'm, I'll, we're, etc.), auxiliaries (is, are, was, will, etc.), demonstratives (that, this, these, those)
- Added ATOMIC_PHRASES: "light work", "let's get", "real quick", "right here", etc.
- Unicode apostrophe normalization in norm()
- Context-aware guard: `isLastInPartition` prevents forward connector from firing at partition boundaries

### EditorLayout Header Fix (ATTEMPTED, STILL BROKEN)
- Two approaches tried: (1) px-[220px] padding, (2) flexbox with flex-1 min-w-0
- Neither solved the title overflow — needs a different approach next session

## Key Decisions
- Progressive karaoke is opt-in only (`highlightMode: "progressive"`), instant is default
- Advance buffer (40ms) approach FAILED — made timing visually worse, was reverted
- Word timestamp cleaning runs at segment init time, not at render time
- Character-count redistribution uses speech region (word boundaries), not full segment boundaries
- Forward connector "that" has context sensitivity via partition guard (handles "what is that?" questions)

## Next Steps
1. **Header title overflow** — still broken, needs a third approach (investigate actual layout/DOM structure more carefully)
2. **Premature word advance drift** — the core issue of highlight jumping ahead on stretched words remains unsolved. The advance buffer approach failed. Needs a different strategy (possibly adjusting word.start during post-processing rather than at render time)
3. Test timing rebuild against more clips to confirm improvement
4. Commit all session work

## Watch Out For
- `data/clipflow.db` has changes — don't commit database files
- `reference/TECHNICAL_SUMMARY.md` was deleted (shows in git status) — verify intentional
- `findActiveWord.js` uses CJS `module.exports` for dual compatibility — don't convert to ES modules
- `cleanWordTimestamps.js` uses ES `export` — it's only used by React-side code
- overlay-renderer.js loads findActiveWord via injected `__FIND_ACTIVE_WORD_PATH__` — path must be absolute

## Logs/Debugging
- User confirmed: timing is "much better" after Phase 1 post-processing
- User confirmed: progressive karaoke as default = rejected ("oh hell no")
- User confirmed: advance buffer (40ms) made things "visually weird and out of sync" — reverted
- Header overflow: two fix attempts failed, user says "look at it from a different angle"
- Premature word advance examples: "and" stretched then jumps to "am", "baby" stretched then jumps to "whoa"
