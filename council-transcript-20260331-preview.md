# LLM Council Transcript — Preview Subtitle Rendering
**Date:** March 31, 2026

## Original Question
How should ClipFlow's project preview tab render subtitle/caption overlays to match the editor's template from the moment clips load — without requiring user to open each clip in the editor first?

## Framed Question
*(see council-report-20260331-preview.html for full context)*

Key facts:
- Preview has simplified renderer that misses punctuation stripping, correct positioning, proper template
- Clips from pipeline have word timestamps at `clip.subtitles.sub1[].words[]` but no subtitleStyle
- Default template available via electron-store, passed as previewTemplate prop
- Segmentation already unified (segmentWords.js)
- Preview is 220px, doesn't need karaoke/animation
- 10-20 clips visible at once

---

## Advisor Responses

### The Contrarian
The fatal flaw is the hidden state problem. What happens when user edits clips with a custom template, saves, then changes the default template? Preview renders saved clips with the wrong template. punctuationRemove not persisted to clip object — even saved clips show wrong punctuation. 10-20 clips with live segmentation = performance cliff. The real question: why does the preview need subtitle rendering at all at 220px?

### The First Principles Thinker
The real problem is rendering logic scattered across two execution contexts with no shared pure function layer. Build one pure function: renderSubtitleSegments(words, template) → display-ready segments with text punctuation-stripped, timing, position. Called identically by editor and preview. The absence of saved style is the default state — design for it. The wrong question is "how do we make preview match editor." The right question is "why does rendering logic exist in two places at all."

### The Expansionist
Preview becomes the product. Build a single renderSubtitleFrame(words, currentTime, template) pure function outside editor stores. Use it in render queue preview, bulk style workflow, thumbnail generator. Don't build a "preview approximation." Build the canonical subtitle renderer and let editor and preview both consume it.

### The Outsider
You're describing a "preview" but building a second renderer. Extract renderSubtitleFrames(words, template, containerWidth). Both editor and preview call it. Editor adds karaoke on top. What a new user would find baffling: why does opening a clip in the editor "fix" the preview? That's not a feature, that's a data leak.

### The Executor
Create buildPreviewSubtitles.js — pure function taking (words, template). Does three things: 1) segmentWords(), 2) stripPunct(), 3) Return { segments, style }. useMemo keyed on clip.words = once per clip. Skip karaoke/animation at 220px. Per-clip: clip.subtitleStyle ?? previewTemplate. 2-3 hours, ~50 lines.

---

## Peer Reviews

### Review 1 (Anonymized A=Contrarian, B=FirstPrinciples, C=Expansionist, D=Outsider, E=Executor)
- **Strongest:** First Principles — identifies structural root cause
- **Biggest blind spot:** Executor — assumes previewTemplate resolves correctly
- **All missed:** Word data availability — if clip.words is stale/empty, renderer produces nothing

### Review 2
- **Strongest:** Executor — actionable implementation
- **Biggest blind spot:** Contrarian — raises edge cases without solutions, dodges the question
- **All missed:** Whether words array is available on clip objects when project tab loads

### Review 3
- **Strongest:** First Principles — precise function signature, handles edge cases
- **Biggest blind spot:** Executor — skips where template comes from for never-opened clips
- **All missed:** Synchronization trigger — when does preview re-render when template changes?

### Review 4
- **Strongest:** Executor — actionable specifics, realistic time estimate
- **Biggest blind spot:** First Principles — diagnoses without prescribing
- **All missed:** Whether clip.words exists on clips never opened in editor

### Review 5
- **Strongest:** Expansionist — canonical function = right long-term architecture
- **Biggest blind spot:** Executor — tactical without addressing architecture
- **All missed:** Where preview reads template state from

---

## Chairman's Verdict

### Where the Council Agrees
1. **One shared pure function** — all 5 advisors converged independently
2. **Skip karaoke/animation in preview** — 220px doesn't need it
3. **Default template as fallback** — `clip.subtitleStyle ?? defaultTemplate`
4. **"Two renderers" is the root cause** — preview diverged because it was a separate simplified renderer

### Where the Council Clashes
1. **Scope:** Preview utility (Executor) vs canonical renderer (Expansionist) — Chairman sides with preview utility now
2. **Need:** Does preview need subtitles at 220px? (Contrarian) — Chairman overrules: confirmed user requirement

### Blind Spots Caught
1. **Word data availability** — Verified: exists at `clip.subtitles.sub1[].words[]`, written at pipeline time
2. **punctuationRemove not persisted** — Must be added to editor save or always read from template
3. **Template change after save** — Handled by fallback chain

### The Recommendation
Build `buildPreviewSubtitles.js` — pure function taking (subtitleSegments, template), returns display-ready segments. Wire into ClipVideoPlayer with useMemo. Persist punctuationRemove on editor save.

### The One Thing to Do First
Create the pure function, wire it in, persist punctuationRemove. Single focused task.

---

## Data Layer Verification
- `clip.subtitles.sub1[].words[]` — word timestamps, written at pipeline time (ai-pipeline.js line 601)
- `clip.subtitleStyle` — absent on never-edited clips, present after editor save
- Template — loaded from electron-store `defaultTemplateId` + `layoutTemplates`, passed as previewTemplate prop
