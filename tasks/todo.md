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

## In Progress

_(nothing currently in progress)_

## Up Next — Pipeline Revamp (Local AI + NLE)

### Phase 2: Local Infrastructure — ffmpeg, Whisper, Project Files
- [ ] Create `src/main/ffmpeg.js` — checkFfmpeg, probe, extractAudio, cutClip, generateThumbnail
- [ ] Create `src/main/whisper.js` — checkWhisper, transcribe (whisper.cpp + CUDA)
- [ ] Create `src/main/projects.js` — Project file CRUD at `{watchFolder}/.clipflow/projects/{id}/`
- [ ] Wire IPC handlers in main.js for all new modules
- [ ] Add bridge methods in preload.js
- [ ] Populate Settings: ffmpeg status, Whisper binary/model path pickers

### Phase 3: Clip Generation Pipeline
- [ ] Create `src/main/highlights.js` — audio energy (40%) + sentiment (30%) + keywords (20%) + pacing (10%)
- [ ] Wire `pipeline:generateClips` handler (extractAudio → transcribe → analyze → detect → cut → thumbnails → project)
- [ ] Connect RecordingsView "Generate Clips" button with progress overlay

### Phase 4: Projects Revamp — Local Project Browser
- [ ] Rewire ProjectsView for localProjects (remove import modal, use local file paths)
- [ ] Add "Open in Editor" button per clip
- [ ] Add editorContext state in App.js

### Phase 5: Editor Core — Real Data + NLE
- [ ] Create `src/renderer/components/VideoPreview.js` (HTML5 video + subtitle overlay)
- [ ] Replace all EditorView mock data with real project/clip loading
- [ ] Video playback, transcript sync, subtitle editing, timeline playhead, media panel, undo/redo, save to project JSON

### Phase 6: AI Integration — Title/Caption Generation in Editor
- [ ] Move GenerationPanel from ProjectsView into Editor's AI Tools drawer
- [ ] Wire Anthropic API for real title/caption generation
- [ ] Per-game context from gamesDb, voice mode (Hype/Chill)

### Phase 7: Render Pipeline — "Ready to Share" → Output
- [ ] Create `src/main/render.js` — ffmpeg filter_complex (subtitle burn-in + SFX mix + media compositing)
- [ ] Wire "Ready to Share" button → render progress → output folder
- [ ] Batch render for multiple clips

### Phase 8: Queue Rewiring — Local Rendered Clips
- [ ] Create `src/main/publish.js` (platform API stubs)
- [ ] Rewire QueueView to source clips from localProjects (renderStatus === "rendered")
- [ ] Queue badge count from local data

## Known Issues

- None currently reported

---

## Review Notes

_Add post-implementation review notes here after each major feature._
