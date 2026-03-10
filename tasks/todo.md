# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## 🟡 In Progress — Phase 10: Editor Architecture Rewrite

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

## Known Issues

- None currently reported

---

## Review Notes

_Add post-implementation review notes here after each major feature._
