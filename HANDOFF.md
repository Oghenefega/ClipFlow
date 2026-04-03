# ClipFlow — Session Handoff
_Last updated: 2026-04-03 — "Editor Style Persistence Fix + Subtitle Timing Rebuild Plan"_

## Current State
App is stable. Two bugs fixed and shipped. One major rebuild planned and fully specced.

## What Was Built

### Bug Fix 1: Editor Style Persistence (SHIPPED)
- **Root cause:** `useEditorStore.initFromContext()` called `applyTemplate()` unconditionally on every editor mount, overwriting saved `clip.subtitleStyle` and `clip.captionStyle`. Save button worked correctly, Projects tab showed saved styles correctly, but the Editor always reset to template defaults.
- **Fix:** Added `restoreSavedStyle()` methods to both `useSubtitleStore` and `useCaptionStore`. After `applyTemplate()` runs (providing defaults), saved styles are restored on top. Layout positions (yPercent) also restored.
- **Secondary bug fixed:** `handleSave()` in `useEditorStore` was reading unprefixed property names from caption store (`capState.fontFamily` instead of `capState.captionFontFamily`). All caption style properties were saving as `undefined`. Fixed to use correct prefixed names AND expanded to save all caption effects (stroke, shadow, glow, background).
- **Files changed:** `useEditorStore.js`, `useSubtitleStore.js`, `useCaptionStore.js`
- **Status:** Built, tested, verified by user ✅

### Bug Fix 2: Subtitle Segmentation — Forward Connectors (SHIPPED)
- **Rule expanded:** The existing "never end a segment on 'I'" rule was expanded to cover all forward-connecting words: prepositions (to, in, on, at, for, of, with, from, by), articles (a, an, the), conjunctions (and, but, or, so, if, as).
- **Edge case handled:** If the connector is the LAST word in a partition (before a hard pause wall), it stays with the preceding segment instead of dangling alone.
- **File changed:** `segmentWords.js` — `FORWARD_CONNECTORS` set at module level, Rule 6 updated.
- **Status:** Built, verified by trace analysis ✅

### Subtitle Timing Rebuild — Full Spec (PLANNED, NOT STARTED)
- **Spec file:** `tasks/subtitle-timing-rebuild-spec.md`
- **4 phases:** (1) Word timestamp post-processing, (2) Progressive karaoke highlight, (3) Unify preview/burn-in algorithms, (4) Segmentation safe fixes
- **Research done:** Analyzed whisper-timestamped, stable-ts, WhisperX, CrisperWhisper, Aegisub, Netflix standards
- **Status:** Fully specced, approved by user, ready to implement in next session

## Key Decisions
- Template is the starting point; saved customizations always win (merge semantics, not replace)
- Forward connectors: 19 words in the set, tested against user's real speech data
- Subtitle timing: adopt CrisperWhisper's 50ms min duration + stable-ts 150ms gap merge + Aegisub progressive fill
- Progressive karaoke highlight chosen over instant color change (masks timing errors up to ~100ms)
- Phase execution order: 1 → 4 → 3 → 2 (each independently shippable)

## Next Steps
1. **START HERE:** Implement subtitle timing rebuild per `tasks/subtitle-timing-rebuild-spec.md`
   - Phase 1: `cleanWordTimestamps.js` (new file, 3-pass post-processor)
   - Phase 4: segmentWords.js safe fixes (startSec clamp, last-word extension)
   - Phase 3: Unify `findActiveWord` between preview and burn-in, apply syncOffset in burn-in
   - Phase 2: Progressive karaoke highlight (CSS gradient sweep)
2. Test against clip `clip_1773883452956_geog` (the clip with known drift)
3. Commit each phase separately

## Watch Out For
- `data/clipflow.db` has changes — don't commit database files
- `reference/TECHNICAL_SUMMARY.md` was deleted (shows in git status) — verify intentional
- The forward connector rule may affect existing clips — user needs to re-segment (toggle 3Words mode) to see changes
- overlay-renderer.js runs in offscreen BrowserWindow (plain JS, no React) — shared code must be vanilla JS
- `cleanWordTimestamps` must create NEW word objects (no in-place mutation) — undo system deep-copies via JSON.stringify

## Logs/Debugging
- User-confirmed: style persistence fix works ✅
- User-confirmed: "welcome back / to another" segmentation is correct ✅
- Clip `clip_1773883452956_geog`: 163 words, 81 segments, 56s duration
  - 6 words with zero or near-zero duration (Whisper artifacts)
  - 3 segments start 60-80ms before first word (Phase 3 backward extension)
  - Drift starts at "as always" (word gap 545ms, word durations 30-40ms)
