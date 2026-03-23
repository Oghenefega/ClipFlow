# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## 🔲 In Progress — Unified Logging + Bug Report System (MVP)

### Goal
Build a structured logging system that writes to local files, a "Report an Issue" UI in Settings, and proper app version tracking. Logs are readable by Claude Code during development and will later be bundled into user-submitted bug reports (submission endpoint deferred to a future session).

### Version Tracking
- Set `package.json` version to `0.1.0-alpha`
- Expose `app.getVersion()` to renderer via preload bridge
- Display version in Settings footer

### Unified Logger — `src/main/logger.js`

**What it does:** Every log call writes a structured JSON entry to a local file AND to console (for dev). Replaces scattered `console.log` calls over time.

**Log file location:** `%APPDATA%/ClipFlow/logs/` — one file per day (`clipflow-2026-03-23.log`), each line is a JSON object.

**Every log entry contains:**
```json
{
  "timestamp": "2026-03-23T14:32:01.123Z",
  "level": "info|warn|error|fatal",
  "module": "subtitles|publishing|title-generation|auth|video-processing|editor|pipeline|system",
  "sessionId": "sess_abc123",
  "message": "Human readable description",
  "context": { /* optional extra data */ }
}
```

**Module taxonomy:**

| Module | Covers |
|--------|--------|
| `system` | App startup, shutdown, crashes, migrations |
| `subtitles` | Whisper transcription, subtitle timing |
| `publishing` | TikTok/YouTube/etc. uploads |
| `title-generation` | Anthropic API calls for titles/captions |
| `auth` | OAuth flows, token refresh |
| `video-processing` | FFmpeg operations (cut, render, probe) |
| `editor` | Clip extend, recut, segment manipulation |
| `pipeline` | Auto clip generation pipeline |

**Log rotation:** Keep last 7 days of log files. Delete older on app startup.

**No external dependencies** — use `fs.appendFileSync` for simplicity. No winston/pino needed for a desktop app.

### Report UI — Settings → "Report an Issue"

| Element | Details |
|---------|---------|
| Description | Textarea — "What happened?" |
| Module selector | Multi-select checkboxes matching the module taxonomy |
| Severity | Radio: "App crashed" / "Something didn't work" / "Looked wrong" |
| Include logs | Checkbox, checked by default |
| Action | **"Export Report"** button → saves a `.json` report file via save dialog |

**MVP behavior:** Export bundles the user's description + selected module logs from the current session into a `.json` file they can send manually. Submission endpoint comes later.

### Claude Code Log Access (Development Only)
Logs written to `%APPDATA%/ClipFlow/logs/` are readable by Claude Code via `Read` tool. When debugging, I read the most recent log file to see what happened.

### Implementation Steps

- [ ] **Step 1: Version tracking** — Update package.json, expose via preload, show in Settings
- [ ] **Step 2: Create `src/main/logger.js`** — Unified logger module with file writing + console output
- [ ] **Step 3: Wire logger into main process** — Import logger in main.js, replace key console.log calls with logger calls (gradual migration, not all at once)
- [ ] **Step 4: Add IPC handlers for logs** — `logs:getModules`, `logs:getSessionLogs`, `logs:exportReport`
- [ ] **Step 5: Add preload bridge** — Expose log IPC to renderer
- [ ] **Step 6: Build Report UI in SettingsView** — New "Report an Issue" card section
- [ ] **Step 7: Log rotation** — Clean up files older than 7 days on startup
- [ ] **Step 8: Verify** — Build, launch, confirm logs write to file, confirm report export works

### File Impact

| File | Change |
|------|--------|
| `package.json` | Version → `0.1.0-alpha` |
| `src/main/logger.js` | **NEW** — Unified logger module |
| `src/main/main.js` | Import logger, replace key console.logs, add log IPC handlers, add rotation on startup |
| `src/main/preload.js` | Expose `logs:*` and `app.getVersion()` |
| `src/renderer/views/SettingsView.js` | New "Report an Issue" section + version display |

### What This Does NOT Include (Deferred)
- Railway endpoint for report submission (future session)
- Database storage for reports (future session)
- Full migration of all 41 console.log calls (gradual, per-feature)
- Remote log aggregation (Sentry, Logtail, etc.)

---

## ✅ Implemented — Clip Extension (Extend Clips Beyond Original Boundaries)

### Goal
Allow users to drag the right edge of an audio segment PAST its original clip boundary to extend the clip. When extended, new subtitle segments are pulled from the project-level transcription (already available — full source was transcribed during pipeline), and the clip video file is re-cut from the source recording with the new boundaries.

### Why This Works Without Re-transcription
The full source video transcription is stored at `project.transcription` with word-level timestamps relative to the source video. Each clip's `startTime`/`endTime` maps to positions in the source. When extending, we simply:
1. Widen the time range filter on `project.transcription.segments`
2. Re-timestamp the new segments relative to the clip
3. Re-cut the video file from source via FFmpeg

### Implementation Steps

- [x] **Step 1: Store original clip boundaries in editor**
- [x] **Step 2: Allow audio segment to extend past current duration**
- [x] **Step 3: Re-cut video on commit (mouse-up)**
- [x] **Step 4: Pull new subtitles for extended range**
- [x] **Step 5: Update waveform for new duration**
- [x] **Step 6: IPC handler `clip:extend` in main process**

### File Impact
| File | Change |
|------|--------|
| `src/main/main.js` | New `extendClip` IPC handler |
| `src/main/preload.js` | Expose `extendClip` |
| `src/renderer/editor/stores/useEditorStore.js` | Source boundaries, extend logic |
| `src/renderer/editor/stores/usePlaybackStore.js` | Duration update after re-cut |
| `src/renderer/editor/components/timeline/WaveformTrack.js` | Allow extending past duration |
| `src/renderer/editor/components/TimelinePanelNew.js` | Visual indicator for extendable range |

### Verification
- [ ] Open a clip in editor → drag right edge of audio past original end → video re-cuts with new footage
- [ ] New subtitles appear for the extended section
- [ ] Waveform updates to show the new audio
- [ ] Dragging back to original boundary or shorter works correctly
- [ ] Source file missing → graceful error, no crash

---

## 🟡 Pending Approval — AI Clip Generation System (ClipFlow_AI_Spec)

### Goal
Replace the current local highlight detection (highlights.js) with a Claude-powered AI pipeline. The new system: transcribes with BetterWhisperX, analyzes audio energy with energy_scorer.py, extracts top 20 frames, sends everything to Claude Sonnet 4.5, and returns ranked highlight clips — all automatically. Includes a learning system (SQLite feedback DB + few-shot injection + auto-updating play style profiles).

### What Changes vs Current Pipeline
The current pipeline (probe → extract audio → whisper → local highlight detection → cut clips → save project) gets **replaced** with:
- **Transcription:** whisper.js already migrated to BetterWhisperX ✅ — but now we also need SRT output for energy_scorer.py
- **Energy analysis:** NEW — calls external `D:\whisper\energy_scorer.py` as subprocess (DO NOT REWRITE)
- **Frame extraction:** NEW — FFmpeg extracts top 20 peak-energy frames at 720p
- **Claude API call:** NEW — replaces highlights.js entirely. Sends transcript + frames + system prompt → gets clip JSON
- **Clip cutting:** EXISTS — but rewired to use Claude's returned timestamps instead of local highlight scores
- **Project creation:** EXISTS — but clips now include Claude's metadata (why, peak_quote, confidence, energy_level)

### Architecture Decisions

1. **SQLite for feedback** — `better-sqlite3` npm package (sync, no async overhead, Electron-compatible). File: `data/feedback.db`
2. **Processing folder** — `C:\Users\IAmAbsolute\Desktop\ClipFlow\processing\` with 6 subfolders (transcripts, energy, frames, claude, clips, logs). Configurable in Settings.
3. **Game profiles** — `data/game_profiles.json` with per-game play style text. Initial profiles for AR and RL from spec.
4. **Cost tracking** — logged per API call, monthly total in Settings Logs tab.
5. **Energy scorer** — called as subprocess only. Uses Track 2 (mic-only) audio via `-map 0:a:1`.

### File Impact Analysis

| File | Change Type | Description |
|------|-------------|-------------|
| `src/main/main.js` | **Major rewrite** | Replace `pipeline:generateClips` handler with new 6-step AI pipeline. Add IPC for feedback DB, profile management, log viewer. |
| `src/main/ffmpeg.js` | **Add functions** | `extractFrameAtTime()`, `cutClipCopy()` (stream copy, not re-encode) |
| `src/main/whisper.js` | **Minor** | Add SRT output option for energy_scorer.py compatibility |
| `src/main/highlights.js` | **Deprecated** | No longer called in pipeline. Keep file but pipeline bypasses it. |
| `src/main/preload.js` | **Add methods** | Expose feedback DB queries, profile CRUD, log viewer, processing folder config |
| `src/main/projects.js` | **Extend clip model** | Add `why`, `peakQuote`, `energyLevel`, `confidence`, `hasFrame` to clip schema |
| `src/renderer/views/UploadView.js` | **Update pipeline UI** | New 6-step progress display matching spec Section 7 |
| `src/renderer/views/ProjectsView.js` | **Extend clip cards** | Show Claude's reason, peak quote, energy badge, confidence score, approve/reject logging |
| `src/renderer/views/SettingsView.js` | **Add Logs tab** | Log viewer with filtering, cost tracking, processing folder config |
| `src/renderer/components/modals.js` | **Add modals** | Profile diff modal for play style updates |
| `package.json` | **Add dep** | `better-sqlite3` |

### NEW Files to Create

| File | Purpose |
|------|---------|
| `src/main/ai-pipeline.js` | New AI pipeline orchestrator (energy analysis → frame extraction → Claude API → clip cutting) |
| `src/main/feedback.js` | SQLite feedback DB wrapper (init, log, query approved, query rejected) |
| `src/main/game-profiles.js` | Game play style profile CRUD + auto-update trigger |
| `src/main/ai-prompt.js` | Claude system prompt builder (Sections A–F from spec) |
| `src/main/pipeline-logger.js` | Per-video structured log file writer |
| `data/game_profiles.json` | Initial play style profiles (AR, RL) |

### Implementation Order (12 Steps — matches spec Section 10)

**Phase A: Foundation (Steps 1–3)**

- [ ] **Step 1: Wire energy_scorer.py** — Add IPC handler to call `energy_scorer.py` as subprocess. Parse its JSON + claude_ready.txt outputs. Save to `processing/energy/` and `processing/claude/`. Test with a real video.
- [ ] **Step 2: Pipeline Status UI** — Update UploadView.js progress overlay with the new 6-step display (Transcription → Energy Analysis → Frame Extraction → Claude Analysis → Cutting Clips → Creating Project). Real-time step states (running/complete/failed/waiting), elapsed times, retry button on failure.
- [ ] **Step 3: Logging system** — Create `pipeline-logger.js` for per-video structured log files in `processing/logs/`. Add Logs tab to SettingsView.js with list, filtering by game tag, status icons, copy-to-clipboard, delete old logs. Add cost tracking display.

**Phase B: Core AI Pipeline (Steps 4–7)**

- [ ] **Step 4: Frame extraction** — After energy analysis, read `.energy.json`, sort by peak_energy, take top 20, extract one 720p frame per segment midpoint via FFmpeg. Save to `processing/frames/`.
- [ ] **Step 5: Claude API caller** — Build `ai-prompt.js` (Sections A–E of system prompt). Build Claude API call in `ai-pipeline.js`: send full `claude_ready.txt` + 20 base64 frames + system prompt. Parse JSON response strictly. Log token count + estimated cost.
- [ ] **Step 6: Automatic clip cutting** — For each clip Claude returns, FFmpeg `-c copy` cut to `processing/clips/`. All clips ready before project creation.
- [ ] **Step 7: Automatic project creation** — After all clips cut, create project in Projects tab with Claude's metadata per clip. Notify user "Project ready — N clips generated". Wire new pipeline into `pipeline:generateClips` IPC handler (replacing old highlights.js path).

**Phase C: Clip Review UI (Step 8)**

- [ ] **Step 8: Enhanced clip review in ClipBrowser** — Each clip shows: video preview, timestamp range, suggested title (editable), Claude's reason ("why"), peak quote, energy level badge (HIGH/MED/LOW color-coded), confidence score, Approve/Reject buttons, Open in Editor button. This extends the existing ClipBrowser, not a rewrite.

**Phase D: Learning System (Steps 9–12)**

- [ ] **Step 9: Feedback database** — Install `better-sqlite3`. Create `feedback.js` with SQLite schema from spec Section 6.1. Wire Approve/Reject buttons to log to `data/feedback.db` with all fields (video_id, game_tag, timestamps, transcript, energy, claude_reason, decision, user_note).
- [ ] **Step 10: Few-shot injection** — Before each Claude API call, query `feedback.db` for last 20 approved clips matching game_tag. Format as Section F of system prompt. Skip if fewer than 5 approved clips.
- [x] **Step 11: Update threshold stepper** — Add "Update play style after every N sessions" stepper (3–20, default 5) to each game's AI Context section in Settings/Game Library.
- [x] **Step 12: Profile auto-update** — After every N transcriptions per game, trigger Claude analysis of recent SRT transcripts to propose updated play style profile. Show diff modal (old vs new). On approval, save to `game_profiles.json`. On dismiss, reset counter.

### Key Constraints (from spec)
- **Do NOT rewrite `energy_scorer.py`** — call as subprocess only
- **Always `claude-sonnet-4-5`** — never Opus for highlight detection
- **Frames capped at 20, resolution at 720p** — non-negotiable for cost control
- **Claude must return JSON only** — strict parsing, logged error if not
- **All generated files → `processing/`** — never write to recordings folder
- **Processing folder configurable in Settings** — default: `C:\Users\IAmAbsolute\Desktop\ClipFlow\processing\`

### Verification Criteria
- [ ] Full pipeline runs end-to-end on a real 30-min recording
- [ ] Pipeline status UI shows all 6 steps with real-time progress
- [ ] Claude returns 15–20 clips with valid timestamps, titles, reasons
- [ ] All clips pre-cut and ready before project appears in Projects tab
- [ ] Approve/Reject logs to feedback.db correctly
- [ ] Few-shot examples appear in Claude prompt after 5+ approved clips
- [ ] Logs tab shows all pipeline runs with correct status/cost
- [ ] Profile update triggers after N sessions, diff modal works
- [ ] Build with zero errors, app launches, no regressions

---

## 🟡 In Progress — Projects Tab Overhaul (Vizard-inspired)

### Goal
Redesign the ClipBrowser (project detail view) from a bland card list into a rich clip review experience with inline video playback, better scoring, auto-generated titles, and side-by-side transcript — modeled on Vizard's clip browser.

### Issue 1: Clip cards are bland — full visual overhaul
**Current:** Tiny cards with just score bar, duration text, and buttons. No thumbnails, no video, no visual hierarchy.
**Target:** Each clip is a row with: portrait thumbnail/video player on left, title + score + transcript on right. Clean, information-dense layout like Vizard.

**Files:**
- [ ] `src/renderer/views/ProjectsView.js` — complete ClipBrowser redesign

### Issue 2: Inline video player with thumbnail
**Current:** No thumbnail, no video preview. Just action buttons.
**Target:** Each clip shows a 9:16 thumbnail that becomes a playable video on hover/click. User can quickly watch clips at a glance without opening the editor.

**Implementation:**
- [ ] Show `clip.thumbnailPath` as poster image in a 9:16 container
- [ ] On click/hover: load `clip.filePath` as `<video>` element with play/pause controls
- [ ] Duration badge overlay on thumbnail (bottom-right, like Vizard "00:30")
- [ ] Play button overlay on hover

### Issue 3: Replace thumbs up/down with checkmark/X
**Current:** 👍/👎 icons — look childish and generic.
**Target:** Clean ✓ (approve) and ✕ (reject) icons with subtle color states.

**Files:**
- [ ] `src/renderer/views/ProjectsView.js` — replace ThumbsUp/ThumbsDown with Check/X from lucide-react

### Issue 4: Score display as X/10
**Current:** Raw highlight score (28, 27, 26) with no context. Out of 100 but looks arbitrary.
**Target:** Normalize to X.X/10 scale (like Vizard's 9.5/10). Clear, glanceable.

**Implementation:**
- [ ] `displayScore = (highlightScore / 10).toFixed(1)` — maps 0–100 → 0.0–10.0
- [ ] Render as `<big>8.5</big><small>/10</small>` with color coding (green ≥ 8, yellow ≥ 6, red < 6)

### Issue 5: Auto-title clips from transcript
**Current:** Clips have empty titles — user sees blank or "Untitled".
**Target:** Auto-generate title from transcript on clip creation. Pick the phrase with the most emotion/energy. If no strong phrase, use a representative quote.

**Implementation:**
- [ ] In `src/main/main.js` pipeline handler, after transcription + highlight detection:
  - For each clip, find the transcript segment with highest energy (loudest + most hype words)
  - Extract 3-8 word phrase from that segment
  - Capitalize as title case
  - Set as `clip.title`
- [ ] Fallback: first non-trivial sentence from clip's transcript
- [ ] Can be overridden by user (inline edit already works)

### Issue 6: Transcript beside video player
**Current:** Transcript is a modal popup — disconnected from the clip context.
**Target:** Transcript shown inline beside the video player in each clip row. Scrollable, with timestamps like Vizard reference.

**Implementation:**
- [ ] Remove TranscriptModal trigger from clip cards
- [ ] Show transcript text inline (right side of clip row, beside/below title+score)
- [ ] Format with timestamps: `[MM:SS] text...` per segment
- [ ] Scrollable area (max-height with overflow-y-auto)

### Issue 7: Clip duration tuning (backend)
**Current:** `minClipDuration: 15` produces clips stuck at 15s floor.
**Target:** ~30 second clips with flexibility (20-45s range).

**Implementation:**
- [ ] `src/main/highlights.js` — change `minClipDuration` from 15 to 25
- [ ] Increase gap tolerance from 3s to 5s (bridges small pauses in speech)
- [ ] Add context padding: 2s before and 2s after highlight peak
- [ ] Keep `maxClipDuration: 60`

### Layout Design (ClipBrowser)
```
┌─────────────────────────────────────────────────────────┐
│ ← Back   Project Name                    Render All (N) │
│ All (16)  Pending (16)  Approved (0)                     │
├─────────────────────────────────────────────────────────┤
│ ┌──────────┬────────────────────────────────────────────┐│
│ │          │ "How Did I Fumble My Best Run Ever?!"      ││
│ │  9:16    │  8.5/10  ✓ ✕                              ││
│ │ video    │                                            ││
│ │ player   │ [09:29] How do I fumble? How do I fumble  ││
│ │          │ the best, my best run ever?                ││
│ │  ▶ 0:30  │ [09:42] don't even know where I am...     ││
│ │          │ [09:51] the actual, I don't, what?         ││
│ └──────────┴────────────────────────────────────────────┘│
│ ┌──────────┬────────────────────────────────────────────┐│
│ │  next    │  ...                                       ││
│ │  clip    │                                            ││
│ └──────────┴────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### Verification
- [ ] Build with zero errors
- [ ] Launch app, open a project with clips
- [ ] Each clip shows portrait thumbnail with playable video
- [ ] Score displays as X.X/10 with color coding
- [ ] ✓/✕ icons replace thumbs up/down
- [ ] Clips have auto-generated titles from transcript
- [ ] Transcript shows inline beside video
- [ ] Clips are ~25-30s average (not all 15s)
- [ ] No regressions in existing features

### Files Impacted
1. `src/renderer/views/ProjectsView.js` — complete ClipBrowser redesign
2. `src/main/highlights.js` — clip duration tuning
3. `src/main/main.js` — auto-title generation in pipeline

### Implementation Order
1. Backend: clip duration tuning (highlights.js)
2. Backend: auto-title from transcript (main.js pipeline)
3. Frontend: ClipBrowser visual overhaul (ProjectsView.js)
4. Build + verify

---

## ✅ Completed — Timeline Core Operations + Whisper Fix

### Goal
Make the timeline work like a real NLE: cut/splice segments, trim audio, independent caption segments with overlap support, proper right-click behavior, and fix whisper alignment drift after ~30s.

### Issue 1: Right-click moves playhead (quick fix)
**Root cause:** `onPointerDown={handleScrubStart}` on scroll container fires on ALL mouse buttons.
**Fix:** Add `if (e.button !== 0) return;` to `handleScrubStart` — only left-click seeks.
**File:** `TimelinePanelNew.js`

### Issue 2: Caption store → array of segments (architectural change)
**Root cause:** `useCaptionStore` stores ONE caption (`captionText`, `captionStartSec`, `captionEndSec`). Can't cut, can't have multiple, can't overlap.
**Fix:** Refactor to `captionSegments[]` array, each with `{ id, text, startSec, endSec }` + all styling inherited from store defaults. Add `splitCaptionAtPlayhead()`, `deleteCaptionSegment()`, `updateCaptionSegmentTimes()`, `updateCaptionSegmentText()`.

**Files:**
- [ ] `useCaptionStore.js` — add `captionSegments` array + CRUD + split operations
- [ ] `TimelinePanelNew.js` — render multiple caption segments, no neighbor-push (allow overlap)
- [ ] `PreviewPanelNew.js` — render all active caption segments at current time (overlap OK)
- [ ] `EditSubsPanel.js` / `CaptionDrawer.js` — update to work with selected caption segment
- [ ] `useEditorStore.js` — update save/load to persist caption segments

### Issue 3: Split/cut at playhead for all tracks
**Current:** Only subtitle has `splitSegment()` (S key). Caption and audio have no split.
**Fix:** Unified split: S key or split button splits the **selected** track's segment at the playhead.
- Subtitle: already works
- Caption: split selected caption segment at playhead → two independent segments
- Audio: split audio segment at playhead → two audio segments (visual only for now)

**Files:**
- [ ] `TimelinePanelNew.js` — split logic checks `selectedTrack` and dispatches to correct store
- [ ] `useCaptionStore.js` — `splitCaptionAtPlayhead(time)` implementation
- [ ] Timeline context menu — add "Split" option on right-click

### Issue 4: Right-click context menu for all tracks
**Current:** Only audio track has a context menu. Caption and subtitle tracks have none.
**Fix:** Add context menu for caption + subtitle tracks with: Split at playhead, Delete segment, Duplicate segment.
- [ ] `TimelinePanelNew.js` — generic context menu component, track-aware options

### Issue 5: Audio track trim/resize
**Current:** Audio has resize handles but uses local state (`audioStartSec`/`audioEndSec`). Works for trimming ends.
**Status:** Already functional for shrink/extend. Split is the missing piece (Issue 3).

### Issue 6: Whisper alignment drift after ~30s
**Hypothesis:** WhisperX's wav2vec2 alignment loses accuracy on longer clips. The repair function may not catch gradual drift.
**Investigation plan:**
- [ ] Add debug logging to `transcribe.py` — dump raw whisper timestamps vs aligned timestamps per segment
- [ ] Test: compare raw (pre-alignment) segment times to aligned times for a clip where drift occurs
- [ ] If alignment is the problem: test with `return_char_alignments=True` or try chunk-based alignment
- [ ] If raw whisper is the problem: investigate batch_size / model settings

### Verification
- [ ] Build with zero errors
- [ ] Right-click on timeline does NOT move playhead
- [ ] Can split caption at playhead → two independent text segments
- [ ] Can edit each side of a split caption independently
- [ ] Overlapping captions render correctly in preview
- [ ] Can split audio at playhead
- [ ] Context menu appears on right-click for all tracks
- [ ] Whisper re-transcription stays aligned past 30s
- [ ] No regressions in existing subtitle operations

### Files Impacted
1. `src/renderer/editor/components/TimelinePanelNew.js` — right-click fix, context menus, multi-caption rendering, split dispatch
2. `src/renderer/editor/stores/useCaptionStore.js` — array refactor, split/delete/update operations
3. `src/renderer/editor/components/PreviewPanelNew.js` — render multiple overlapping captions
4. `src/renderer/editor/stores/useEditorStore.js` — save/load caption segments
5. `tools/transcribe.py` — debug logging, potential alignment fix

### Implementation Order
1. Right-click fix (5 min, standalone)
2. Caption store refactor → array (core architectural change, everything depends on this)
3. Timeline multi-caption rendering + overlap
4. Split operations for caption + audio
5. Context menus for all tracks
6. Whisper investigation (independent track)

---

## ✅ Completed — Deep Text Effects System (Resolve-inspired)

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

## ✅ Completed — Misc Changes Batch #1 (10 items)

1. ~~Timeline end marker~~ ✅
2. ~~Punctuation dropdown — removed labels~~ ✅
3. ~~Title bar centering~~ ✅
4. ~~Preview toolbar — larger, clearer text~~ ✅
5. ~~Preset tooltip — clearer wording~~ ✅
6. ~~Active preset indicator~~ ✅
7. ~~Timeline expand crash fix~~ ✅
8. ~~Highlight swatches — editable + persisted~~ ✅
9. ~~Audio placeholder songs removed~~ ✅
10. ~~Zoomed preview pan + scroll fix~~ ✅

---

## 📋 Misc Changes (batch when 10 accumulated)

_(empty — log new items here)_

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
