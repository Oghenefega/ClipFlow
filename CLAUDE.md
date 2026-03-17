# ClipFlow — Desktop App for Gaming Content Pipeline

## Git Workflow
Always commit and push directly to master. Do not create pull requests or feature branches.

## Workflow Orchestration

### Plan Mode
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately — don't keep pushing.
- Write detailed specs upfront to reduce ambiguity.

### Subagents
- Use subagents (Task tool) to keep the main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- One task per subagent for focused execution.

### Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern.
- Write rules that prevent the same mistake from recurring.
- Review `tasks/lessons.md` at session start.

### Verification Before Done
- Never mark a task complete without proving it works (build, test, demonstrate).
- Ask yourself: "Would a staff engineer approve this?"

### Task Management
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items.
2. **Track Progress**: Mark items complete as you go.
3. **Explain Changes**: High-level summary at each step.
4. **Capture Lessons**: Update `tasks/lessons.md` after corrections.

### Core Principles
- **Simplicity First**: Make every change as simple as possible. Minimal code impact.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **Demand Elegance (Balanced)**: For non-trivial changes, pause and ask "is there a more elegant way?" Skip this for simple, obvious fixes.
- **Autonomous Bug Fixing**: When given a bug report, just fix it. Point at logs/errors, then resolve. Zero hand-holding required.

## What This Project Is

ClipFlow is an **Electron + React** desktop app for a gaming content creator named **Fega**. It automates the full pipeline from OBS recording to published short-form clips across YouTube Shorts, TikTok, Instagram Reels, and Facebook Reels.

**The pipeline:** Record gameplay (OBS) → Detect & rename files → Generate clips locally (FFmpeg + Whisper + highlight detection) → Edit clips in built-in editor (subtitles, captions, AI titles) → Render with FFmpeg → Schedule & publish to 6 platform accounts.

## Owner / User

- **Creator:** Fega (YouTube: @Fega, TikTok: @fega, Instagram: @fegagaming)
- **Content:** Vertical gaming clips (9:16) from OBS Studio with Vertical Canvas plugin
- **Games:** Arc Raiders (main), Rocket League, Valorant, Egging On, Deadline Delivery, Bionic Bay, Prince of Persia
- **Publishing:** 8 clips/day across 6 days (Mon–Sat), 48 clips/week total
- **Platform accounts:** YT-Fega, IG-fegagaming, FB-Fega Gaming, TT-fega, YT-ThatGuy, TT-thatguyfega

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop shell | Electron 28 |
| UI | React 18 (CRA build) |
| CSS | Tailwind CSS 3 + shadcn/ui (Radix primitives) |
| State (app-level) | React useState/useEffect in App.js, passed as props |
| State (editor) | Zustand 5 (6 isolated stores) |
| Persistence | electron-store 8 |
| File watching | chokidar 3 |
| Video processing | FFmpeg (local binary) |
| Transcription | whisper.cpp (local binary) |
| AI generation | Anthropic API (Claude Sonnet 4 / Opus 4) |
| Icons | lucide-react |
| Fonts | DM Sans (UI) + JetBrains Mono (code/filenames) via Google Fonts CDN |

## Project Structure

```
ClipFlow/
├── public/
│   ├── index.html
│   └── icon.png
├── src/
│   ├── main/
│   │   ├── main.js              ← Electron main process, 31 IPC handlers, file watcher
│   │   ├── preload.js            ← Context bridge (window.clipflow API)
│   │   ├── projects.js           ← Project/clip CRUD on disk (JSON files)
│   │   ├── ffmpeg.js             ← FFmpeg wrappers (probe, extract, cut, render)
│   │   ├── whisper.js            ← Whisper transcription wrapper
│   │   ├── highlights.js         ← Audio analysis + highlight detection
│   │   ├── render.js             ← Video rendering pipeline (ASS subtitle burn-in)
│   │   └── publish.js            ← Platform API stubs (future)
│   ├── renderer/
│   │   ├── App.js                ← Shell: sidebar nav, view routing, global state, persistence
│   │   ├── components/
│   │   │   ├── Sidebar.js        ← Navigation component (7 tabs)
│   │   │   ├── shared.js         ← Reusable UI components
│   │   │   └── modals.js         ← AddGameModal, TranscriptModal, GameEditModal
│   │   ├── views/
│   │   │   ├── RenameView.js     ← File watcher, rename cards, pending/history/manage tabs
│   │   │   ├── UploadView.js     ← Recording scanner + local clip generation pipeline
│   │   │   ├── ProjectsView.js   ← Project browser + clip details (ClipBrowser)
│   │   │   ├── QueueView.js      ← Publishing schedule + weekly tracker grid
│   │   │   ├── CaptionsView.js   ← YouTube descriptions + platform caption templates
│   │   │   ├── SettingsView.js   ← Game library, watch folder, API keys, tool status
│   │   │   └── EditorView.js     ← Thin wrapper that loads editor/EditorView
│   │   ├── editor/
│   │   │   ├── EditorView.js     ← Error boundary + shell loader
│   │   │   ├── components/
│   │   │   │   ├── EditorShell.js    ← Main grid layout (preview, timeline, drawers)
│   │   │   │   ├── Topbar.js         ← Title editing + back button + render button
│   │   │   │   ├── PreviewPanel.js   ← HTML5 video player + subtitle overlay
│   │   │   │   ├── Timeline.js       ← Ruler + playhead + subtitle segment tracks
│   │   │   │   ├── TranscriptPanel.js ← Word-level transcript with seek/edit
│   │   │   │   ├── EditSubsPanel.js  ← Segment editor with timecode popover
│   │   │   │   ├── LeftPanel.js      ← Tab switcher (transcript/edit subs)
│   │   │   │   ├── RightZone.js      ← Right panel shell
│   │   │   │   ├── SubtitlesDrawer.js ← CC subtitle styling controls
│   │   │   │   ├── CaptionDrawer.js  ← Caption text/font/color editing
│   │   │   │   ├── AIToolsDrawer.js  ← AI generation (Anthropic titles/captions)
│   │   │   │   ├── BrandDrawer.js    ← Brand/SFX placeholders
│   │   │   │   ├── MediaDrawer.js    ← Media placeholder
│   │   │   │   └── RenderOverlay.js  ← Render progress overlay
│   │   │   ├── stores/
│   │   │   │   ├── useEditorStore.js   ← Project/clip data, save handler
│   │   │   │   ├── useLayoutStore.js   ← Panel widths, collapse states, zoom
│   │   │   │   ├── usePlaybackStore.js ← Video playback state (playing, time)
│   │   │   │   ├── useSubtitleStore.js ← Editable segments, styling, split/merge
│   │   │   │   ├── useCaptionStore.js  ← Caption text + formatting
│   │   │   │   └── useAIStore.js       ← AI generation state
│   │   │   ├── primitives/
│   │   │   │   └── editorPrimitives.js ← Shared editor UI components
│   │   │   └── utils/
│   │   │       ├── constants.js        ← Layout defaults, colors, UI sizes
│   │   │       ├── timeUtils.js        ← Time formatting (mm:ss.ms)
│   │   │       └── waveformUtils.js    ← Waveform peak calculation
│   │   └── styles/
│   │       └── theme.js          ← Design tokens (T object)
│   ├── components/
│   │   └── ui/                   ← shadcn/ui components (15 installed)
│   ├── lib/
│   │   └── utils.ts              ← cn() utility (clsx + tailwind-merge)
│   ├── globals.css               ← Tailwind directives + CSS variables
│   └── index.js                  ← React entry point
├── reference/
│   └── vizard-ref/               ← Editor UI reference screenshots + notes
├── tasks/
│   ├── todo.md                   ← Task tracker (plan, progress, review)
│   └── lessons.md                ← Lessons learned from corrections
├── tailwind.config.js            ← Tailwind CSS 3 config with shadcn theme
├── tsconfig.json                 ← TypeScript config (for .tsx shadcn components)
├── components.json               ← shadcn/ui config
├── package.json
├── .gitignore
└── CLAUDE.md                     ← THIS FILE
```

## How to Build & Run

```bash
# Install dependencies
npm install

# Build React frontend
npx react-scripts build

# Run Electron
npm start
```

**Important:** In `src/main/main.js`, `isDev` is set to `false` so Electron loads from the `build/` folder. If you want hot reload, set `isDev = true` and run a React dev server on port 3000 first.

### Quick Reference Commands

| Command | Purpose |
|---------|---------|
| `npm start` | Launch Electron (loads from build/) |
| `npx react-scripts build` | Production build (React → build/ folder) |
| `npm run dev` | Dev mode with React hot reload + Electron auto-reload |
| `npm run build` | Full build with electron-builder |
| `npm run pack` | Package without signing |

### ClipFlow Verification Commands

When running the global verification checklist, use these project-specific commands:

1. **Build check:** `npx react-scripts build` — must complete with no errors
2. **Dev launch:** `npm start` — app window must open
3. **Full test:** Build → launch → verify changed feature → check adjacent features

### Mandatory: Run the App After Every Change

**After completing ANY build or code change, always run `npm start` to launch the Electron app.** Do not wait to be asked. This is a non-negotiable step — every change must be visually verified in the running app before marking a task done or committing.

## Design System

The app uses a dark theme. Key tokens (from theme.js):

- **Background:** `#0a0b10` (app bg), `#111218` (surface/cards)
- **Accent:** `#8b5cf6` (purple), `#a78bfa` (light purple)
- **Status:** Green `#34d399`, Yellow `#fbbf24`, Red `#f87171`, Cyan `#22d3ee`
- **Text:** `#edeef2` (primary), `rgba(255,255,255,0.55)` (secondary), `rgba(255,255,255,0.32)` (tertiary)
- **Border radius:** sm=6px, md=10px, lg=14px, xl=20px
- **Fonts:** `'DM Sans', sans-serif` for UI, `'JetBrains Mono', monospace` for filenames/code

**UI approach:** Existing views use inline styles via the `T` (theme) object from `theme.js`. The editor is being rebuilt with shadcn/ui + Tailwind CSS. New UI work should use shadcn/ui components wherever possible.

## Current State — All 7 Views + Editor Built

### 1. Rename View (RenameView.js)
- **Watch status bar:** Green dot + "WATCHING" + folder path. Cyan dot + "OBS LOG" on right.
- **Stats cards:** Total, Today, Games, Day — all show real calculated values.
- **Sub-tabs:** Pending | History | Manage
- **Pending tab:** File cards showing OBS filename → proposed rename in yellow. Game dropdown, Day/Part spinboxes with hold-to-increment, RENAME and HIDE buttons. "Rename All" at bottom.
- **History tab:** Old→new name pairs with UNDO (moves file back to pending).
- **Manage tab:** Browse renamed files by monthly subfolder. Batch change part/day/tag.
- **Header buttons:** Refresh (re-scan folder) + Add Game (opens AddGameModal).
- File watcher uses `depth: 0` (root only) and `RAW_OBS_PATTERN` to skip subfolders and already-renamed files.

### 2. Upload View (UploadView.js / RecordingsView)
- Scans watch folder for renamed files organized by monthly subfolder.
- "Generate Clips" button triggers full local pipeline per file:
  1. Probe source (FFmpeg → duration/metadata)
  2. Create project + clips directory
  3. Extract audio to WAV (FFmpeg)
  4. Transcribe with Whisper (streaming progress)
  5. Analyze loudness (1-second segments)
  6. Detect highlights (audio energy + sentiment + keywords + pacing)
  7. Cut highlight clips (FFmpeg)
  8. Generate thumbnails
  9. Save project JSON with transcription + clips
- Progress overlay with 8-stage feedback.
- Collapsed folder state persisted to electron-store.

### 3. Projects View (ProjectsView.js)
- Grid of local projects sorted by status (processing > ready > done > error).
- **ProjectsListView:** Status badges, batch delete with confirmation.
- **ClipBrowser:** Full project with all clips.
  - Render All button (batch render unrendered clips)
  - Each clip: title (editable inline), viral score bar, duration, transcript button
  - Status dropdown (none/approved/rejected)
  - "Open in Editor" button → launches EditorView
  - Rendered clips show "Ready to Share" button

### 4. Queue View (QueueView.js)
- **Schedule tab:** Approved + rendered clips from local projects.
  - "Publish Now" → logs to tracker. "Schedule" → date picker (14 days) + time dropdowns.
- **Tracker tab:** Weekly grid (Mon–Sat × 8 time slots).
  - Cells: M (main game) / O (other game). Filled = published.
  - Template editable per week. Stats: total/48, main/other breakdown.
- Publishing order: YT-Fega → IG → FB → TT-fega → YT-ThatGuy → TT-thatguyfega (30s stagger).

### 5. Captions View (CaptionsView.js)
- **YouTube tab:** Per-game description templates with real Fega content (affiliate links, social links, stream setup).
- **Other Platforms tab:** TikTok/Instagram/Facebook templates with `{title}` and `#{gametitle}` placeholders.
- Templates persisted to electron-store.

### 6. Settings View (SettingsView.js)
- **Watch Folder:** Browse button + path input.
- **Main Game:** Pill selector from mainPool.
- **Game Library:** Horizontal pills (tag, name, hashtag, color, edit icon). Click → GameEditModal with color picker.
- **Ignored Processes:** List of EXEs to skip in OBS detection.
- **Connected Platforms:** Toggle pills with green/red pulse dots.
- **API Credentials:** Anthropic, YouTube OAuth, Meta (FB/IG), TikTok — masked display + copy buttons.
- **Output Folder:** Where rendered clips are saved.
- **FFmpeg/Whisper Status:** Shows installed version or error.

### 7. Editor (editor/ directory — modular architecture)
A full video editor for clip review/editing, split into 14 components + 6 Zustand stores:

**Components:**
- **Topbar:** Clip title editing, back button (auto-save), "Ready to Share" render button.
- **PreviewPanel:** HTML5 video player with synced subtitle + caption overlay. Karaoke highlight.
- **Timeline:** Ruler with zoom (0.5x–4x), draggable/scrubable playhead, Sub1/Sub2 tracks. Segments are selectable, draggable, resizable. Sub2 hidden when empty.
- **LeftPanel:** Two tabs — Transcript (word-level click-to-seek, active word highlight, inline editing) and Edit Subtitles (per-word hover, split/merge, timecode popover with range slider).
- **Right Drawers:**
  - AI Tools — Anthropic title/caption generation, accept/reject with history.
  - Subtitles — Font, size, color, stroke, shadow, background, position, karaoke highlight color, 1L/2L modes, sync offset slider.
  - Caption — Text editing, font family/size, color swatches, B/I/U formatting.
  - Brand/Media — Placeholders for future SFX and media overlays.
- **RenderOverlay:** FFmpeg ASS subtitle generation + burn-in with progress feedback.

**Zustand Stores:**
- `useEditorStore` — project/clip data, clipTitle, dirty flag, waveform peaks, save handler.
- `useLayoutStore` — panel widths/heights, collapse states, drawer tab selection, zoom level.
- `usePlaybackStore` — playing, currentTime, duration, seek.
- `useSubtitleStore` — editSegments array, subtitle styling (font/color/stroke/shadow/bg/position), split/merge/delete operations.
- `useCaptionStore` — captionText, font family/size, color, B/I/U formatting.
- `useAIStore` — title/caption generation results, history, accept/reject.

## Local Clip Generation Pipeline

The pipeline runs entirely locally — no cloud dependencies. Located in `src/main/`:

### Pipeline Stages (`pipeline:generateClips` IPC handler)
1. **Probe** (`ffmpeg.js`) — Extract video duration, codec, resolution.
2. **Create Project** (`projects.js`) — Project directory + clips subdirectory on disk.
3. **Extract Audio** (`ffmpeg.js`) — Source video → WAV file.
4. **Transcribe** (`whisper.js`) — WAV → word-level segments with timestamps via whisper.cpp.
5. **Analyze Loudness** (`ffmpeg.js`) — Per-second loudness levels for highlight detection.
6. **Detect Highlights** (`highlights.js`) — Scoring: audio energy + sentiment + keywords + pacing → ranked highlight candidates.
7. **Cut Clips** (`ffmpeg.js`) — Extract highlight segments as individual video files.
8. **Save Project** (`projects.js`) — Write project JSON with all metadata, clips, and transcription.

Each clip gets: title, caption, sub1/sub2 subtitle tracks, SFX slots, media slots, status, renderStatus.

### Render Pipeline (`render.js`)
1. Generate ASS subtitle file from `editSegments` + styling.
2. FFmpeg burn-in: overlay ASS subtitles onto source clip video.
3. Output to configured output folder.
4. Progress events via IPC (`render:progress`).

## IPC API (window.clipflow)

The preload bridge exposes 31+ methods to React:

### File System
```javascript
window.clipflow.pickFolder()                  // Native folder picker dialog
window.clipflow.readDir(dirPath)              // List files with metadata
window.clipflow.scanWatchFolder(folderPath)   // Scan monthly subfolders for renamed files
window.clipflow.renameFile(oldPath, newPath)  // Move/rename file (creates parent dir)
window.clipflow.exists(filePath)              // Check file exists
window.clipflow.readFile(filePath)            // Read text file
window.clipflow.writeFile(filePath, content)  // Write text file
```

### File Watcher
```javascript
window.clipflow.startWatcher(folderPath)      // Start chokidar (depth: 0, raw OBS pattern only)
window.clipflow.stopWatcher()                 // Stop watcher
window.clipflow.onFileAdded(callback)         // File added event
window.clipflow.onFileRemoved(callback)       // File removed event
```

### OBS, Shell, Dialogs
```javascript
window.clipflow.parseOBSLog(logPath)          // Parse OBS log for game detection
window.clipflow.openFolder(folderPath)        // Open in Windows Explorer
window.clipflow.saveFileDialog(options)       // Save file dialog
window.clipflow.openFileDialog(options)       // Open file dialog
window.clipflow.platform                      // 'win32' | 'darwin' | 'linux'
```

### FFmpeg & Whisper
```javascript
window.clipflow.ffmpegCheck()                 // Check FFmpeg installed (returns version)
window.clipflow.ffmpegProbe(filePath)         // Video metadata (duration, codec, resolution)
window.clipflow.ffmpegExtractAudio(src, dst)  // Extract audio to WAV
window.clipflow.ffmpegCutClip(src, dst, start, end)  // Trim video
window.clipflow.ffmpegThumbnail(src, dst, time)      // Generate JPEG thumbnail
window.clipflow.ffmpegAnalyzeLoudness(filePath)      // Per-segment loudness
window.clipflow.whisperCheck()                // Check Whisper installed
window.clipflow.whisperTranscribe(wavPath, opts)     // Transcribe → segments + words
```

### Projects
```javascript
window.clipflow.projectCreate(name, sourceFile)   // New project + clips dir
window.clipflow.projectLoad(projectId)             // Load full project JSON
window.clipflow.projectSave(projectId, data)       // Save project JSON
window.clipflow.projectList()                      // List all projects (summaries)
window.clipflow.projectDelete(projectId)           // Delete project + files
window.clipflow.projectUpdateClip(projId, clipId, updates)  // Merge updates into clip
window.clipflow.projectAddClip(projId, clip)       // Add clip to project
window.clipflow.projectDeleteClip(projId, clipId)  // Delete clip ± file
```

### Pipeline & Render
```javascript
window.clipflow.generateClips(filePath, projectName)   // Full pipeline (8 stages)
window.clipflow.onPipelineProgress(callback)           // Pipeline progress events
window.clipflow.renderClip(projectId, clipId, opts)    // Single clip render
window.clipflow.renderBatch(projectId, clipIds, opts)  // Batch render
window.clipflow.onRenderProgress(callback)             // Render progress events
```

### Anthropic AI
```javascript
window.clipflow.anthropicGenerate(opts)        // Title/caption generation (Sonnet 4)
window.clipflow.anthropicResearchGame(opts)    // Game description via web search (Opus 4)
window.clipflow.anthropicLogHistory(opts)      // Log AI picks/rejections
```

### Electron Store
```javascript
window.clipflow.storeGet(key)                  // Read persisted value
window.clipflow.storeSet(key, value)           // Write persisted value
window.clipflow.storeGetAll()                  // Read entire config
```

## Game Data Model

```javascript
{
  name: "Arc Raiders",       // Display name
  tag: "AR",                 // 1-4 char code used in filenames
  exe: ["ArcRaiders.exe"],   // OBS-detected process names
  color: "#ff6b35",          // Brand color for pills/badges
  dayCount: 24,              // How many unique days recorded
  lastDayDate: "2026-03-15", // Last date dayCount was incremented
  hashtag: "arcraiders"      // Used in clip titles and captions
}
```

**Default games:** Arc Raiders (#ff6b35), Rocket League (#00b4d8), Valorant (#ff4655), Egging On (#ffd23f), Deadline Delivery (#fca311), Bionic Bay (#06d6a0), Prince of Persia (#9b5de5)

## File Naming Convention

OBS outputs: `2026-03-03 18-23-40.mp4` (timestamp format, may also have `_` instead of space, may end with `-vertical.mp4`)

ClipFlow renames to: `2026-03-03 AR Day25 Pt1.mp4`
- Date from original filename
- Tag from detected/selected game
- Day = unique calendar day count for this game
- Pt = sequential part within same day's session (OBS splits at ~30 min)

Files are organized into monthly subfolders: `2026-03/`, `2026-02/`, etc.

## OBS Log Parsing

OBS logs are at: `C:\Users\IAmAbsolute\AppData\Roaming\obs-studio\logs\`

The parser reads the most recent log to find which game exe was hooked by OBS's game capture source. Key behaviors:
- Vertical Canvas plugin logs look different from standard OBS
- When a game exe re-hooks, it moves to END of detection list (most recent = active game)
- Known system processes (explorer.exe, steamwebhelper.exe, dwm.exe, etc.) are ignored
- Unknown exe triggers AddGame modal for user to configure

## Weekly Publishing Template

8 slots per day (Mon–Sat), each slot is "main" or "other":

| Time | Mon | Tue | Wed | Thu | Fri | Sat |
|------|-----|-----|-----|-----|-----|-----|
| 12:30 PM | M | M | M | M | M | M |
| 1:30 PM | M | O | O | O | O | O |
| 2:30 PM | M | M | O | O | O | M |
| 3:30 PM | M | O | M | M | M | O |
| 4:30 PM | M | M | O | O | O | M |
| 7:30 PM | M | O | O | O | O | O |
| 8:30 PM | M | M | O | M | O | M |
| 9:30 PM | M | M | M | M | M | M |

M = main game clip, O = other game clip. Template is editable in Settings.

## Platform Accounts & Publish Order

1. YouTube — Fega (main)
2. Instagram — fegagaming
3. Facebook — Fega Gaming
4. TikTok — fega
5. YouTube — ThatGuy (second channel)
6. TikTok — thatguyfega (second account)

Published with 30-second stagger between platforms. Publishing APIs are stubbed in `src/main/publish.js` — not yet implemented.

## Key Design Decisions

1. **Files are NEVER auto-renamed.** User must review game/day/part and click Rename.
2. **Close = quit.** No minimize-to-tray. Closing the window exits the app.
3. **Windows-only.** Built for Windows (NTFS paths, Windows file behavior).
4. **Fully local pipeline.** No cloud dependencies for clip generation — FFmpeg + Whisper run locally. Only Anthropic API is external (for AI title/caption generation).
5. **Checkbox component is purely visual** — parent element handles all click events. This prevents double-toggle bugs.
6. **Queue scheduling is manual** — user picks clip → Publish Now or Schedule (date + time). No auto-slotting into template.
7. **Editor state is isolated in Zustand stores** — 6 stores with selector subscriptions for precise re-renders.

## What's In Progress / Next

### Current: Editor UI Rebuild (Phase 10)
- Rebuilding editor UI to closely match Vizard's web editor. Reference screenshots in `/reference/vizard-ref/`.
- Using shadcn/ui components + Tailwind CSS.
- Each section: overview, left-panel, right-panel, preview, timeline, top-toolbar has annotated screenshots and notes.txt.
- **Rule:** When building/modifying any editor UI section, always read the corresponding reference folder first — look at every screenshot and read notes.txt before writing any code. Build one section at a time.

### Future Items
- Draggable caption/subtitle on preview viewer
- Inline editing on preview viewer (double-click to edit)
- Audio waveform analysis for word-level subtitle sync
- Delete segments from timeline (context menu or Delete key)
- Undo/redo stack for timeline edits
- Platform API integrations (YouTube, TikTok, Instagram, Facebook)
- Expanded font library for subtitle/caption panels
- Keyboard shortcuts (Space=play/pause, Delete=remove segment, Ctrl+Z=undo)

## Schema Migration Requirement

**Hard rule:** Every data structure change requires a migration function. No exceptions.

- If you change a schema in electron-store, write the migration BEFORE changing anything else
- Never modify stored data shapes without a migration path from the old shape to the new shape
- Migration functions go in `src/main/main.js` near the store initialization
- Each migration must handle the case where the old data doesn't exist (fresh install)
- Test migrations against both fresh installs and existing data

## Visual Design Standards

These rules prevent recurring UI issues. Follow them for every component:

| Element | Standard |
|---------|----------|
| Indicator dots | Minimum 7-8px with `boxShadow` glow (e.g., `0 0 6px <color>`) |
| Scrollbar overflow | Outer container: `overflow: 'hidden'`. Inner container: `overflow: 'auto'` |
| Long dropdowns | Split into columns or grouped sections when exceeding 10+ items |
| Badge/tag placement | Always at the list-item level, never buried in detail views |
| Font consistency | New components must match existing typography scale from `theme.js` |
| Toggle states | Green = on, gray/red = off. Never green for both states |
| Visual feedback | Every action needs confirmation: animations, color changes, or toast notifications |
| Small indicators | Must have glow/shadow to be visible on dark backgrounds |

## Coding Conventions

- React functional components with hooks
- **Existing views:** Inline styles via the `T` (theme) object from `theme.js`. No CSS files.
- **New editor UI:** shadcn/ui components + Tailwind CSS utility classes
- IPC communication through `window.clipflow` bridge
- File paths use Windows backslashes internally
- Component names: PascalCase. Functions: camelCase.
- App-level state: React useState/useEffect in App.js, passed as props
- Editor state: Zustand stores with selector subscriptions (never use `getState()` in render paths)
- Always subscribe to Zustand stores with selectors for re-render control

## GitHub

- Repo: https://github.com/Oghenefega/ClipFlow.git
- Branch: master
- Private repository
