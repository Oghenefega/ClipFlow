# ClipFlow — Technical Summary (v3)

*Last updated: 2026-03-30*
*Purpose: Onboarding document for AI assistants or collaborators who need full product context without codebase access.*

---

## 1. Product Overview

**ClipFlow** is a Windows desktop application built for gaming and streaming content creators. It automates the full content pipeline from raw OBS recordings to published clips across social media platforms.

The core problem ClipFlow solves: gaming creators record hours of footage but struggle with the time-consuming process of finding highlights, clipping them, adding subtitles, writing titles/captions, and publishing to multiple platforms on a consistent schedule. ClipFlow reduces a multi-hour manual workflow to a largely automated pipeline with human review checkpoints.

**Target market:** Gaming and streaming content creators (YouTube, TikTok, Instagram Reels, Facebook, Kick).

**Revenue model:** Subscription + optional lifetime license upgrade. This is a commercial product being built for public release, not a personal tool.

**Current state:** Development build in personal testing. Fega (the founder/sole developer) is the only tester. The app is feature-complete for its MVP scope — all four major platform integrations (TikTok, YouTube, Instagram, Facebook) are working, the AI clip detection pipeline is operational, and the subtitle editor is fully functional. No public release yet.

---

## 2. App Architecture

### Framework & Runtime

ClipFlow is an **Electron 28** desktop app with a **React 18** frontend. It runs entirely on the user's machine — there is no backend server. The only external API dependency is the Anthropic API (Claude) for AI-powered clip detection and title/caption generation. However, the AI layer is built on a pluggable provider registry — an OpenAI-compatible provider also exists, allowing the app to target DeepSeek, Mistral, Grok, Gemini, and others by changing a config value.

### Process Model

Electron apps have two processes:

- **Main process** (`src/main/main.js`): The "backend" that runs on Node.js. Handles file system operations, SQLite database, FFmpeg/Whisper subprocess spawning, OAuth flows, platform API calls, persistent storage, and window management. This is where all heavy lifting happens.

- **Renderer process** (`src/renderer/App.js`): The "frontend" that runs in a Chromium browser window. A single-page React app with 7 views (Rename, Upload, Projects, Editor, Queue, Captions, Settings). Uses a bottom sidebar for navigation.

### IPC Bridge

The two processes communicate through an IPC (Inter-Process Communication) bridge defined in `src/main/preload.js`. This file exposes ~110+ APIs on a `window.clipflow` global object that the React frontend calls. The bridge is security-isolated (`contextIsolation: true, nodeIntegration: false`) — the renderer cannot directly access Node.js or the file system.

Examples of bridge APIs:
- `window.clipflow.projectCreate(data)` — Create a new project
- `window.clipflow.whisperTranscribe(audioPath, options)` — Run speech-to-text
- `window.clipflow.tiktokPublish({accountId, videoPath, title, caption})` — Publish to TikTok
- `window.clipflow.renderClip(clipData, projectData, outputPath)` — Render final video with subtitles
- `window.clipflow.fileMetadataSearch(filters)` — Query file metadata from SQLite
- `window.clipflow.presetFormatFilename(meta, presetId)` — Generate filename from preset

### Data Storage (Three Tiers)

ClipFlow uses three complementary storage systems:

1. **SQLite database** (`data/clipflow.db`) — Structured data that needs querying: file metadata, rename history, feedback/approval tracking, custom labels. Schema v2 with migration system. Uses `sql.js` (in-memory SQLite compiled to WASM). This is the source of truth for all file tracking.

2. **electron-store** (`clipflow-settings.json`) — Key-value settings: API keys, watch folder path, games database, creator profile, naming preset preference, UI state. Encrypted JSON on disk. Good for config, bad for querying.

3. **File-based JSON** (`{watchFolder}/.clipflow/projects/{id}/project.json`) — Per-project data: clip arrays, transcription, source metadata. Lives alongside the video files.

### State Management

- **App-level state** lives in React's `useState`/`useEffect` in `App.js` and is passed down as props. This covers navigation, project lists, game database, platform accounts, and settings.
- **Editor state** is managed by **6 Zustand stores** (a lightweight state management library). Each store handles a specific domain: editor metadata, subtitles, captions, layout, playback, and AI generation. The stores use selector subscriptions for performance and share a cross-store undo/redo system.
- **Persistent state** is split between electron-store (settings, config) and SQLite (file metadata, rename history, feedback). See "Data Storage" above.

### Key Dependencies

| Library | Purpose |
|---------|---------|
| Electron 28 | Desktop app framework |
| React 18 | UI framework |
| Zustand 5 | State management (editor) |
| Tailwind CSS 3 + shadcn/ui | Styling (editor UI) |
| electron-store 8 | Persistent settings storage |
| electron-log 5 | Structured logging with rotation |
| chokidar 3 | File system watcher |
| sql.js | SQLite database (file metadata, feedback, rename history) |
| lucide-react | Icon library |
| react-resizable-panels | Draggable panel layouts |

External tools (local binaries, not npm packages):
- **FFmpeg** — Video cutting, audio extraction, thumbnail generation, subtitle burn-in, waveform analysis
- **stable-ts / whisper.cpp** — Speech-to-text transcription with word-level timestamps
- **Python venv** — Runs Whisper and energy scoring scripts

---

## 3. Core Features & Implementation

### 3.1 The Content Pipeline (End-to-End Flow)

The full pipeline from raw recording to published clip:

1. **Watch & Rename**: User points ClipFlow at their OBS recording folder. A chokidar file watcher detects new files matching the OBS naming pattern (`YYYY-MM-DD HH-MM-SS.mp4`). The user assigns a game/content type via dropdown, selects a naming preset, and optionally adds a custom label. The preset engine auto-calculates day/part numbers, detects collisions, and handles retroactive renames. Files are renamed according to the selected preset format and a `file_metadata` record is created in SQLite.

2. **Import & Clip Detection**: User selects a renamed recording in the Recordings tab and clicks "Generate Clips." ClipFlow updates the file's status to `processing` in SQLite, then runs a 7-stage AI pipeline:
   - Probes the video file for metadata (duration, resolution, codec)
   - Extracts audio (16kHz mono WAV)
   - Transcribes speech via stable-ts/Whisper (word-level timestamps, dynamic game-specific vocabulary injection from the games database)
   - Runs energy analysis (Python script scores audio segments by loudness/excitement)
   - Extracts ~20 peak-energy video frames (720p stills)
   - Sends the transcript, energy data, and frames to **Claude Sonnet 4.6** with a detailed prompt about the creator's personality and game context
   - Claude returns a JSON array of 15-20 highlight clips with timestamps, titles, confidence scores, and energy levels
   - FFmpeg cuts the source video into individual clip files (stream copy, no re-encode)
   - On completion, status is set to `done` and any pending retroactive renames are applied

3. **Review & Edit**: User browses generated clips in the Projects view, approves/rejects them, and opens approved clips in the Editor for subtitle/caption editing.

4. **Render**: The render pipeline generates an ASS subtitle file, then uses FFmpeg to burn subtitles into the video. Output is a final MP4 ready for upload.

5. **Queue & Publish**: User adds rendered clips to the Queue, assigns a schedule date/time, and publishes. ClipFlow uploads to all connected platforms with 30-second staggering between platforms.

### 3.2 SQLite Database & File Metadata

The app uses a SQLite database (`data/clipflow.db`) as the source of truth for all file tracking. Schema version 2 with automatic migrations on startup.

**Tables:**

**`file_metadata`** — Core rename system. Every renamed file gets a record.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT PK | UUID |
| `original_filename` | TEXT | OBS filename before rename |
| `current_filename` | TEXT | Current filename after rename |
| `original_path`, `current_path` | TEXT | Full file paths |
| `tag` | TEXT | Game/content code (AR, RL, JC, etc.) |
| `entry_type` | TEXT | `"game"` or `"content"` |
| `date` | TEXT | Recording date (YYYY-MM-DD) |
| `day_number` | INTEGER | Streaming day count for this game |
| `part_number` | INTEGER | Part within a day |
| `custom_label` | TEXT | Optional freeform label (e.g., "ranked-grind") |
| `naming_preset` | TEXT | Which preset generated this filename |
| `duration_seconds` | REAL | Video duration (from FFmpeg probe) |
| `file_size_bytes` | INTEGER | File size |
| `status` | TEXT | Lifecycle: `pending` → `renamed` → `processing` → `done` |
| `has_pending_rename` | INTEGER | 1 if a retroactive rename is queued (file in use) |
| `pending_rename_data` | TEXT | JSON of the queued rename operation |
| `renamed_at`, `created_at`, `updated_at` | TEXT | Timestamps |

Indexed on: `tag`, `date`, `(tag, date)`, `(tag, custom_label)`, `status`.

**`rename_history`** — Full undo chain with cascade support.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT PK | UUID |
| `file_metadata_id` | TEXT FK | Links to file_metadata |
| `action` | TEXT | `"initial_rename"` or `"retroactive_part"` |
| `triggered_by` | TEXT FK | ID of rename that caused this retroactive rename |
| `previous_filename`, `previous_path` | TEXT | State before rename |
| `new_filename`, `new_path` | TEXT | State after rename |
| `metadata_snapshot` | TEXT | Full JSON snapshot of file_metadata before change |
| `undone` | INTEGER | Soft-delete flag (1 = undone) |

Undo is cascading: undoing a rename also undoes all retroactive renames it triggered (via `triggered_by` foreign key chain).

**`custom_labels`** — Autocomplete cache for the label input.
- Tracks `(tag, label)` pairs with `use_count` for ranking suggestions.

**`feedback`** — AI clip approval/rejection tracking (pre-existing, migrated from old feedback.db).
- Stores decisions on AI-generated clips with game tag, timestamps, confidence, transcript segments.

**Search filter types** for `metadata:search`:
- `byTag` — All files for a game tag
- `byStatus` — By status (pending, renamed, processing, done)
- `byTagDate` — Files for a specific tag + date combo
- `byTagLabel` — Files for a specific tag + custom label
- `byDateRange` — Date range query
- `allRenamed` — All non-pending files (used by Recordings tab)

### 3.3 Naming Preset Engine

The preset engine (`src/main/naming-presets.js`) generates filenames from metadata according to 6 preset formats. Users pick a default preset in Settings; it can be overridden per-rename.

**6 Presets:**

| Preset ID | Format | Example |
|-----------|--------|---------|
| `tag-date-day-part` | `TAG YYYY-MM-DD DayN PtN.mp4` | `AR 2026-03-15 Day30 Pt1.mp4` |
| `tag-day-part` | `TAG DayN PtN.mp4` | `AR Day30 Pt1.mp4` |
| `tag-date` | `TAG YYYY-MM-DD.mp4` | `AR 2026-03-15.mp4` |
| `tag-label` | `TAG label.mp4` | `AR ranked-grind.mp4` |
| `tag-date-label` | `TAG YYYY-MM-DD label.mp4` | `AR 2026-03-15 ranked-grind.mp4` |
| `original-tag` | `TAG original-obs-name.mp4` | `AR 2026-03-15 14-30-22.mp4` |

**Key behaviors:**
- **Day calculation:** `calculateDayNumber(gameEntry, recordingDate)` increments `dayCount` on the game entry when a new date is seen, reuses existing count for same date. Updates `lastDayDate` on the game in electron-store.
- **Part numbering:** `getNextPartNumber(meta, presetId)` queries SQLite for `MAX(part_number)` by the preset's collision key (tag+date, tag+day, tag+label, etc.).
- **Collision detection:** `findCollisions(meta, presetId)` checks if a filename would collide with an existing file. Only applies to presets without `alwaysShowParts`.
- **Retroactive renaming:** When a collision is detected with an existing single file (no part number), the engine retroactively renames the existing file to add `Pt1`, then assigns `Pt2` to the new file. If the existing file is currently being processed by the pipeline, the rename is queued via `has_pending_rename=1` + `pending_rename_data` JSON on the file_metadata record and applied when the pipeline completes.
- **Label validation:** Blocks invalid characters (`\ / : * ? " < > |`) in custom labels.
- **Date extraction:** Parses `YYYY-MM-DD` from filename, falls back to `fs.statSync().birthtime`, final fallback to today's date.

### 3.4 AI Clip Detection

The AI pipeline (`src/main/ai-pipeline.js`) is the core differentiator. It uses Claude's vision capabilities to analyze both the transcript and visual frames from a recording.

**How it works:**
- The system prompt (`ai-prompt.js`, ~444 LOC) is built from 7 sections: task definition, creator profile, game context, clip selection rules, clip boundary rules, output format (JSON schema), and few-shot examples.
- **Creator profile** drives clip selection: the user's archetype (hype, competitive, chill, variety), freeform personality description, signature phrases, and ranked moment priorities (funny, clutch, emotional, fails, skillful, educational). Clip selection rules are dynamically ordered by the user's moment priority ranking.
- **Game-specific context** comes from editable "game profiles" (`data/game_profiles.json`) — each game has a detailed play style description that evolves over time via AI-generated profile updates after enough sessions. For `entry_type: "content"` files, the prompt uses a "CONTENT CONTEXT" header instead of game-specific context, and skips the game profile evolution system.
- **Dynamic Whisper vocabulary:** Game-specific terms are looked up from the games database and passed to Whisper via `opts.gameVocab` at transcription time. No more hardcoded game terms in the transcription module.
- **Few-shot examples use three-tier blending** that adapts as the system learns:
  - Cold start (0 approved clips): 5 static archetype-matched examples from `data/archetype-examples.json`
  - Warming up (1-19 approved clips): real approved clips + static padding to 5 minimum
  - Dialed in (20+ approved clips): only real approved clips from the feedback database, no static examples
- Claude returns structured JSON with clip boundaries, titles, energy levels, peak quotes, and confidence scores (0.50–1.00).

**Pipeline status lifecycle:**
- `fileMetadataId` is passed through the entire pipeline from the Recordings tab
- `updateFileStatus(fileMetadataId, status)` updates SQLite at each stage: `renamed` → `processing` → `done`
- On failure, status reverts to `renamed` (file stays visible in Recordings)
- On completion, `applyPendingRenames(fileMetadataId)` checks for queued retroactive renames and executes them

**Model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`) via the pluggable provider registry, 120-second timeout, 4,096 max output tokens. Cost is logged per call. The provider can be switched to any OpenAI-compatible API via the dev dashboard.

### 3.5 AI Title & Caption Generation

Separate from clip detection, the AI store in the editor (`useAIStore.js`) calls Claude to generate title and caption suggestions for individual clips. The user can accept, reject, or regenerate. Rejected suggestions are tracked and excluded from future generations. Tone is driven by the creator's archetype and personality description rather than explicit mode toggles — the same profile that drives clip detection also shapes title/caption voice.

### 3.6 Subtitle/Caption Generation & Editing

**Transcription** uses stable-ts (a wrapper around OpenAI's Whisper) running locally via a Python subprocess. The `large-v3-turbo` model provides word-level timestamps. Game-specific vocabulary is dynamically injected per file from the games database entry (no hardcoded terms).

**The Editor** is a full-featured subtitle timeline editor with:
- Visual timeline with draggable/resizable subtitle segments
- Word-level timing adjustment
- Split/merge segments
- Multi-track subtitles (sub1 + sub2)
- Separate caption track (for platform captions vs. burned-in subtitles)
- Global styling controls (font, size, color, stroke, shadow, glow, background)
- Preview panel showing subtitles overlaid on video
- Cross-store undo/redo (Ctrl+Z/Y works across all editor state)

**Rendering** generates an Advanced SubStation Alpha (.ass) subtitle file, then uses FFmpeg's subtitle filter to burn the styled text into the video. Default style: Latina Essential font, 52px, white with green highlights, black stroke.

### 3.7 Multi-Platform Publishing

ClipFlow publishes directly to platform APIs from the desktop app (no intermediary server). Each platform has its own OAuth module and publish module.

**How OAuth works:** When a user clicks "Connect" for a platform in Settings, ClipFlow:
1. Spins up a temporary localhost HTTP server on a platform-specific port (TikTok: 8080, YouTube: 8082, Meta: 8083)
2. Opens the platform's OAuth consent screen in the user's default browser
3. The user authorizes the app; the platform redirects back to localhost with an auth code
4. ClipFlow exchanges the code for access/refresh tokens
5. Tokens are encrypted using Windows DPAPI (via Electron's `safeStorage`) and stored in a separate `clipflow-tokens.json` file
6. The temporary server shuts down after 2 minutes

**Instagram uses a separate OAuth flow** (`instagram-oauth.js`) with Electron's `BrowserWindow` instead of the default browser, to handle the Instagram-specific authorization session independently from Facebook. This was introduced to fix a race condition where shared Meta OAuth sessions caused token conflicts between Facebook and Instagram connections.

All flows use PKCE (Proof Key for Code Exchange) for security.

**How uploads work:** Each platform has different upload mechanics:
- **TikTok**: Chunked upload (10MB per chunk) via Content Posting API v2. Polls for completion every 10 seconds. Sandbox mode forces all posts to private.
- **YouTube**: Resumable upload via YouTube Data API v3. 10MB chunks with `Content-Range` headers. Returns video resource on completion. Default category: Gaming (20).
- **Instagram**: Resumable upload to Meta's `rupload.facebook.com`, then creates a Reels media container, polls until `FINISHED`, then publishes. Rate limited to 25 posts per 24 hours.
- **Facebook**: Multipart form-data upload to `graph-video.facebook.com` using page access tokens (not user tokens).

**Caption templates** are configurable per platform. Users set templates with placeholders like `{title}` and `#{gametitle}` that get filled at publish time.

**Staggered publishing:** When publishing to multiple platforms, ClipFlow waits 30 seconds between each platform upload to avoid rate limits and ensure reliability.

### 3.8 The Queue & Scheduling System

The Queue view (`QueueView.js`) manages when and where clips are published.

**Weekly template system:** Users define a weekly publishing schedule with time slots for each day (Monday–Saturday, Sunday off by default). Each slot can be tagged as "main game" or "other game." Templates can be saved and loaded, with month-specific overrides.

**Scheduling is manual:** Users explicitly assign clips to time slots — the system does not auto-fill the schedule. This is a deliberate design choice.

**Tracker integration:** A built-in tracker logs all published clips with metadata (date, time, game, platforms, source file) for the user to review their publishing history.

### 3.9 Credential Storage

OAuth tokens are stored using **Electron's `safeStorage` API**, which uses the operating system's credential encryption:
- **Windows:** DPAPI (Data Protection API) — encrypted with the user's Windows login credentials
- **Fallback:** Base64 encoding if OS encryption is unavailable (not secure, but prevents plaintext)

Tokens are stored in a separate electron-store file (`clipflow-tokens.json`), not in the main settings store. Each account record includes encrypted `accessToken`, `refreshToken`, `expiresAt`, platform-specific IDs, display name, and avatar URL.

Token refresh happens automatically before publish operations. Each platform has its own refresh mechanism (TikTok: refresh_token grant, YouTube: refresh_token grant, Meta: long-lived token re-exchange before 60-day expiry).

---

## 4. App Tabs & User Flow

The app has a bottom sidebar with 7 tabs, plus a first-run onboarding wizard. Each tab maps to a stage in the content pipeline — files flow through the tabs in order from left to right.

### Onboarding (first launch only)

Three-step wizard that builds the user's creator profile before they touch anything else:
1. **Archetype** — Pick one of 4 content archetypes (Hype, Competitive, Chill, Variety) via color-coded cards. Each sets default moment priorities.
2. **Moment Priorities** — Drag-to-reorder 6 moment types (funny, clutch, emotional, fails, skillful, educational). This ranking directly controls what the AI prioritizes when detecting clips.
3. **Personality Description** — Freeform text describing streaming style. Flows into AI prompts as `userContext`.

Can be skipped (sets defaults). Can be re-edited later in Settings → AI Preferences. Saves `creatorProfile` + `onboardingComplete: true` to electron-store. Existing users with pre-configured profiles auto-skip via migration.

### Tab 1: Rename

**Purpose:** Raw OBS recordings → structured filenames with metadata, tracked in SQLite.

A chokidar file watcher monitors the configured watch folder (root only, depth=0) for OBS-pattern filenames (`YYYY-MM-DD HH-MM-SS.mp4`). Detected files appear in the Pending sub-tab. For each file, the user selects:
- **Game/content type** from dropdown (auto-fills from last used)
- **Naming preset** (defaults to global setting, overridable per-file)
- **Custom label** (if using a label-based preset, with autocomplete from SQLite)
- **Day number** (auto-calculated from game's `dayCount`/`lastDayDate`)
- **Part number** (auto-calculated from SQLite query of existing files)

On rename: the preset engine generates the filename, checks for collisions (triggering retroactive renames if needed), renames the physical file, creates a `file_metadata` record in SQLite, and logs to `rename_history`.

**Three sub-tabs:**
- **Pending** — New files from file watcher, waiting to be renamed
- **Manage** — All renamed files loaded from SQLite, browseable by month. Supports re-rename operations.
- **History** — Recent renames from SQLite's `rename_history` table with cascading undo. Current session renames shown separately from previous sessions.

**Connection to next tab:** Renamed files (status = `renamed` in SQLite) appear in the Recordings tab for clip generation.

### Tab 2: Recordings

**Purpose:** Trigger the AI clip generation pipeline on renamed recordings.

**Data source:** SQLite — queries `file_metadata` with `allRenamed` filter (all non-pending files). No filesystem scanning. Files grouped by month from the `date` column.

Each file shows: colored game tag badge, filename, file size, and status badge (`renamed`, `processing %`, `done` with clip count). Selecting a file and clicking "Generate Clips" triggers the full AI pipeline (see Section 3.1), which updates status in SQLite throughout.

**Pipeline progress panel:** Real-time multi-step progress — Analyzing → Creating Project → Extracting Audio → Transcription → Energy Analysis → Frame Extraction → Claude Analysis → Cutting Clips → Saving.

**Profile diff modal:** When the AI detects the creator's play style has evolved (enough new sessions), it shows a diff of the proposed game profile update for approval.

**Status lifecycle in SQLite:** `renamed` → `processing` (pipeline start) → `done` (pipeline success) or back to `renamed` (pipeline failure, so file stays visible).

**Connection to next tab:** Each processed recording creates a Project. Projects appear in the Projects tab.

### Tab 3: Projects

**Purpose:** Review, approve, and manage AI-generated clips.

**Two sub-views:** A project list (all processed recordings with clip count, game, status) and a clip browser (opens when selecting a project). The clip browser shows each clip with:
- 9:16 video preview with subtitle overlay during playback
- Title (editable inline), game tag, confidence score
- Approve / Reject buttons (status: none → approved → rejected)
- "Edit" button to open in the full Editor
- Batch actions: approve all, reject all, batch render

**Connection to next tabs:** Clicking "Edit" on a clip opens the Editor tab. Approved clips become available in the Queue for publishing. Batch render exports all approved clips with current subtitle styling.

### Tab 4: Editor

**Purpose:** Full clip customization — subtitles, captions, timing, styling, rendering.

Four-panel layout filling the entire window:
- **Left panel:** Transcript view (word-level, click to create subtitle segments), subtitle segment editor, subtitle effects controls
- **Preview panel:** 9:16 video player with live subtitle + caption overlay, playback controls, scrub bar
- **Right panel:** Styling controls — font family/size, color (hex picker), stroke width/color, shadow, glow, background, animation type (scale, grow-from), per-segment or global application
- **Timeline panel:** Waveform visualization, audio segment split/delete/ripple-delete, clip boundary handles for trimming start/end

**Key capabilities:** Dual subtitle tracks (sub1 + sub2), per-word timestamps from Whisper, emoji overlays, animation effects, SFX mixing, template save/load, and cross-store undo/redo (snapshots the entire editor state across all 6 Zustand stores).

**Connection to next tab:** "Render" button exports the final clip via FFmpeg with burned-in ASS subtitles. Rendered clips are saved back to the project and become publishable in the Queue.

### Tab 5: Queue

**Purpose:** Schedule and publish clips to connected social platforms.

**Two main sub-tabs:** A clip picker showing approved clips ready to publish, and a weekly schedule grid (Mon–Sun × configurable time slots like 12 PM, 3 PM, 8 PM). Each slot can be tagged as "main game" or "other game." Users assign clips to time slots manually (no auto-scheduling — deliberate design choice).

**Publishing:** "Publish Now" for immediate multi-platform upload, or scheduled publish at a specific date/time. Shows real-time per-platform progress (TikTok → Instagram → Facebook → YouTube, 30-second stagger). Caption templates from the Captions tab are auto-applied per platform.

**Publish logs:** History of all past publishes with timestamp, platform, status, and clip metadata.

**Badge:** The Queue tab shows a count badge of approved clips waiting to be published.

### Tab 6: Captions

**Purpose:** Manage YouTube descriptions and per-platform caption templates.

**Two sub-tabs:**
- **YouTube:** Per-game description templates with social links, hashtags, equipment links. Generated from a master template, editable per game. Copy-to-clipboard button.
- **Other Platforms:** Short caption templates for TikTok, Instagram, Facebook with `{title}` and `#{gametitle}` placeholder replacements. TikTok also has a "Direct Post" vs "Send to Inbox" mode toggle.

**Connection to Queue:** Templates are pulled and auto-filled during publishing so each platform gets correctly formatted captions without manual entry.

### Tab 7: Settings

**Purpose:** App configuration — the foundation every other tab depends on.

**Sections:**
- **Watch Folder** — Path where OBS outputs recordings (drives Rename + Recordings tabs)
- **Main Game Pool** — Which games are "primary" (affects Queue scheduling slots)
- **Games Library** — Split into two sections:
  - **Games** (`entryType: "game"`) — Add/edit games: name, tag (abbreviation), color, hashtag, day count, last day date. Tag uniqueness validated against all entries (red border + error on duplicate, save disabled).
  - **Content Types** (`entryType: "content"`) — Non-game content categories (e.g., "Just Chatting" / JC). Same fields, purple default color, separate "+ Add Content Type" button.
- **Naming Preset** — Card with 6 radio-style options showing label + example filename format. Persists selection to electron-store as the global default.
- **API Credentials** — Pill-bar toggle between: Anthropic (API key), YouTube (OAuth client ID/secret), Instagram (App ID/secret), Facebook/Meta (App ID/secret), TikTok (Client key/secret). Masked display (first 4 + last 4 chars).
- **Connected Accounts** — OAuth connect/disconnect buttons per platform with status indicators
- **Output/SFX Folders** — Where rendered clips and sound effects are stored
- **Whisper Setup** — Python venv path for transcription
- **AI Preferences** — Creator profile editor (archetype selector, personality description textarea, moment priority drag-to-reorder). Same data as onboarding, editable at any time.
- **FFmpeg & Whisper Status** — Shows if installed and working
- **Style Guide** — Freeform text describing visual/audio branding (passed to Claude)
- **Dev Dashboard** (hidden) — Click version number 7 times to unlock. Three tabs: LLM provider switcher (Anthropic ↔ OpenAI-compatible with baseUrl/apiKey/model config + connection test), electron-store key inspector (list/edit/delete), and pipeline execution logs with cost tracking.

### Pipeline Flow Diagram

```
OBS Recording (.mp4)
       ↓
  [ Rename ] ── preset engine → structured filename + SQLite file_metadata record
       ↓
  [ Recordings ] ── reads from SQLite → AI pipeline → status: processing → done
       ↓
  [ Projects ] ── review clips, approve/reject, edit titles
       ↓
  [ Editor ] ── (optional) subtitles, captions, timing, render
       ↓
  [ Queue ] ── schedule across platforms, publish
       ↑              ↑
  [ Captions ]    [ Settings ]
  (templates)     (credentials, games/content types, naming preset, AI preferences)
```

---

## 5. Backend

**There is no backend.** ClipFlow is fully local. There is no Railway server, no API gateway, no database server. All OAuth flows use temporary localhost callback servers. All platform API calls go directly from the Electron main process to the platform's API.

The only external API dependency is the **Anthropic API** (for Claude), called directly from the main process with the user's own API key.

If a backend is ever needed (e.g., for license validation, usage analytics, or centralized OAuth app credentials), the confirmed stack decision is **Supabase + LemonSqueezy**.

---

## 6. Platform Integration Status

| Platform | OAuth | Publishing | Scheduling | Known Issues |
|----------|-------|------------|------------|--------------|
| **TikTok** | Working (PKCE, v2 API) | Working (Content Posting API) | Via queue | Sandbox mode forces all posts to `SELF_ONLY` (private). Production app approval needed for public posting. Non-standard PKCE (HEX-encoded SHA256 instead of base64url). |
| **YouTube** | Working (Google OAuth 2.0 + PKCE) | Working (Resumable Upload API v3) | Via queue | Daily quota of 10,000 units (~100 uploads). Default privacy is private. Category defaults to Gaming. |
| **Instagram** | Working (separate BrowserWindow OAuth) | Working (Reels via Graph API) | Via queue | Requires Instagram Business Account linked to a Facebook Page. Rate limited to 25 posts/24h. Uses dedicated `instagram-oauth.js` with BrowserWindow (not default browser) to avoid session conflicts with Facebook OAuth. Meta app in development mode — needs production approval. |
| **Facebook** | Working (via Meta OAuth) | Working (Page video upload) | Via queue | Uses page access tokens, not user tokens. Only supports Page video posts (not personal timeline). Uses Page avatar for profile display. |
| **X (Twitter)** | Not implemented | Not implemented | N/A | Listed as planned in product scope. No code exists. |
| **Kick** | Not implemented | Not implemented | N/A | Platform abbreviation registered in token store, but no OAuth or publish code. |

**Critical note for launch:** The Meta (Facebook/Instagram) OAuth apps were recreated fresh on 2026-03-26 and are currently in development mode, which means only designated test users can authenticate. Before public launch, the Meta app needs to go through Facebook's App Review process for the required permissions (`instagram_content_publish`, `pages_manage_posts`, etc.). Similarly, TikTok's sandbox mode restricts all posts to private — production approval is required for public posting.

---

## 7. What's Built vs. What's Planned

### Fully Built & Working
- SQLite database with schema migrations (v2: file_metadata, rename_history, custom_labels, feedback)
- Naming preset engine (6 presets, collision detection, retroactive renames, pending rename queue)
- File metadata system (full CRUD + search filters via SQLite)
- Rename history with cascading undo
- One-time migration of existing renamed files into SQLite
- Games + Content Types in games database (with `entryType` field)
- AI clip detection pipeline (Claude Sonnet 4.6 with vision + three-tier few-shot blending)
- Pipeline status tracking via SQLite (renamed → processing → done, with failure rollback)
- Dynamic Whisper vocabulary injection from games database (no hardcoded terms)
- Content type support in AI pipeline (separate prompt header, skips game profile evolution)
- Cold-start creator profile system (archetype → moment priorities → personality description)
- Onboarding wizard (3-step first-run setup, re-editable in Settings)
- Pluggable LLM provider registry (Anthropic default + OpenAI-compatible adapter)
- Full subtitle timeline editor with drag/resize/split/merge
- Caption editing (separate from subtitles)
- AI title and caption generation with feedback loop
- Video rendering with subtitle burn-in (single + batch)
- TikTok OAuth + publishing
- YouTube OAuth + publishing
- Instagram (Reels) OAuth + publishing
- Facebook (Page videos) OAuth + publishing
- Queue system with weekly schedule templates
- Staggered multi-platform publishing
- Game profile system with AI-driven profile evolution (5 games configured: AR, RL, EO, SCoG, Val)
- Encrypted credential storage (Windows DPAPI)
- Publish history logging
- Structured logging with rotation (electron-log v5)
- File watcher for OBS recordings
- Dev dashboard (hidden behind 7-click unlock: provider switcher, store inspector, pipeline logs)
- Store migrations (provider config, moment priorities, onboarding auto-completion, entryType, naming preset)
- Tag uniqueness validation in Settings game editor

### Partially Built
- **Game profiles**: 3 of 5 games have full AI context profiles (Arc Raiders, Rocket League, Egging On). 2 games (Slackers: Carts of Glory, Valorant) have minimal profiles pending more sessions.
- **`isFileInUse()` editor check**: Pipeline status check works, but editor-is-open check is still stubbed (TODO).

### Planned / Not Yet Built
- **X (Twitter) publishing**: No code exists. Would need Twitter API v2 OAuth 2.0 + media upload.
- **Kick publishing**: No code exists. Platform abbreviation is registered but nothing else.
- **Backend server**: No server exists. Confirmed stack decision: Supabase + LemonSqueezy when needed for license validation, centralized OAuth credentials, usage analytics.
- **Licensing system**: No subscription/payment/license validation code exists.
- **Auto-update**: No Electron auto-updater configured.
- **Installer/distribution**: electron-builder config exists for NSIS (Windows installer), but no CI/CD pipeline for building releases.
- **Multi-language support**: English only.
- **Cloud storage/sync**: Fully local, no cloud backup of projects or settings.
- **Rescan button**: For files that were skipped during the SQLite migration (no matching game library entry).

---

## 8. Key Files & Folder Structure

```
ClipFlow/
├── src/
│   ├── main/                          # Electron main process
│   │   ├── main.js                    # App entry point, window management, all IPC handlers
│   │   ├── preload.js                 # IPC bridge — exposes ~110+ APIs on window.clipflow
│   │   ├── database.js                # SQLite database (sql.js), schema migrations, all DB queries
│   │   ├── naming-presets.js          # Preset engine: 6 formats, collision detection, retroactive rename
│   │   ├── file-migration.js          # One-time migration of existing files into SQLite
│   │   ├── ai-pipeline.js            # 7-stage clip detection pipeline with SQLite status tracking
│   │   ├── ai-prompt.js              # System prompt builder + few-shot blending
│   │   ├── ai/                       # AI provider abstraction layer
│   │   │   ├── llm-provider.js       # Pluggable provider registry
│   │   │   ├── cost-tracker.js       # Per-model token counting + monthly cost
│   │   │   ├── providers/
│   │   │   │   ├── anthropic.js      # Native Anthropic API (multimodal, tool use)
│   │   │   │   └── openai-compat.js  # OpenAI-compatible adapter (DeepSeek, Mistral, Grok, etc.)
│   │   │   └── transcription/        # Transcription provider abstraction
│   │   ├── ffmpeg.js                 # FFmpeg wrapper (cut, probe, audio, thumbnails, waveforms)
│   │   ├── whisper.js                # Whisper transcription subprocess management
│   │   ├── render.js                 # ASS subtitle generation + FFmpeg rendering pipeline
│   │   ├── highlights.js             # Heuristic highlight detection (alternative to AI)
│   │   ├── projects.js               # Project CRUD, file-based JSON persistence
│   │   ├── game-profiles.js          # Per-game AI context management
│   │   ├── token-store.js            # Encrypted OAuth token storage (DPAPI)
│   │   ├── publish-log.js            # Publish history tracking
│   │   ├── logger.js                 # electron-log v5 wrapper
│   │   ├── pipeline-logger.js        # Per-pipeline cost/timing logs
│   │   └── oauth/                    # Platform OAuth & publishing
│   │       ├── tiktok.js             # TikTok OAuth 2.0 + PKCE
│   │       ├── tiktok-publish.js     # TikTok Content Posting API
│   │       ├── youtube.js            # YouTube/Google OAuth 2.0
│   │       ├── youtube-publish.js    # YouTube Resumable Upload API
│   │       ├── meta.js               # Meta OAuth (Facebook + Instagram shared flow)
│   │       ├── instagram-oauth.js   # Instagram-specific BrowserWindow OAuth (separate from Meta)
│   │       ├── instagram-publish.js  # Instagram Reels publishing
│   │       └── facebook-publish.js   # Facebook Page video publishing
│   │
│   ├── renderer/                      # React frontend
│   │   ├── App.js                    # Root component, navigation, top-level state
│   │   ├── views/                    # Page-level components
│   │   │   ├── OnboardingView.js     # First-run creator profile wizard (3 steps)
│   │   │   ├── RenameView.js         # File watcher + SQLite-backed rename UI (3 sub-tabs)
│   │   │   ├── UploadView.js         # Recordings — SQLite-backed file list + pipeline trigger
│   │   │   ├── ProjectsView.js       # Clip browser, project management
│   │   │   ├── QueueView.js          # Publish queue + scheduling
│   │   │   ├── CaptionsView.js       # Per-platform caption templates
│   │   │   ├── SettingsView.js       # All settings + games/content types + naming preset
│   │   │   └── modals.js             # AddGameModal, GameEditModal (shared by Settings)
│   │   ├── editor/                   # Subtitle/caption editor
│   │   │   ├── EditorView.js         # Editor entry point
│   │   │   ├── components/           # Editor panels (layout, preview, timeline, left/right panels)
│   │   │   ├── stores/               # 6 Zustand stores (editor, subtitle, caption, AI, layout, playback)
│   │   │   ├── primitives/           # Low-level editor UI elements
│   │   │   └── utils/                # Editor helper functions
│   │   ├── styles/                   # Theme object (inline styles for non-editor views)
│   │   └── hooks/                    # Custom React hooks
│   │
│   └── components/ui/                # shadcn/ui component library
│
├── data/                              # Runtime data
│   ├── clipflow.db                   # SQLite database (schema v2: file_metadata, rename_history, etc.)
│   └── game_profiles.json            # Per-game AI context (5 games: AR, RL, EO, SCoG, Val)
├── tools/                             # Python scripts (transcribe.py, energy scorer)
├── tasks/                             # Dev tracking (todo.md, lessons.md)
├── reference/                         # Documentation (this file)
├── public/                            # Static assets (icons, fonts)
├── build/                             # React build output (loaded by Electron in production)
└── package.json                       # Dependencies, scripts, electron-builder config
```

---

## 9. Known Issues & Technical Debt

### Open Bugs
- **Issue #12 — Undo captures drag intermediates**: When dragging subtitle segments on the timeline, the undo system captures intermediate positions (every 300ms debounce tick) instead of just the pre-drag snapshot. Fix planned: capture snapshot on initial pointer event.
- **MX Master horizontal scroll**: The timeline doesn't respond to horizontal scroll input from Logitech MX Master mice.
- **2 unmigrated files**: `OoA Day1 Pt1` and `CHS Day1 Pt1` have no matching game library entries, so the file migration skipped them. Need a rescan button or manual fix.

### Platform Approval Required for Launch
- **Meta (Facebook/Instagram)**: The OAuth app is in development mode. Facebook's App Review required for `instagram_content_publish` and `pages_manage_posts` permissions.
- **TikTok**: Sandbox mode forces all posts to `SELF_ONLY` (private). Production approval required.
- **YouTube**: Works in production but has a daily quota (10,000 units, ~100 uploads/day).

### Technical Debt
- **main.js is monolithic**: The main process file handles all IPC registration in one place. Could be split into route-specific modules.
- **Two styling systems**: Older views (Rename, Recordings, Projects) use inline styles via a `T` theme object. Newer views (Editor, parts of Settings) use Tailwind CSS + shadcn/ui.
- **Segment IDs are `Date.now()` integers**: Not UUIDs. `Object.entries()` converts keys to strings, breaking `===` checks.
- **No automated tests**: All testing is manual.
- **No CI/CD**: Builds run manually.
- **No error boundary**: No global React error boundary.
- **Whisper dependency is external**: Python venv at hardcoded path. Needs bundling for distribution.
- **FFmpeg is assumed installed**: Must be on system PATH.
- **`isFileInUse()` editor check stubbed**: Pipeline status check works, but editor-is-open check is a TODO.
- **History tab split**: Current session renames in local state, previous sessions from SQLite. Could be unified.

### Lessons Learned (from development)
- Always use `videoVersion` counter + cache buster when changing video `src` in React
- Never nest Radix Popover/Tooltip triggers (event propagation issues)
- Windows DLL resolution for native binaries requires `cmd /c set PATH=...&&` wrapper
- Whisper timestamps are strings, not numbers — use the `offsets` field
- Never load full video files into the renderer process (OOM crashes)

---

## Summary for Marketing/Product Decisions

**What ClipFlow does in one sentence:** It watches your OBS recordings, uses AI to find the best moments, generates subtitled clips, and publishes them to TikTok, YouTube, Instagram, and Facebook on a schedule you set.

**What makes it unique:**
1. Fully local processing — no cloud video upload for editing, no monthly storage fees
2. AI-powered highlight detection that learns the creator's style over time (via feedback loop)
3. End-to-end pipeline in one app — no switching between OBS, editing software, and social media dashboards
4. Multi-platform scheduling with per-platform caption templates
5. Flexible naming system — 6 preset formats with collision detection and auto-calculated day/part numbering

**What it needs before launch:**
1. Platform OAuth app approvals (Meta App Review, TikTok production access)
2. Bundled dependencies (FFmpeg, Whisper) or an installer that sets them up
3. Licensing/payment system (Supabase + LemonSqueezy confirmed)
4. Auto-updater
5. At minimum, basic error handling for edge cases new users will hit
