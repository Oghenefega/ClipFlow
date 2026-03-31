# ClipFlow — Session Handoff
_Last updated: 2026-03-31 (Subtitle segmentation v2 — pure function + preview overhaul)_

## Current State
App builds and launches. Subtitle segmentation extracted to canonical pure function with 29 regression tests. Project preview tab now uses same segmentation logic as editor with word-level karaoke rendering. Template styling in preview partially working — newer projects show correct template, older saved projects now merge with template defaults for missing fields.

## What Was Built

### Subtitle Segmentation Pure Function (`segmentWords.js`)
- Extracted all segmentation logic from useSubtitleStore.js (~217 lines removed) into standalone pure function
- 8 rules in priority order: repeated phrases, filler isolation (um/uh/ah), forward look (0.5s), max 3 words, char limit (20), never end on "I", comma flush, atomic phrase protection
- Hard wall pre-partitioning: sentence enders (.!?) and 0.7s gaps split before chunking
- Timing rules: gap closing (<0.15s), min duration (0.3s), linger extension (0.4s into empty space)
- 29 regression tests passing (segmentWords.test.js)

### New Rules This Session
- **Rule 7 — Comma flush:** Words ending with `,` or `;` always end their segment, never start the next one
- **Rule 8 — Atomic phrases:** Common 2-word phrases ("as always", "of course", "by the way", "let's go", etc.) are never split across segments
- **Linger duration (0.4s):** Segments extend 0.4s into empty space after last word, clamped to never overlap next segment

### Project Preview Overhaul (`ProjectsView.js`)
- Replaced inline 3-word chunking with canonical `segmentWords()` function via `buildPreviewSubtitles.js`
- Word-level karaoke rendering: each word is a `<span>` with highlight color on active word + pop animation
- Template resolution: `clip.subtitleStyle` merged with default template (handles old clips missing new fields)
- Punctuation stripping via `stripPunct()` from template config
- `onBack` from editor now reloads project from disk so saved styles are picked up immediately

### Editor Save Expanded
- `handleSave()` now persists: `highlightColor`, `punctuationRemove`, `animateOn`, `animateScale`, `animateGrowFrom`, `animateSpeed`, `segmentMode` to `clip.subtitleStyle`

## Key Decisions
- Linger duration set to 0.4s (no previous linger existed — segments ended at word.end)
- MAX_CHARS changed from 16→20 per user approval
- FORWARD_LOOK_GAP changed from 1.0→0.5s (old value could never fire inside partitions)
- Comma words flush immediately even as single words (reads as natural pause beat)
- Atomic phrases are 2-word only — longer phrases handled by repeated phrase detection

## Next Steps
1. **Preview template styling still needs work** — old projects with stale `subtitleStyle` now merge with template defaults, but user reports effects (glow, shadow) still don't fully match the editor. The `_buildAllShadows()` in ProjectsView uses simpler shadow computation than the editor's `buildAllShadows()`. May need to extract the editor's shadow builder as a shared utility.
2. **"as always" phrase rule logged** — implemented as atomic phrase. User may want to add more phrases over time.
3. **Spec document** (`reference/subtitle-segmentation-spec.md`) needs updating with Rule 7 (comma flush), Rule 8 (atomic phrases), and linger duration.
4. **Council reports** generated but not committed yet — 4 HTML reports + 3 transcripts from this session's councils.

## Watch Out For
- The `_buildAllShadows()` in ProjectsView.js is a SIMPLER version than the editor's `buildAllShadows()` in PreviewPanelNew.js — they compute text-shadows differently. This is why preview styling doesn't perfectly match the editor.
- Old clips saved before this session have `subtitleStyle` missing `highlightColor`, `animateOn`, `punctuationRemove`, etc. The merge fix handles this, but re-saving from editor would be the cleanest fix.
- `punctuationRemove` was NOT previously persisted on editor save — now it is.

## Logs / Debugging
- Debug log `[PreviewSub] subTpl:` still in ProjectsView.js (line ~203) — remove after debugging is complete
- All 29 segmentation tests: `node src/renderer/editor/utils/segmentWords.test.js`
