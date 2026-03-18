# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## 🟡 In Progress — Deep Text Effects System (Resolve-inspired)

### Goal
Upgrade subtitle/caption effects from basic (stroke width/opacity, shadow blur/opacity) to deep, layered effects: **Stroke** (+ blur, offsetX/Y), **Glow** (new — color, opacity, intensity, blur, blend), **Shadow** (+ offsetX/Y), **Background** (+ color, paddingX/Y, border radius). Reproduce the "Yellow Pop" DaVinci Resolve look (thick stroke, yellow glow halo, blurred drop shadow). Ship 5-8 built-in effect presets.

### Architecture Decision: EffectSection Redesign
**Current:** Plus/Minus toggle, no collapse state — content only shows when enabled.
**New:** Toggle switch (on/off) + chevron (expand/collapse). When disabled, section is dimmed but expandable (can see/tweak values before enabling). When collapsed + enabled, a colored dot shows active state. This is a **better choice** because:
1. Users can preview settings before enabling an effect
2. Disabling doesn't lose settings (just hides the effect)
3. Matches Resolve and Vizard patterns

### Step 1: Data Model — Expand Stores ✅

**useSubtitleStore.js** — add new properties:
```
// Stroke additions (existing: strokeOn, strokeColor, strokeWidth, strokeOpacity)
strokeBlur: 0,           // 0-20px softness
strokeOffsetX: 0,        // -20 to +20px
strokeOffsetY: 0,        // -20 to +20px

// Glow (NEW section)
glowOn: false,
glowColor: "#ffffff",    // defaults to text fill color
glowOpacity: 25,         // 0-100%
glowIntensity: 80,       // 0-100%
glowBlur: 15,            // 0-50px
glowBlend: 20,           // 0-100%
glowOffsetX: 0,          // -20 to +20px
glowOffsetY: 0,          // -20 to +20px

// Shadow additions (existing: shadowOn, shadowColor, shadowBlur, shadowOpacity)
shadowOffsetX: 4,        // -30 to +30px
shadowOffsetY: 4,        // -30 to +30px

// Background additions (existing: bgOn, bgOpacity)
bgColor: "#000000",
bgPaddingX: 12,          // 0-40px
bgPaddingY: 8,           // 0-20px
bgRadius: 6,             // 0-20px
```

**useCaptionStore.js** — add matching caption properties:
```
// Stroke additions
captionStrokeBlur: 0,
captionStrokeOffsetX: 0,
captionStrokeOffsetY: 0,

// Glow
captionGlowOn: false,
captionGlowColor: "#ffffff",
captionGlowOpacity: 25,
captionGlowIntensity: 80,
captionGlowBlur: 15,
captionGlowBlend: 20,
captionGlowOffsetX: 0,
captionGlowOffsetY: 0,

// Shadow additions
captionShadowOffsetX: 4,
captionShadowOffsetY: 4,

// Background
captionBgOn: false,
captionBgColor: "#000000",
captionBgOpacity: 70,
captionBgPaddingX: 12,
captionBgPaddingY: 8,
captionBgRadius: 6,
```

**Files:** `useSubtitleStore.js`, `useCaptionStore.js`
- [ ] Add all new state properties + setters (with `_pushStyleUndo` / `_pushCrossUndo`)
- [ ] Add to cross-store undo snapshot keys in `SUB_STYLE_KEYS`
- [ ] Add to caption snapshot in `_snapshotStyling`

### Step 2: EffectSection Component Redesign ✅

**File:** `RightPanelNew.js`

Replace current `EffectSection` (Plus/Minus toggle) with new version:
- [ ] Toggle switch (green on/gray off) for enable/disable
- [ ] Chevron (▼/▶) for expand/collapse — independent of enable
- [ ] When collapsed + enabled: show small color dot indicator
- [ ] When expanded + disabled: controls are visible but dimmed (opacity: 0.4)
- [ ] Section header click toggles expand; toggle switch toggles enable

### Step 3: Deepen Stroke Section ✅

**Files:** `RightPanelNew.js` (both SubtitlesPanel and TextPanel)
- [ ] Rename "Width" → "Thickness"
- [ ] Add Blur slider (0-20, labeled "Softness")
- [ ] Add Offset X slider (-20 to +20)
- [ ] Add Offset Y slider (-20 to +20)

### Step 4: Add Glow Section (NEW) ✅

**File:** `RightPanelNew.js` — insert between Stroke and Shadow
- [ ] Color picker (default: matches text fill color)
- [ ] Opacity slider (0-100%, default 25%)
- [ ] Intensity slider (0-100%, default 80%)
- [ ] Blur / Softness slider (0-50px, default 15)
- [ ] Blend slider (0-100%, default 20%)
- [ ] Offset X slider (-20 to +20)
- [ ] Offset Y slider (-20 to +20)

### Step 5: Deepen Shadow Section ✅

**File:** `RightPanelNew.js`
- [ ] Add Offset X slider (-30 to +30, default 4)
- [ ] Add Offset Y slider (-30 to +30, default 4)
- [ ] Keep existing: color, blur/softness, opacity

### Step 6: Deepen Background Section ✅

**File:** `RightPanelNew.js`
- [ ] Add Color picker (default #000000) — currently hardcoded
- [ ] Add Padding X slider (0-40px, default 12)
- [ ] Add Padding Y slider (0-20px, default 8)
- [ ] Add Border Radius slider (0-20px, default 6)
- [ ] Keep existing: opacity

### Step 7: Preview Rendering — Update `buildStrokeShadows` + text styles ✅

**File:** `PreviewPanelNew.js`

Update `subTextStyle` and `capTextStyle` to use new properties:
- [ ] Stroke: add blur parameter to shadow generation, apply offsetX/Y
- [ ] Glow: render as large, soft, semi-transparent text-shadow with intensity controlling spread
- [ ] Shadow: use offsetX/Y instead of hardcoded `0 2px`
- [ ] Background: use bgColor, bgPaddingX/Y, bgRadius
- [ ] Render order: Background → Shadow → Glow (below) → Stroke → Glow (above) → Fill

### Step 8: Built-in Effect Presets ✅

**File:** `templateUtils.js` (or new `effectPresets.js`)
- [ ] "Clean White" — white text, black stroke, no glow/shadow
- [ ] "Yellow Pop" — yellow text, thick black stroke, yellow glow, drop shadow (the Resolve reference look)
- [ ] "Neon Glow" — white text, no stroke, vibrant colored glow
- [ ] "Frosted" — white text, slight stroke, background box
- [ ] "Shadow Bold" — white text, heavy drop shadow, no stroke
- [ ] "Gaming" — uppercase, thick stroke, colored glow, strong shadow
- [ ] "Minimal" — white text, thin stroke, nothing else
- [ ] "Outlined" — colored stroke, transparent fill

### Step 9: Update Template System ✅

**File:** `templateUtils.js`
- [ ] Add new properties to `snapshotTemplate` and `applyTemplate`
- [ ] Ensure effect presets integrate with existing template save/load

### Verification
- [ ] Build with zero errors
- [ ] Launch app, open editor
- [ ] Toggle each effect section on/off — preview updates live
- [ ] Reproduce "Yellow Pop" look from screenshots
- [ ] Undo/redo works for all new properties
- [ ] Save template with deep effects → reload → all restored
- [ ] No regressions in existing subtitle/caption rendering

### Files Impacted
1. `src/renderer/editor/stores/useSubtitleStore.js` — new state + setters + undo keys
2. `src/renderer/editor/stores/useCaptionStore.js` — new state + setters
3. `src/renderer/editor/components/RightPanelNew.js` — EffectSection redesign, new controls
4. `src/renderer/editor/components/PreviewPanelNew.js` — text style rendering
5. `src/renderer/editor/utils/templateUtils.js` — template snapshot/apply + effect presets

---

## 🟡 In Progress — Whisper Migration: whisper.cpp → BetterWhisperX

### Goal
Replace whisper.cpp binary subprocess with BetterWhisperX Python subprocess. Same output format, better word-level timestamps, faster batch inference, large-v3-turbo model.

### Phase 1: Python Environment + BetterWhisperX Install
- [x] Verify Python 3.10+ is installed with CUDA-compatible PyTorch
- [x] Install BetterWhisperX: `pip install whisperx` (v3.8.2 from PyPI)
- [x] Verify import works: `python -c "import whisperx; print('OK')"`
- [ ] Test basic transcription from CLI with large-v3-turbo model

### Phase 2: Create Python Bridge Script
- [x] Create `tools/transcribe.py` — standalone Python script that:
  - Takes args: `--audio <path> --model <name> --output <path> --language <lang> --batch_size <n> --compute_type <type>`
  - Loads BetterWhisperX model
  - Transcribes with batch_size=16, compute_type=float16
  - Runs wav2vec2 alignment for word-level timestamps
  - Outputs JSON matching ClipFlow's expected format:
    `{ segments: [{ start, end, text, words: [{ word, start, end, probability }] }], text: "..." }`
  - Prints progress to stderr as `XX%` (parseable by existing progress handler)
  - Exits 0 on success, non-zero on error

### Phase 3: Swap whisper.js Integration
- [x] Rewrite `src/main/whisper.js`:
  - `checkWhisper()` → verify Python + whisperx importable
  - `transcribe()` → spawn `python tools/transcribe.py` instead of whisper-cli
  - `parseWhisperOutput()` → removed (Python script outputs our format directly)
  - Removed whisper.cpp buildCommand/PATH/CUDA/DLL logic
  - Kept same return signature: `{ segments, text }`
- [x] Update `src/main/main.js` IPC handler:
  - Changed store keys from whisperBinaryPath/whisperModelPath to whisperPythonPath/whisperModel
  - Kept progress event forwarding (unchanged format)
- [x] Update `src/main/preload.js` — no changes needed (same IPC methods)

### Phase 4: Settings UI Update
- [x] Update `src/renderer/views/SettingsView.js`:
  - Replaced "Whisper Binary Path" with "Python Path (venv)" selector
  - Removed "Model Path" (folder) — BetterWhisperX downloads models automatically
  - Changed model options: large-v3-turbo (default), large-v3, medium, small
  - Updated status check to show BetterWhisperX version + torch + CUDA

### Phase 5: Verify End-to-End
- [x] Build with zero errors
- [ ] Generate clips from a recording (full pipeline test)
- [ ] Verify word-level timestamps in editor (karaoke highlight, per-word seek)
- [ ] Verify segment splitting/merging still works
- [ ] Verify render pipeline (ASS subtitles) still works

### Phase 6: Cleanup (REQUIRES EXPLICIT USER APPROVAL)
- [ ] List all whisper.cpp files/deps to remove — present to user
- [ ] Wait for user approval before deleting anything
- [ ] Remove approved items only

---

## 📋 Misc Changes (batch when 10 accumulated)

1. **Timeline end marker**: The timeline should have a visible end line/marker so the timeline stops before it (or the content goes under it). Currently it just fades off to the right.
2. **Punctuation dropdown text**: Remove the "Hide" label — just the arrow chevron is enough. "Remove" label can stay or also be removed, arrow alone is obvious.
3. **Title bar centering**: The clip title dropdown in the editor topbar is shifted left — should be centered horizontally.

---

## 🔵 Previous — Phase 10: Editor Architecture Rewrite

### Goal
Decompose the 2654-line monolithic EditorView.js into ~22 modular files with Zustand state management. Zero feature regressions.

### Phase 0: Scaffold
- [ ] Install zustand
- [ ] Create directory structure (`src/renderer/editor/`)
- [ ] Extract constants to `utils/constants.js`
- [ ] Extract time helpers to `utils/timeUtils.js`
- [ ] Extract primitives to `primitives/editorPrimitives.js`

### Phase 1: Zustand Stores
- [ ] useLayoutStore (panel widths, collapse, drawer)
- [ ] usePlaybackStore (playing, currentTime, seek)
- [ ] useCaptionStore (caption text, font, color)
- [ ] useSubtitleStore (editSegments, styling, split/merge)
- [ ] useEditorStore (clip/project, dirty, save)
- [ ] useAIStore (AI generation, accept/reject)

### Phase 2: Shell + Layout
- [ ] EditorShell.js (top-level grid + resize handlers)
- [ ] EditorView.js thin wrapper (~30 lines)
- [ ] App.js import path update

### Phase 3: Components (14 files)
- [ ] Topbar.js
- [ ] PreviewPanel.js
- [ ] TranscriptPanel.js
- [ ] EditSubsPanel.js
- [ ] LeftPanel.js
- [ ] SubtitlesDrawer.js
- [ ] CaptionDrawer.js
- [ ] AIToolsDrawer.js
- [ ] BrandDrawer.js
- [ ] MediaDrawer.js
- [ ] RightZone.js
- [ ] Timeline.js
- [ ] RenderOverlay.js
- [ ] EditorShell.js (final assembly)

### Phase 4: Integration + Cleanup
- [ ] Delete old monolith
- [ ] Build with zero errors
- [ ] Launch and test all 21 Phase 9 features
- [ ] Verify cross-store data flow

---

## 🟡 Queued — Layout Templates (Save/Load/Apply)

### Goal
Let users save the current caption + subtitle layout (positions, fonts, sizes, styling) as a named template in the Brand Kit drawer, and apply saved templates to any clip.

### What gets saved in a template
- **Caption:** Y position (%), width (%), font family, font weight, font size, color, bold, italic, underline
- **Subtitle:** Y position (%), font family, font weight, font size, italic, bold, underline, stroke (on/width), shadow (on/blur), background (on/opacity), highlight color, line mode (1L/2L), sub mode (karaoke/word/full)

### Implementation Plan

**Step 1: Data model + persistence** (`useSubtitleStore.js`, `useCaptionStore.js`, `electron-store`)
- Add `layoutTemplates` array to electron-store: `[{ id, name, createdAt, caption: {...}, subtitle: {...} }]`
- Add IPC or store helpers to save/load/delete templates
- Default template: "Fega Default" with current defaults (Latina Essential, Heavy, Italic, size 30/52, positions 15%/80%)

**Step 2: Expose position state** (`PreviewPanelNew.js`)
- `subYPercent` and `capYPercent` are currently local `useState` — need to either:
  - Move to a store (so BrandDrawer can read/write them), OR
  - Pass a `getLayoutState()` callback up
- Move `subYPercent`, `capYPercent`, `capWidthPercent` to `useLayoutStore` so they're accessible from BrandDrawer

**Step 3: "Save current layout" button** (`BrandDrawer.js`)
- Wire the existing "+ Save current" button in Style Presets section
- On click: prompt for template name, snapshot all caption + subtitle state, persist to electron-store
- Show saved templates in the preset list (replace hardcoded `BRAND_PRESETS`)

**Step 4: "Apply" button** (`BrandDrawer.js`)
- Click a saved template → apply all its values to the caption store, subtitle store, and layout store
- Existing "↳ Apply to clip" button at top applies the active preset

**Step 5: Delete templates**
- Right-click or X button on custom templates to delete (keep built-in "Fega Default")

### Files impacted
1. `src/renderer/editor/stores/useLayoutStore.js` — add subYPercent, capYPercent, capWidthPercent
2. `src/renderer/editor/components/PreviewPanelNew.js` — read positions from store instead of local state
3. `src/renderer/editor/components/BrandDrawer.js` — wire save/load/apply/delete
4. `src/main/main.js` — electron-store key for templates (if needed)
5. `src/renderer/editor/utils/constants.js` — remove hardcoded BRAND_PRESETS

### Verification
- [ ] Save a template with custom positions + fonts → persists across app restart
- [ ] Apply template → all styling + positions update instantly
- [ ] Delete custom template → removed from list, built-in remains
- [ ] Build with zero errors, app launches

---

## 🔴 Up Next — Future Items

### Editor Round 3 — Remaining Items
- [ ] Draggable caption/subtitle on viewer with center alignment grid lines
- [ ] Inline editing of caption/subtitle on viewer (double-click to edit)
- [ ] Audio waveform analysis for word-level subtitle sync
- [ ] Delete segments from timeline (context menu or Delete key)
- [ ] Undo/redo stack for timeline edits
- [ ] Timeline header length matches last audio track duration

### Platform API Integrations (Future)
- [ ] YouTube Data API — OAuth, Shorts upload, scheduling
- [ ] TikTok API — OAuth, video upload, scheduling
- [ ] Instagram Graph API — OAuth, Reels upload
- [ ] Facebook Graph API — OAuth, Reels upload
- [ ] 30-second stagger publishing across 6 accounts

### Polish & UX
- [ ] Expanded font library for subtitle/caption panels
- [ ] Error boundary in EditorView to catch crashes gracefully
- [ ] Keyboard shortcuts (Space=play/pause, Delete=remove segment, Ctrl+Z=undo)

---

## ✅ Completed — Phase 9: Editor Round 2 (21 fixes + 1 hotfix)

### Bug Fix: Blank Editor Screen
- [x] **TDZ crash** — `clipDuration` declared at line 1223 but referenced in `useEffect`/`useCallback` deps at lines 508/560. Moved declarations above hooks. (`50e5cb4`)

### Editor General
- [x] Add back button (top-left of topbar) with auto-save on exit
- [x] Separate title vs caption state (`clipTitle` for topbar, `captionText` for overlay)

### AI Tools (3 fixes)
- [x] Context textarea auto-expand (dynamic rows + `resize: "vertical"`)
- [x] Fix AI selection visual — only accepted card gets green border + "✓ Applied" badge
- [x] Selecting title no longer overwrites caption text

### CC Subtitles (4 fixes)
- [x] Karaoke highlight — only current word green (`i === activeWordIdx`)
- [x] Wire font/size/stroke/shadow/background to actual overlay CSS
- [x] Wire 1L/2L line modes (1L = ~3 words around active word)
- [x] Add sync offset slider (-1.0s to +1.0s)

### Caption Panel (2 fixes)
- [x] Rename "Headline" → "Caption" everywhere
- [x] Build full caption panel — text editing, font family/size, color swatches, B/I/U

### Transcript (3 fixes)
- [x] Word-level spans (click-to-seek, active word highlight)
- [x] Editable words (double-click → inline edit)
- [x] Unified data source — transcript/subtitles/overlay all from `editSegments`

### Edit Subtitles (4 fixes)
- [x] Per-word hover highlighting
- [x] Click word → select + video seek
- [x] Split at selected word position (not midpoint)
- [x] Timecode click → popover with text input + range slider + Apply/Cancel

### Timeline (5 fixes)
- [x] Zoom (0.5x–4x) wired to track content width
- [x] Ruler accuracy — absolute positioning, synced scroll with tracks
- [x] Draggable/scrubable playhead (click/drag anywhere on ruler or tracks)
- [x] Hide Sub 2 track when empty
- [x] Selectable/draggable/resizable subtitle segments (move center + edge resize)

---

## ✅ Completed — Phase 8: Queue Rewiring
- [x] Created `src/main/publish.js` with platform API stubs
- [x] Rewired `allClips` from `localProjects` (clips where `renderStatus === "rendered"`)
- [x] Queue badge count from local rendered+approved clips
- [x] Replaced `clip.videoId` with `clip.renderPath` throughout QueueView
- [x] Updated warning messages for local pipeline
- [x] Publish Now / Schedule logs to tracker for manual tracking

## ✅ Completed — Phase 7: Render Pipeline
- [x] `src/main/render.js` — ASS generation, ffmpeg burn-in, batch render
- [x] IPC handlers: `render:clip`, `render:batch` with progress events
- [x] "🚀 Ready to Share" button with render progress overlay
- [x] Render status badges in ProjectsView
- [x] "Render All" batch button for approved unrendered clips

## ✅ Completed — Phase 6: AI Integration
- [x] Anthropic API for title/caption generation in Editor's AI Tools drawer
- [x] Per-game context, voice mode (Hype/Chill)
- [x] Accept/reject with history tracking

## ✅ Completed — Phase 5: Editor Core — Real Data + NLE
- [x] Real project/clip loading, HTML5 video playback
- [x] Synced subtitle overlay, transcript panel, video seek
- [x] Inline title editing, editable subtitles, save to disk
- [x] Real timeline ruler + playhead

## ✅ Completed — Phase 4: Projects Revamp
- [x] Local project browser, "Open in Editor" button, clip data model

## ✅ Completed — Phase 3: Clip Generation Pipeline
- [x] `src/main/highlights.js` — audio energy + sentiment + keywords + pacing
- [x] `pipeline:generateClips` handler, RecordingsView progress overlay

## ✅ Completed — Phase 2: Local Infrastructure
- [x] `src/main/ffmpeg.js`, `src/main/whisper.js`, `src/main/projects.js`
- [x] 17 IPC handlers, preload bridge, Settings UI

## ✅ Completed — Phase 1: Remove Cloud Dependencies
- [x] Stripped Vizard + R2 + S3 — zero cloud references in src/

## ✅ Completed — Foundation
- [x] Electron main process, preload bridge, sidebar nav
- [x] RenameView, SettingsView, QueueView, ProjectsView, CaptionsView, RecordingsView
- [x] electron-store persistence, scrollbar fixes, time picker redesign

---

## ✅ Completed — Re-Transcribe Specific Clip
- [x] Re-transcribe button in editor topbar (Mic icon)
- [x] IPC handler `retranscribe:clip` — extracts audio, runs whisperx, saves to clip
- [x] Clip-level transcription stored as `clip.transcription`, takes priority over project-level
- [x] Progress feedback (extracting → transcribing → saving → done)
- [x] Editor auto-reloads segments after re-transcription

---

## Known Issues

- None currently reported

---

## Review Notes

_Add post-implementation review notes here after each major feature._
