# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## Completed

- [x] Electron main process with IPC handlers, file watcher, OBS log parser
- [x] Preload bridge (`window.clipflow` API)
- [x] Sidebar navigation with 6 tabs
- [x] **RenameView** — file watcher, rename cards, history, manage tab
- [x] Fix file watcher — root-only watching, skip subfolders/renamed files
- [x] Add +Add Game button to Rename header
- [x] Wire up OBS log parser for game detection
- [x] **SettingsView** — game library CRUD, main game selector, watch folder, ignored processes
- [x] **QueueView** — schedule/tracker tabs, manual logging, publish now, weekly template editor
- [x] **ProjectsView** — project browser, clip review with approve/reject, inline title editing
- [x] **CaptionsView** — YouTube descriptions per game, platform caption templates
- [x] **UploadView** → **RecordingsView** — recordings browser with Generate Clips stub
- [x] electron-store persistence for all settings/data
- [x] Tracker source tagging (ClipFlow vs manual) with glow dots
- [x] Time picker redesign (hour + minute split dropdowns)
- [x] Scrollbar overflow fixes across all views
- [x] **EditorView** — Full editor shell with topbar, left panel (transcript/subtitles), center preview, right rail+drawer (AI/Subtitles/Brand/Media), timeline, all resizable/collapsible

---

## Recently Completed

### Phase 1: Remove Cloud Dependencies (Vizard + R2)

**What changed:**
- Removed `@aws-sdk/client-s3` and `@aws-sdk/lib-storage` dependencies
- Cleaned `.env.example` to just `ANTHROPIC_API_KEY=`
- Stripped ~212 lines from `main.js` (S3/Upload imports, R2 config, Vizard handlers, download handler)
- Stripped ~25 lines from `preload.js` (10 cloud methods removed)
- Stripped ~272 lines from `App.js` (cloud state, auto-import, Vizard callbacks, allClips derivation)
- Rewrote `UploadView.js` as `RecordingsView` (380→184 lines) — recordings browser with "Generate Clips" stub
- Stripped Vizard import modal + polling from `ProjectsView.js`
- Replaced Vizard publish calls with stubs in `QueueView.js`, updated all UI text
- Removed ~300 lines from `SettingsView.js` (R2 Config, Vizard AI, Downloads sections)
- Added new settings: Output Folder, SFX Folder, Whisper Config (stub)
- Added store defaults: `outputFolder`, `sfxFolder`, `whisperModel`, `localProjects`
- Renamed nav item: Upload → Recordings

**Verification:** ✅ Build passes, zero Vizard/R2/S3 references in src/

---

## Recently Completed (Phases 2-4)

### Phase 2: Local Infrastructure ✅
- [x] Created `src/main/ffmpeg.js` — checkFfmpeg, probe, extractAudio, cutClip, generateThumbnail, analyzeLoudness
- [x] Created `src/main/whisper.js` — checkWhisper, transcribe (whisper.cpp + CUDA)
- [x] Created `src/main/projects.js` — Project file CRUD at `{watchFolder}/.clipflow/projects/{id}/`
- [x] Wired 17 IPC handlers in main.js for all new modules
- [x] Added bridge methods in preload.js
- [x] Populated Settings: ffmpeg status, Whisper binary/model path pickers

### Phase 3: Clip Generation Pipeline ✅
- [x] Created `src/main/highlights.js` — audio energy (40%) + sentiment (30%) + keywords (20%) + pacing (10%)
- [x] Wired `pipeline:generateClips` handler (extractAudio → transcribe → analyze → detect → cut → thumbnails → project)
- [x] Connected RecordingsView "Generate Clips" button with progress overlay

### Phase 4: Projects Revamp — Local Project Browser ✅
- [x] Updated clip data model: `duration` → computed from startTime/endTime, `viralScore` → `highlightScore`, `transcript` → derived from project transcription
- [x] Added `getClipTranscript` helper to extract clip-level transcript from project transcription segments
- [x] Added "Open in Editor" button per clip (purple accent styling)
- [x] Added `editorContext` state and `handleOpenInEditor` callback in App.js
- [x] Added `handleSelectProject` to load full project data (with transcription) on click
- [x] Persisted clip status/title changes to project JSON on disk via `projectUpdateClip`
- [x] Passed `editorContext` and `localProjects` to EditorView for Phase 5

### Phase 5: Editor Core — Real Data + NLE ✅
- [x] Replaced all EditorView mock data with real project/clip loading from `editorContext`
- [x] HTML5 `<video>` element with `file://` protocol for local clip playback (inline, no separate component needed)
- [x] Synced subtitle overlay from project transcription (filtered by clip time range)
- [x] Video playback controls with real `currentTime` / `clipDuration` display
- [x] Transcript panel built from Whisper data via `React.useMemo`
- [x] Transcript row click → video seek to segment start time
- [x] Subtitle segment click → video seek to segment start time
- [x] Inline clip title editing in topbar with dirty state tracking
- [x] Editable subtitle text in Edit Subtitles panel with dirty tracking
- [x] Save handler persists title + subtitle edits to project JSON via `projectUpdateClip`
- [x] Timeline ruler & playhead use real clip duration and synced `currentTime`
- [x] SFX folder file loading for media panel
- [x] Empty state when no clip loaded

## Up Next — Pipeline Revamp (Continued)

### Phase 6: AI Integration — Title/Caption Generation in Editor ✅
- [x] Moved GenerationPanel from ProjectsView into Editor's AI Tools drawer
- [x] Wired Anthropic API for real title/caption generation via `anthropicGenerate`
- [x] Per-game context from gamesDb, voice mode (Hype/Chill) changes prompt tone
- [x] Accept title → sets clipTitle + dirty, logs to history
- [x] Accept caption → logs to history (for future render pipeline)
- [x] Reject → tracks rejections, excluded from next generation
- [x] Removed GenerationPanel + GameDropdown from ProjectsView (~260 lines stripped)
- [x] Replaced "AI Titles" expand section with "Open in Editor" prompt

### Phase 7: Render Pipeline — "Ready to Share" → Output ✅
- [x] Created `src/main/render.js` — generateAssFile (ASS subtitle generation), renderClip (ffmpeg subtitle burn-in via -vf ass filter, H.264/AAC, progress tracking), batchRender (sequential multi-clip)
- [x] Wired IPC handlers: `render:clip`, `render:batch` with progress events and automatic renderStatus/renderPath update in project JSON
- [x] Added preload bridge: `renderClip()`, `batchRender()`, `onRenderProgress()`, `removeRenderProgressListener()`
- [x] Added "🚀 Ready to Share" button in EditorView topbar with render progress overlay (progress bar, success with Open Folder, error display)
- [x] Subtitle style passes through from editor settings (fontSize, highlightColor, strokeWidth, position)
- [x] Added render status badges in ProjectsView: "✓ Rendered" (cyan) and "⏳ Rendering" (yellow)
- [x] Added "Render All" batch button in ClipBrowser header for approved unrendered clips
- [x] Project data auto-reloads after batch render to reflect updated renderStatus

### Phase 8: Queue Rewiring — Local Rendered Clips
- [ ] Create `src/main/publish.js` (platform API stubs)
- [ ] Rewire QueueView to source clips from localProjects (renderStatus === "rendered")
- [ ] Queue badge count from local data

## Known Issues

- None currently reported

---

## Review Notes

_Add post-implementation review notes here after each major feature._
