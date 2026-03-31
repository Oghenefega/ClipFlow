# Changelog

All notable changes to ClipFlow are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — 2026-03-30

### Changed
- **Settings page reorganized into 6 collapsible groups:** Files & Folders, Content Library, AI & Style, Publishing, Tools & Credentials, and Diagnostics. Related settings are now grouped together instead of scattered in a flat list. Groups 3/5/6 (AI, tools, diagnostics) start collapsed since they're rarely changed. Each group header is clickable to expand/collapse.
- Moved Output Folder and Sound Effects Folder from the middle of Settings to the Files & Folders group at the top, alongside Watch Folder and Video Splitting.

### Fixed
- Quick Import now correctly stores file size in the database. Previously, imported files always showed "0 B" in the Recordings tab because `fileSizeBytes` was not passed to `fileMetadataCreate()`. Fixed for both single-file and split import paths.

### Added
- Shared SQLite database with automatic migration system (rename redesign)
- Naming preset engine for file rename workflows
- IPC bridge for file metadata, labels, and rename history
- File metadata migration and electron-store migration path
- Recordings tab SQLite migration and AI pipeline refactor
- **Video splitting infrastructure (Phase 1, steps 1-4):** Settings for auto-split threshold (10-120 min), source file retention, and enable/disable toggle. Schema migration v3 adds split lineage columns (`split_from_id`, `split_timestamp_start/end`, `is_split_source`, `import_source_path`). FFmpeg `splitFile()` function with stream copy, all-or-nothing error handling, and post-split probe for keyframe-adjusted times. `split:execute` IPC endpoint creates child `file_metadata` records, marks parent as split source, and logs to rename history.
- **"Video Splitting" section in Settings UI** with enable toggle, threshold slider, and keep/delete originals toggle
- **`importExternalFile` IPC endpoint** — copies external .mp4 files to watch folder's monthly subfolder with streaming progress events. `pendingImports` Set in main process suppresses chokidar from creating duplicate `file_metadata` records during drag-and-drop imports. Matching uses filename + file size per spec v3.1 Section 14.1.
- **File watcher suppression** — chokidar `add` handler checks `pendingImports` Set before processing any new file, preventing duplicate entries from drag-and-drop imports. `import:clearSuppression` and `import:cancel` IPC endpoints for cleanup.
- **Auto-split integration in Rename tab** — probes file duration via FFmpeg when files enter pending. Shows split badge with duration and part count ("2h 14m — will split into 5 parts") plus a preview of resulting files with time ranges. Per-file "Don't split" toggle. RENAME button changes to "SPLIT & RENAME" when splitting is active. Split progress indicator shows completion during multi-part splits.
- **Drag-and-drop on Rename tab** — drop zone overlay with dashed border appears on drag-over. Accepts .mp4 files only, single file per drop. Copies file to watch folder with watcher suppression, then adds to pending list for standard rename flow. Import progress bar shown for large files.
- **Drag-and-drop on Recordings tab** — same drop zone treatment. Opens a quick-import modal with 3-step flow: pick game/content type, split proposal (green primary "Split & Generate" vs gray "Skip splitting"), and confirm preview. Uses preset 3 (Tag + Date) automatically. Supports watch folder auto-setup on first drop if not configured.
- **SPLIT badge in rename History tab** — split entries show a purple SPLIT badge, no undo button (deferred to future version per spec)
- **Thumbnail strip generation (Phase 2, step 11):** `generateThumbnailStrip()` in ffmpeg.js extracts one frame every 30 seconds at 320px wide using FFmpeg. Thumbnails stored in OS temp directory (`clipflow-thumbs/{fileId}/`), cleaned up on rename, cancel, or app quit.
- **`generateThumbnails` / `cleanupThumbnails` IPC endpoints (Phase 2, step 12):** Main process caches thumbnail results by file path — reopening the scrubber for the same file reuses existing thumbnails. Cleanup on `window-all-closed` deletes all cached thumb directories.
- **ThumbnailScrubber UI component (Phase 2, step 13):** Horizontal scrollable thumbnail strip with time labels every 5/10 minutes. Click anywhere to place purple split markers with dot handles and time tooltips. Click existing markers to remove them. Per-segment game/content dropdown using the same grouped Select component from the rename system. Enforces 1-minute minimum segment length. Segment list shows time ranges, durations, and color-coded indicators. Loading state with animated progress bar while thumbnails generate.
- **Game-switch split integration in Rename tab (Phase 2, step 14):** "Multiple games" button on every pending file card — clicking it generates thumbnails and expands the ThumbnailScrubber below the card. `gameSwitchSplitAndRename()` splits the source file at marker positions with per-segment game tags. Compound splitting: after game-switch split, each resulting segment is independently checked against the auto-split threshold and further split into parts if it exceeds it. RENAME button shows "SPLIT & RENAME" when markers are placed. `renameOne` and `renameAll` both handle game-switch splits. Scrubber state and thumbnails cleaned up on rename, cancel, hide, and rename-all.

### Changed
- Replaced native `<select>` in Quick Import modal (Recordings tab) with styled `Select` component — now shows GamePill color tags and matches Rename tab dropdown styling
- Renamed "Multiple games" button to "split by game" and moved it from a confusing standalone button to a subtle text link in the action buttons row (next to RENAME/HIDE)
- Refactored Rename tab UI with preset system
- Updated Settings UI for rename redesign
- `allRenamed` query now excludes files with `"split"` status so split parents don't appear in Recordings
- `updateFileStatus` guards against overwriting `"split"` status on parent files
- `applyPendingRenames` skips files with `"split"` status
- `isFileInUse` returns false for `"split"` files (parent is inert, children may be active)

---

## 2026-03-29 — Goal B, Onboarding, and Legacy Cleanup

### Added
- Cold-start architecture and creator profile system (Goal B)
- Onboarding wizard for new users
- AI preferences section in Settings

### Removed
- OBS log parser (dead code, never used)
- Hype/chill voice mode (redundant feature)

---

## 2026-03-28 — Provider Abstraction and AI Prompt Redesign

### Added
- Provider abstraction layer for LLM and transcription systems (swap models without code changes)
- Dev dashboard with provider controls, store viewer, and pipeline logs

### Changed
- Redesigned all AI prompts for model-agnostic reliability

---

## 2026-03-27 — OAuth Flows and Platform Publishing

### Added
- TikTok publish pipeline with Content Posting API and progress UI
- Meta (Instagram + Facebook) and YouTube publish pipelines with OAuth and upload UI
- TikTok inbox/direct post mode toggle for production API
- Separate Instagram and Facebook Page login flows (split from combined Meta OAuth)
- BrowserWindow-based OAuth for Instagram with separate app credentials
- GitHub Issues infrastructure with labels, CLI workflow, and API token

### Fixed
- Meta OAuth switched from deprecated Facebook redirect URI to localhost callback server
- Instagram OAuth race condition resolved
- Facebook now uses Page avatar instead of personal profile image
- TikTok PKCE code challenge uses hex-encoded SHA256 (TikTok deviates from RFC 7636)

### Changed
- Migrated OAuth modules and feedback system from console.* to electron-log scoped loggers
- Upgraded logging system to electron-log v5

---

## 2026-03-26 — Timeline Physics, Subtitle Sync, and Editor Polish

### Fixed
- Timeline subtitle drag physics, click targeting, and segment selection highlight
- Undo now captures pre-drag snapshot only, not intermediate drag states (Issue #12)
- Subtitle/audio sync improved with re-encode cut in pipeline
- Subtitle timing desync: timeline drags now sync word timestamps and respect segment boundaries
- Play-from-beginning when video has ended

### Added
- Subtitle drag overlap behavior and timeline UX improvements

---

## 2026-03-25 — TikTok OAuth and Logging System

### Added
- TikTok OAuth with encrypted token storage
- Dynamic "Connected Platforms" display in Settings
- Unified logging system with Report an Issue UI

### Fixed
- PKCE code challenge encoding for TikTok OAuth
- Pipeline Logs overflow glitch from nested scroll containers

---

## 2026-03-24 — Experiment Session and Dead Code Cleanup

### Removed
- Dead `views/EditorView.js` (2,654-line monolith never imported anywhere)

### Changed
- Tested and reverted lazy-loading — bundle size is irrelevant for Electron desktop apps
- Tested and reverted debug log removal — logs needed during active development

---

## 2026-03-23 — Transcription Overhaul

### Changed
- Replaced WhisperX with stable-ts for word-level timestamps
- Reverted to source-level transcription for better accuracy
- Per-clip transcription: each clip transcribed individually for accurate word timestamps

### Fixed
- Subtitle sync with smart 3-word grouping, gap closing, and mega-segment splitting
- Clip duration display stuck at same value after edits
- Triple-fire debug report bug
- Persist subtitle rating on each clip

---

## 2026-03-22 — Clip Extension and Editor Navigation

### Added
- Left-extend clip feature: drag audio left edge to reveal earlier content
- Undo support for clip extensions
- Extension counter showing how much a clip has been extended
- Clip extension by dragging audio past original end

### Fixed
- Editor back button navigates to clip browser instead of projects list
- Extension counter visibility and duration display after cuts
- Subtitle trimming when audio is cut
- EBUSY file lock during clip extension on Windows

---

## 2026-03-21 — Subtitle Sync and Playhead Fixes

### Fixed
- Subtitle sync replaced timeupdate with 60fps rAF loop for smooth tracking
- Transcript duplicate segments and missing beginning words
- VAD parameters tuned for dedicated mic-only recording tracks
- Re-transcribe updates clip data without full editor reinit
- Timeline playhead: split rAF loop from paused sync

---

## 2026-03-20 — Timeline Overhaul and Track Polish

### Added
- Professional timeline rebuild with ripple delete support
- Audio 2 track in timeline
- Logarithmic zoom curve anchored to playhead

### Fixed
- Trim enforcement, timeline collapse, and end markers
- Audio bounds enforced as clip boundary (seeking clamped, subs/captions auto-trimmed)
- Timeline track backgrounds now fill full viewport width
- Subtitle/caption trim deferred to mouse-up (not during drag)
- Extension counter on shrink operations

### Changed
- Distinct track colors with audio borders
- Timeline subtitle preview overlays styled for clip browser

---

## 2026-03-19 — Subtitle Workflow and Zoom

### Added
- Create/delete/caps/smart-edit workflow for subtitles
- Zoom centering on active content
- Whisper slang dictionary support
- Smooth 60fps playhead via requestAnimationFrame loop (max zoom 20x)

### Fixed
- Zoom blend transitions
- Draggable segment behavior
- Delete key: regular delete for sub/cap, ripple only for audio
- Preview subtitles built from 3-word micro-segments
- WhisperX initial_prompt passed via asr_options in load_model
- Caption editing target accuracy
- Audio playback control and undo behavior

### Changed
- Timeline track labels enlarged, colored letter badges removed
- Right panel text increased from 10px to 12px

---

## 2026-03-18 — Editor UX Polish and Presets

### Added
- Effect preset management: save, rename, update, delete user presets
- Animation and segment mode saved in effect presets
- Mini player bar in editor
- Clip status indicators in project list

### Fixed
- Caption preset crash
- Template preset isolation (removed built-in presets that conflicted)
- Undo on clip load
- Preset indicators (distinct per-panel)
- Dropdown z-index issues
- Punctuation toggle: dropdown visibility decoupled from character removal
- Karaoke animation anchor (pop upward instead of downward)
- Title centering and zoom anchor in editor

### Changed
- Presets filtered by panel type
- Punctuation settings saved with presets

---

## 2026-03-17 — Timeline Operations and Deep Text Effects

### Added
- Caption segment operations: split, cut, context menus
- Deep text effects system: stroke, glow, shadow, background
- Smooth stroke rendering with draggable effect ordering
- Independent effect presets with highlight glow matching
- Animated subtitle support

### Fixed
- Timeline split, resize, and right-click behavior
- Whisper alignment drift (mid-segment)
- Karaoke word skipping
- Audio split behavior
- Caption display and preview zoom/pan
- Timeline zoom anchor
- Merged subtitle bar display

---

## 2026-03-16 — Inline Toolbar and Text Effects

### Added
- Vizard-style compact inline toolbar inside canvas
- Text effects wired to stores: stroke/shadow color, opacity, line spacing
- Cross-store undo for all styling changes
- Punctuation UI redesigned with dropdown toggle and red X for removed items

### Fixed
- Toolbar positioning and color picker overflow
- Color picker HSV model accuracy
- Stroke rendering (now renders outside text)
- Punctuation stripping in preview
- Playhead line clipped to timeline bounds

---

## 2026-03-15 — Left Panel Rebuild and Subtitle Improvements

### Added
- Re-transcribe per clip feature
- Subtitle gap closing during continuous speech (only gap on 1s+ silence)
- Layout templates: save, load, and apply caption + subtitle positions and styling

### Fixed
- 6 left panel issues: slider, segment mode, active indicator, sizes, resize
- 5 left panel issues: word splitting, inline editing, active word, padding, slider range
- Timecode popover overflow
- Transcript paragraphs, panel sizing, preview padding, popover styling
- Subtitle centering and character-limit line breaks
- Caption textarea matches visual line wrapping when editing
- Caption/subtitle centering accuracy
- Subtitle double-click (correct panel ID)
- WhisperX alignment dropout: merge aligned segments with raw transcription

### Changed
- Left panel rebuilt with 8 corrections matching Vizard reference
- Removed 2L subtitle mode, reduced character limit
- Layout templates wired into Brand Kit panel with editable font size inputs

### Removed
- Color picker from left panel (moved to inline toolbar)

---

## 2026-03-14 — Editor Shell Rebuild (shadcn/ui)

### Added
- Tailwind CSS and shadcn/ui with 15 components
- Editor layout shell with resizable panels
- Left panel with Transcript and Edit Subtitles tabs
- Right panel with 6 drawers (AI Tools, Audio, Brand Kit, Subtitles, Text, Upload)
- Top toolbar with editable title, clip navigator, and save dropdown
- Center preview panel with video player, draggable overlays, and zoom controls
- Full timeline with zoom, scrubbing, tracks, and segment interactions
- Latina Essential as default font for subtitles and captions

### Fixed
- Timeline waveform extraction, video duration, auto-scroll
- Timeline waveform height, ruler alignment, segment overlap prevention
- Font rendering, text scaling, and topbar title behavior
- 6 preview/editor issues: font weight, line mode, zoom, toolbar position

### Changed
- Timeline overhauled: smooth scrolling, unified playhead, polygon waveform

---

## 2026-03-13 — Editor Modular Rewrite

### Changed
- Decomposed 2,654-line editor monolith into modular Zustand architecture (6 stores)
- Subtitle/caption overlays scale proportionally with preview container

### Fixed
- 10 editor issues resolved across 3 phases
- Blank editor: subscribe to store clip instead of ref guard
- Editor crash from renderer-side waveform extraction
- Karaoke subtitle uses fixed phrase chunks with moving highlight
- Karaoke subtitle sync
- Timeline zoom slider and video trim handles
- AI hashtag generation (#eo corrected to #eggingon)

---

## 2026-03-12 — Editor Tabs and Settings Overhaul

### Added
- YouTube OAuth 2.0 credential storage in Settings
- Meta and TikTok credential fields in Settings

### Fixed
- Settings heading consistency
- 21 editor issues across subtitles, captions, transcript, and timeline
- Blank editor: move clipDuration above hooks that reference it
- Blank screen from rename fullProj to proj reference in ClipBrowser
- Projects showing 0 clips (unwrap IPC response)
- Clip display: use selProj for ClipBrowser, show clipCount in project list

### Changed
- Replaced stacked API cards with pill-bar UI in Settings

---

## 2026-03-11 — Recordings and Projects Polish

### Added
- Recordings view: compact grid layout, multi-select, mark-as-done, sort
- Projects view: multi-select, delete

### Fixed
- Whisper detection on Windows: use cmd /c PATH injection for DLL resolution
- 0 clips bug: whisper timestamps were NaN due to string/number mismatch

### Changed
- Projects view uses flat list with select/delete (removed auto-grouping)

---

## 2026-03-10 — AI Clip Generation

### Added
- AI clip generation pipeline with Claude-powered highlight detection
- Play style auto-update with threshold stepper and profile diff modal
- Pipeline logs: grouped folders, select/delete, proper cards in collapsible groups

### Fixed
- energy_scorer.py Unicode crash (PYTHONIOENCODING=utf-8 and Python -X utf8)
- Claude model ID corrected to claude-sonnet-4-20250514
- Pipeline log timestamps
- Monthly API cost breakdown only counts videos with actual API cost
- Log list full-width when no log selected
- Toggle log viewer closed when clicking same log again

### Changed
- Status icons replaced with PASS/FAIL pills, overflow text fixed
- Clip preview: removed black bars, added seek bar and subtitle overlay
- Larger clip preview with stacked approve/reject and badge tooltips

---

## 2026-03-09 — Projects Overhaul and Clip Browser

### Changed
- Overhauled Projects tab: video player, score/10, auto-titles, inline transcript

### Fixed
- Approve/reject not updating UI immediately in ClipBrowser

---

## 2026-03-08 — Editor Topbar and Save/Queue

### Added
- Side-by-side Save and Queue buttons with gradient styling (violet-purple-lavender / green-lime-yellow)
- Hashtag warning in editor

### Fixed
- Topbar: undo/redo wiring, settings icon removal, dropdown toggle, title sizing
- Left panel: timecodes, text-guided word merging, transcript independence
- Single click places cursor, double click selects all in word editor
- Timecode inputs: fixed width, minimal padding
- Left panel default 50/50 split with preview

### Changed
- Toolbar split into 2 rows with scroll/hold-to-repeat, B/I/U wired to store
- Right rail icons/labels enlarged with resizable drawer panel

### Removed
- Color picker from left panel (moved elsewhere)
- Save dropdown (replaced with side-by-side buttons)

---

## 2026-03-07 — Subtitle Sync and Whisper Improvements

### Fixed
- Subtitle sync: re-encode clips for frame-accurate cuts with syncOffset wiring
- Broken whisperx word timestamps with even distribution fallback

### Added
- Audio-aware word timestamp post-processing (Tier 1)

### Removed
- JS-side timestamp fallbacks (fail visibly instead of using fake data)
- Stale whisper.cpp files and store keys

---

## 2026-03-06 — Initial Build (Phases 1-8)

### Added
- Editor view with full shell: topbar, transcript/subtitles panels, center preview, right rail with AI/Subtitles/Brand/Media drawers, and resizable timeline
- Local infrastructure: FFmpeg, Whisper, project file management
- Clip generation pipeline with highlight detection
- Projects view for local project data
- Editor core: real data, video playback, interactive editing
- AI title/caption generation in Editor
- Render pipeline with Ready to Share button and batch render
- Queue system with local rendered clips and platform stubs
- Recordings view (rewritten from cloud-based Upload view)

### Removed
- Vizard API integration
- Cloudflare R2 cloud storage
- All cloud-dependent code from main process and App.js
