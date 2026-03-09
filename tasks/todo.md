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
- [x] **SettingsView** — game library CRUD, main game selector, watch folder, ignored processes, downloads
- [x] **QueueView** — schedule/tracker tabs, manual logging, publish now, weekly template editor
- [x] **ProjectsView** — Vizard project browser, clip review with approve/reject, inline title editing
- [x] **CaptionsView** — YouTube descriptions per game, platform caption templates
- [x] **UploadView** — file selection, R2 upload with progress
- [x] electron-store persistence for all settings/data
- [x] Vizard API integration — project import, clip mapping, deduplication
- [x] Source video filtering (duration-based heuristic)
- [x] Tracker source tagging (Vizard vs manual) with glow dots
- [x] Time picker redesign (hour + minute split dropdowns)
- [x] Scrollbar overflow fixes across all views
- [x] Clip download support with progress tracking
- [x] **EditorView** — Full editor shell with topbar, left panel (transcript/subtitles), center preview, right rail+drawer (AI/Subtitles/Brand/Media), timeline, all resizable/collapsible

## In Progress

_(nothing currently in progress)_

## Recently Completed

### Editor View — New Feature

**File Impact Analysis:**
- **NEW:** `src/renderer/views/EditorView.js` — Full editor component (~1800-2200 lines)
- **MODIFY:** `src/renderer/App.js` — Add import, nav item between Projects and Queue, route, adjust content wrapper for full-bleed layout

**Implementation Steps:**

- [x] **Step 1: Create EditorView.js shell** — Main layout with 4 zones (left panel, center preview, right rail+drawer, bottom timeline). All using theme.js tokens. Full-bleed layout (no padding/maxWidth).

- [x] **Step 2: Left Panel — Transcript tab** — Mode pills (Karaoke/Word/Phrase), toolbar (Split/Merge/Words), search input, transcript rows with timecodes and highlight support. Collapsible + resizable panel.

- [x] **Step 3: Left Panel — Edit Subtitles tab** — Toolbar (Split/Merge/Undo + track filter chips), segment list with editable text, timecodes, confidence dots, warnings, footer with selection actions.

- [x] **Step 4: Center Preview** — 9:16 video preview mockup with subtitle overlay, playback controls (time/play/speed), bottom bar (aspect ratio, background, layouts, expand).

- [x] **Step 5: Editor Topbar** — Undo/redo/auto-save buttons, clip title selector (centered), zoom level + fullscreen + Save button.

- [x] **Step 6: Right Rail** — 7 tool buttons (AI Tools, Subtitles, Headline, Brand Kit, Audio, Media, Text) that toggle a drawer panel open/closed.

- [x] **Step 7: AI Tools drawer** — Voice fingerprint pills (Hype/Chill), context textarea, game selector dropdown, generate/regenerate button, title+caption result cards with accept/dismiss.

- [x] **Step 8: Subtitles drawer** — Global section (mode, font/size, format toolbar, stroke, shadow, background, highlight swatches, position grid, punctuation toggles). Per-track accordions (Sub 1, Sub 2) with override controls.

- [x] **Step 9: Brand Kit drawer** — Style presets (list with preview/select/delete), brand colors, fonts (primary/secondary), watermark section with position grid + opacity slider.

- [x] **Step 10: Media drawer** — Upload drop zone, filter tabs (All/Images/GIFs/Audio), asset grid with thumbnails, add-to-timeline buttons.

- [x] **Step 11: Timeline** — Toolbar (split, zoom slider, timecode, play, speed, collapse, overlay toggle). Ruler with time marks. Track rows (Caption, Sub 1, Sub 2, Video 1, Audio 1-4) with colored blocks. Playhead line. Resizable height. Collapse/expand.

- [x] **Step 12: Wire into App.js** — Import EditorView, add "Editor" nav item (between Projects and Queue), add route, adjust wrapper to remove padding/maxWidth for editor view.

- [x] **Step 13: Build + verify** — `npx react-scripts build`, `npm start`, visual check all panels.

**Verification Criteria:**
1. Build completes with no errors
2. App launches, Editor tab appears between Projects and Queue in bottom nav
3. All 4 zones render (left panel, center preview, right rail+drawer, timeline)
4. Left panel tabs switch between Transcript and Edit Subtitles
5. Right rail buttons toggle drawer panels
6. Timeline collapse/expand works
7. Left panel collapse/expand works
8. No regressions in other views (Rename, Upload, Projects, Queue, Captions, Settings)

## Up Next

- [ ] Phase out legacy clipping software — track Vizard vs manual usage in tracker
- [ ] Implement real platform API integrations:
  - [ ] YouTube Data API (Shorts upload)
  - [ ] TikTok API
  - [ ] Instagram Graph API (Reels)
  - [ ] Facebook Graph API (Reels)
- [ ] Publishing automation — 30-second stagger across 6 accounts
- [ ] Vizard publish integration (publish clips directly from Projects view)
- [ ] Auto-fill tracker when publishing via platform APIs
- [ ] Cloudflare R2 upload → Vizard project creation pipeline

## Known Issues

- None currently reported

---

## Review Notes

_Add post-implementation review notes here after each major feature._
