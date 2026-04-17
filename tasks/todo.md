# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

## 🔲 PROPOSED — Editor perf on 30-min sources (#57) — unblocks Electron hop cadence

**Context:** Electron 29 landed cleanly (hop 1, commit `46546de`). During testing, 30-min source playback in the editor showed severe lag: ~2fps feel, stuck waveform, subtitle highlight drift, left-panel auto-scroll broken during playback. Fega's call: fix this before hop 2, because hop 2→4 verification depends on being able to actually test the editor on long sources.

### Root causes (confirmed by reading code)

**RC-1: Subtitle overlay does O(N) filter on every 60fps frame.**
`PreviewPanelNew.js:1080` filters ALL subtitle segments (`currentTime >= startSec && currentTime <= endSec`) every render. PreviewPanelNew re-renders 60 times/sec (from `currentTime` sub at :417). On a 30-min source with 500+ segments → ~30,000 comparisons/second just to find 1-2 active segments.

**RC-2: Active-segment derivation scans all segments per frame in two places.**
- `LeftPanelNew.js:437-442` (TranscriptTab) — `activeWordIdx` scans from end of `allWords` on every render. With 5000+ words, that's 5000 comparisons × 60fps = 300,000 ops/sec.
- `LeftPanelNew.js:653-662` (SubtitlesTab) — `editSegments.find(...)` in an effect that runs every `adjustedTime` change (i.e., every currentTime update = 60fps).

**RC-3: TimelinePanelNew re-renders its entire tree 60×/sec.**
It subscribes to `currentTime` at line 36 AND runs its own rAF setSmoothTime at 60fps (line 112-134). Either one alone causes 60Hz re-renders of the whole panel, including waveform canvas, NLE segment rects, subtitle blocks spanning the full 30min. The "smooth playhead via rAF + local state" pattern was an attempt at decoupling but smoothTime is held in the parent component's state, so every frame still rebuilds the parent tree.

**RC-4: `[DBG ...]` console.log spam in playback hot paths.**
- `PreviewPanelNew.js:789-793` — logs first 10 tick frames per play
- `PreviewPanelNew.js:807, 827, 892, 894, 896, 899` — tick seek, onTimeUpdate, play effect
- `usePlaybackStore.js` — togglePlay, seekTo, mapSourceTime (per earlier read)

Each console.log with DevTools open is ~0.5-1ms in renderer. Thousands of these per play session. Main impact only when DevTools is actually open — but we currently force-open it.

**RC-5: DevTools unconditionally force-opened at `src/main/main.js:324`.**
Known 10-30% renderer perf penalty on heavy pages. Currently opens in production builds too.

**RC-6: Left-panel auto-scroll only fires on pause.**
`LeftPanelNew.js:665-669` — `activeSegRef.current.scrollIntoView({behavior: "smooth"})` fires on `activeSegId` change. Under 60fps re-render pressure, React never commits long enough for smooth-scroll animation to start; pausing releases the pressure and the queued scroll commits. Consequence of RC-2, not an independent bug.

### Fix strategy (phased by risk & impact)

**Phase A — Free wins (zero refactor, minutes):**
- A1. Gate DevTools force-open behind `isDev` at `src/main/main.js:324`.
- A2. Strip all `[DBG ...]` `console.log` calls from playback hot paths: `src/renderer/editor/stores/usePlaybackStore.js` (togglePlay, seekTo, mapSourceTime) and `src/renderer/editor/components/PreviewPanelNew.js` (tick :789-793, :807, onTimeUpdate :827, playEffect :892-899).

**Phase B — Derived discrete-state selectors (core fix, 1-2 hours):**
- B1. In `usePlaybackStore.js`, extend the store with three derived indices that update inside `setCurrentTime`:
  - `activeSubtitleSegId` — id of the edit segment whose `[startSec, endSec]` contains current time, or `null`.
  - `activeTranscriptWordIdx` — index into the flat word list whose `start ≤ currentTime`, or `-1`.
  - (Skip `activeNleSegId` for now — nleSegments are few and not in a 60fps render path.)
  
  Use forward-scan-from-last-index in `setCurrentTime` (O(1) amortized during playback, O(N) on seek — fine). The derived values use Zustand's default `===` equality, so subscribers re-render only when the index changes (5-10×/sec, not 60×/sec). Needs the subtitle word list accessible to the playback store — either pass it via a dependency injection hook or make the playback store read `useSubtitleStore.getState().originalSegments` directly when computing.

- B2. In `PreviewPanelNew.js`, change line 1080's `.filter((seg) => seg.text && currentTime >= seg.startSec && currentTime <= seg.endSec)` to look up by `activeSubtitleSegId` and scope to just that seg's words. Subscribe to `activeSubtitleSegId` instead of (or in addition to) `currentTime` at the top level.

- B3. In `LeftPanelNew.js` TranscriptTab (line 363+), replace the `useMemo(() => {...scan allWords...}, [allWords, adjustedTime])` for `activeWordIdx` with a subscription to `activeTranscriptWordIdx` from the store. Component stops re-rendering at 60fps.

- B4. In `LeftPanelNew.js` SubtitlesTab (line 608+), replace the `editSegments.find(...)` inside the useEffect with a subscription to `activeSubtitleSegId` and drive the `setActiveSegId` call from that.

- B5. In `TimelinePanelNew.js`, remove the top-level `currentTime` subscription at line 36. It's used at:
  - Line 686 (center-on-playhead effect) — only needed when paused or on seek; can read via `getState()` inside the effect or depend on a `seekCounter` that increments per seek.
  - Line 787 (current-time display text) — move to a small child component that subscribes to a 10fps-quantized `displayTime` selector (add `displayTime` to store, update in setCurrentTime every 100ms).
  - Line 547, 1086 — called from event handlers via `getState()` already, so line 36 subscription isn't needed for those.
  - Line 1042 (WaveformTrack `currentTime` prop) — change prop to `smoothTime` or have WaveformTrack subscribe to its own thing.
  - Line 164 `playheadTime = playing ? smoothTime : currentTime` — when paused, can read via `getState()` once on effect.

**Phase C — Extract hot nodes to children (only if A+B insufficient, 1-2 hours):**
- C1. Extract the Playhead DOM node in `TimelinePanelNew` to a dedicated `<TimelinePlayhead />` child that owns its own rAF loop + smoothTime state. Parent TimelinePanelNew drops from 60Hz to segment-change-rate re-renders.
- C2. Extract the SubtitleOverlay in `PreviewPanelNew` to a `<SubtitleOverlay />` child that subscribes to its own `activeSubtitleSegId` + mapped-segment lookup. Parent PreviewPanel drops to change-rate.

Only pursue Phase C if Phase B measurements show parent re-renders still costing >3ms/frame on 30-min sources.

### Files to modify

| File | Phase | Change |
|---|---|---|
| `src/main/main.js` | A1 | Gate `webContents.openDevTools()` at line 324 behind `isDev` |
| `src/renderer/editor/stores/usePlaybackStore.js` | A2, B1 | Strip DBG logs; extend `setCurrentTime` to compute `activeSubtitleSegId`, `activeTranscriptWordIdx`, and `displayTime` (100ms-quantized) |
| `src/renderer/editor/components/PreviewPanelNew.js` | A2, B2, (C2) | Strip DBG logs; replace segs filter with `activeSubtitleSegId` lookup; optionally extract SubtitleOverlay child |
| `src/renderer/editor/components/TimelinePanelNew.js` | B5, (C1) | Drop top-level `currentTime` sub; route remaining uses through `smoothTime` / `getState()` / `displayTime`; optionally extract Playhead child |
| `src/renderer/editor/components/LeftPanelNew.js` | B3, B4 | TranscriptTab: sub to `activeTranscriptWordIdx`. SubtitlesTab: sub to `activeSubtitleSegId` |

No editor store schema changes. No IPC changes. No main-process logic changes beyond A1.

### Verification criteria ("done means...")

All on a 30min+ source recording in the editor:
1. Clip opens in < 3s (currently: slow, multiple seconds).
2. Video plays back smoothly — no visible judder in preview, playhead glides along timeline at 60fps perceived.
3. Subtitle highlight in LeftPanel tracks audio with < 100ms perceived lag.
4. Left-panel auto-scroll fires during playback, not only on pause.
5. Subtitle overlay on preview switches between segments at the exact word boundary (behavior parity with short-source case).
6. Waveform renders within 10s of clip open. If still broken, file sub-issue — separate concern.
7. Short-source (< 2 min) playback has no regression: all existing editor behaviors preserved.
8. #35 zoom-slider-drag repro × 10 on 30-min source — still no crash (hop 1 regression check).
9. `npx react-scripts build && npm start` — no console errors/warnings in production build.

### Risks & rollback

- **Risk:** derived state in setCurrentTime runs on every seek; if the subtitle word list is huge (10,000+ words), even the forward-scan could cost on a long seek. Mitigation: bisect-search on big jumps, forward-scan on forward deltas ≤ 1s.
- **Risk:** `activeSubtitleSegId` in playback store creates a cross-store dependency (playback reads subtitle list). Keep it as a lazy read from `getState()`, not a subscription.
- **Risk:** Phase B changes subscription patterns across 5 files — regression surface is wide. Mitigation: tight verification matrix, commit Phase A and Phase B as separate commits so bisect works.
- **Rollback:** each phase is its own commit; revert in reverse order.

### Estimated time
- Phase A: 15-20 min (trivial edits + build/smoke)
- Phase B: 90-120 min (store extension + 4 component changes + verification pass)
- Phase C: 60-90 min IF needed (judgment call after Phase B)

### Plan decision points (need Fega's call before I start)

1. **Go or wait?** Go = implement Phase A+B now. Wait = stay in Hop 1 wrap mode and do this in a future session.
2. **Commit strategy?** Two commits (A, B) or one? I recommend two — cleaner bisect if B regresses something.
3. **Phase C gate?** Implement only if B measurements show parent re-renders >3ms/frame, or pre-approve to just do it?

---

## ✅ Complete — Video Splitting & Drag-and-Drop (Phase 1)

**Spec:** `video-splitting-spec-v3.md` (Section 13, Phase 1)

### Step 1 — Settings additions ✅
**Files:** `src/main/main.js` (store defaults + migration), `src/renderer/views/SettingsView.js` (UI)
- [x] Add `splitThresholdMinutes: 30`, `autoSplitEnabled: true`, `splitSourceRetention: "keep"` to electron-store defaults
- [x] Add migration block for existing installs (set defaults if keys don't exist)
- [x] Add "Video Splitting" section in SettingsView near Watch Folder — toggle for auto-split, threshold slider (10-120), keep originals toggle, help text
- [x] Verify: app builds, Settings shows new section, values persist across restart

### Step 2 — Schema migration ✅
**Files:** `src/main/database.js`, `src/main/main.js`, `src/main/ai-pipeline.js`, `src/main/naming-presets.js`
- [x] Add columns: `split_from_id TEXT`, `split_timestamp_start REAL`, `split_timestamp_end REAL`, `is_split_source INTEGER DEFAULT 0`, `import_source_path TEXT`
- [x] Add index: `idx_file_split_from` on `split_from_id`
- [x] Update `allRenamed` query to exclude `status = 'split'`
- [x] `byStatus` already accepts any status string — no change needed
- [x] `updateFileStatus` guards against overwriting `"split"` status
- [x] `applyPendingRenames` skips files with `"split"` status
- [x] `isFileInUse` returns false for `"split"` files
- [x] Verify: app builds, migration v3 runs, existing data loads, schema verified

### Step 3 — FFmpeg split module ✅
**Files:** `src/main/ffmpeg.js` (new `splitFile` function)
- [x] Add `splitFile(inputPath, splitPoints, outputDir)` — stream copy, `-avoid_negative_ts make_zero`
- [x] All-or-nothing: if any segment fails, delete partial outputs, throw error
- [x] Post-split probe: run `probe()` on each output, calculate keyframe-adjusted cumulative times
- [x] Return array of `{filePath, actualStartSeconds, actualEndSeconds}`

### Step 4 — `splitFile` IPC endpoint ✅
**Files:** `src/main/main.js` (handler), `src/main/preload.js` (bridge)
- [x] Add `ipcMain.handle("split:execute", ...)` — resolves parent file, calls `ffmpeg.splitFile()`, creates child `file_metadata` records, sets parent `is_split_source=1` + `status="split"`
- [x] Logs split action in `rename_history` with `action = "split"` and child IDs in metadata_snapshot
- [x] Add `splitExecute` to preload bridge

### Step 5 — `importExternalFile` IPC endpoint
**Files:** `src/main/main.js` (handler + `pendingImports` Set), `src/main/preload.js` (bridge)
- [ ] Add `pendingImports = new Set()` in main process scope
- [ ] Add `ipcMain.handle("import:externalFile", ...)` — validates .mp4, adds `{filename, sizeBytes}` to `pendingImports`, copies to `{watchFolder}/{YYYY-MM}/filename.mp4`, removes from set on completion
- [ ] Add `ipcMain.handle("import:cancel", ...)` — deletes copied file, removes from `pendingImports`
- [ ] Emit progress events during copy for large files
- [ ] Add `importExternalFile`, `importCancel` to preload bridge
- [ ] Verify: file copies correctly, progress events fire

### Step 6 — File watcher suppression
**Files:** `src/main/main.js` (watcher `add` handler)
- [ ] In chokidar `watcher.on("add")`, check `pendingImports` before processing — if filename+size matches an entry, skip (the drag-and-drop flow owns this file)
- [ ] Verify: dropping a file doesn't create duplicate entries

### Step 7 — Auto-split integration in Rename tab
**Files:** `src/renderer/views/RenameView.js`
- [ ] On file detection (watcher or drop), probe duration via `clipflow.ffmpegProbe()`
- [ ] If duration > threshold and `autoSplitEnabled`: show split badge on card ("2h 14m — will split into 5 parts")
- [ ] Add "Don't split" per-file toggle
- [ ] On rename confirm: if splitting, call `clipflow.splitExecute()`, show split preview with resulting filenames + time ranges, then show progress ("Splitting... 3 of 5 done")
- [ ] After split: child files appear as new pending cards (or go straight to renamed if auto-split during rename)
- [ ] Verify: long file shows indicator, split produces correct files, short files unaffected

### Step 8 — Drag-and-drop on Rename tab
**Files:** `src/renderer/views/RenameView.js`
- [ ] Add drop zone overlay (dashed border, "Drop recording here") on dragover
- [ ] Validate `.mp4` only — toast for non-mp4
- [ ] Single file only — toast "Drop one file at a time" for multi
- [ ] On drop: call `clipflow.importExternalFile(sourcePath)` → show copy progress → file appears in Pending list
- [ ] If no watch folder configured: show folder picker prompt first
- [ ] Verify: drag .mp4 from Downloads → appears in Pending, drag .mkv → rejected with toast

### Step 9 — Drag-and-drop on Recordings tab + Quick-import modal
**Files:** `src/renderer/views/UploadView.js`, new modal component
- [ ] Add same drop zone overlay as Rename tab
- [ ] On drop: copy file, then show quick-import modal
- [ ] Modal Step 1: game/content dropdown (required)
- [ ] Modal Step 2 (conditional): split proposal — green "Split & Generate" primary, gray "Skip splitting" secondary
- [ ] Modal Step 3: confirm preview — filenames + time ranges, "Generate Clips" button
- [ ] On confirm: create `file_metadata` with preset 3 (Tag+Date), set status `processing`, start pipeline
- [ ] On cancel/dismiss: delete copy, remove from pendingImports
- [ ] Verify: drop → modal → pick game → generate → file appears in grid with processing status

### Step 10 — Rename history logging for splits
**Files:** `src/main/database.js` or split handler in main.js
- [ ] Log split operations with `action = "split"` in `rename_history`
- [ ] Store child file IDs in `metadata_snapshot` JSON
- [ ] No undo button in v1 — informational only
- [ ] Verify: History sub-tab shows split entries

---

## ✅ Complete — Video Splitting Phase 2: Game-Switch Scrubber

**Spec:** `video-splitting-spec-v3.md` (Section 13, Phase 2)

### Step 11 — Thumbnail generation ✅
**Files:** `src/main/ffmpeg.js`
- [x] Add `generateThumbnailStrip(inputPath, fileId)` — FFmpeg `fps=1/30,scale=320:-1`, returns thumbnails array with timestamps
- [x] Add `cleanupThumbnailStrip(thumbDir)` — removes temp directory
- [x] Stores thumbnails in `os.tmpdir()/clipflow-thumbs/{fileId}/`

### Step 12 — `generateThumbnails` / `cleanupThumbnails` IPC endpoints ✅
**Files:** `src/main/main.js`, `src/main/preload.js`
- [x] `ipcMain.handle("thumbs:generate")` with in-memory cache by filePath
- [x] `ipcMain.handle("thumbs:cleanup")` removes from cache and deletes temp dir
- [x] Cleanup all cached thumb dirs on `window-all-closed`
- [x] Bridge: `clipflow.generateThumbnails(filePath)`, `clipflow.cleanupThumbnails(filePath)`

### Step 13 — Scrubber UI component ✅
**Files:** `src/renderer/components/ThumbnailScrubber.js` (new)
- [x] Horizontal scrollable thumbnail strip with time labels every 5/10 min
- [x] Click-to-place split markers (purple vertical lines with dot handles)
- [x] Click existing markers to remove them
- [x] Per-segment game/content dropdown (grouped, reuses shared Select + GamePill)
- [x] 1-minute minimum segment enforcement
- [x] Loading state with animated progress bar
- [x] Segment list with time ranges, durations, and color indicators
- [x] Hover time preview on strip

### Step 14 — Game-switch split integration in Rename tab ✅
**Files:** `src/renderer/views/RenameView.js`
- [x] "Multiple games" button on every pending file card (subtle, toggles scrubber)
- [x] ThumbnailScrubber expands below file card when opened
- [x] `gameSwitchSplitAndRename()` — splits by markers with per-segment tags
- [x] Compound splitting: game-switch → auto-split per long segment
- [x] RENAME button text updates to "SPLIT & RENAME" when markers are placed
- [x] `renameOne` and `renameAll` both handle game-switch splits
- [x] Scrubber cleanup on rename, cancel, hide, and rename-all
- [x] Thumbnail cleanup via IPC on close/rename

---

## 🔲 In Progress — Queue Tab Phase 1: Clip Card Redesign

**Plan doc:** `C:\Users\IAmAbsolute\Desktop\ClipFlow stuff\queue-tab-redesign-plan.md`

### Step 1 — Thumbnail extraction at render time
**Files:** `src/main/main.js` (render:clip handler), `src/main/ffmpeg.js` (new `extractThumbnail` fn), `src/main/projects.js` (updateClip)
- [ ] Add `extractThumbnail(videoPath, outputPath, timeSeconds=1)` to ffmpeg.js — single frame, JPEG, ~320px wide
- [ ] In `render:clip` IPC handler: after successful render, call `extractThumbnail(result.path, thumbPath)` where thumbPath = `{renderDir}/{clipTitle}_thumb.jpg`
- [ ] Pass `thumbnailPath` to `projects.updateClip()` alongside `renderPath` and `renderStatus`
- [ ] Verify: render a clip → `.jpg` appears next to rendered `.mp4`, clip object has `thumbnailPath` set

### Step 2 — Add `dequeued` status + remove-from-queue button
**Files:** `src/renderer/views/QueueView.js`, `src/main/projects.js`
- [ ] Add "X" button on each clip card (visible on hover or always visible)
- [ ] On click: call `window.clipflow.projectUpdateClip(projectId, clipId, { status: "dequeued" })`
- [ ] Update QueueView filter to exclude `status === "dequeued"` (currently only includes `"approved"` / `"ready"`)
- [ ] Verify: X button removes clip from queue, clip doesn't reappear, re-approving in Editor re-queues it

### Step 3 — Clip card redesign (thumbnail + metadata + inline title)
**Files:** `src/renderer/views/QueueView.js`
- [ ] Replace text-only card with new layout: `[Thumbnail 80x45] [Title + metadata] [Status badge] [X button]`
- [ ] Thumbnail: show `clip.thumbnailPath` image if exists, fallback placeholder (film icon) if null
- [ ] Metadata row below title: duration (`endTime - startTime`), game tag badge (colored pill), source project name, render status
- [ ] Inline title editing: double-click title → contentEditable or input field → blur/Enter saves via `projectUpdateClip`
- [ ] Keep existing status badges (Published, Publishing, Failed, Scheduled, Not rendered)
- [ ] Keep left border color coding (main game = accent, other = green)
- [ ] Verify: cards show thumbnails, metadata is accurate, title edits persist

### Step 4 — Drag-to-reorder with @dnd-kit
**Files:** `package.json`, `src/renderer/views/QueueView.js`
- [ ] Install `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- [ ] Wrap clip list in `DndContext` + `SortableContext`
- [ ] Each clip card becomes a `useSortable` item with drag handle (grip icon on left)
- [ ] On reorder: persist `queueOrder` (integer) on each clip via `projectUpdateClip`
- [ ] QueueView sorts clips by `queueOrder` (nulls sort to end by `createdAt`)
- [ ] Reorder works across all clips regardless of game type
- [ ] Verify: drag clips up/down, order persists across tab switch and app restart

### Step 5 — Build + verify all changes
- [ ] `npx react-scripts build` succeeds
- [ ] `npm start` — app launches, no console errors
- [ ] Queue tab shows redesigned cards with thumbnails (for rendered clips)
- [ ] Remove from queue works (X button → clip disappears)
- [ ] Inline title edit works (double-click → edit → save)
- [ ] Drag-to-reorder works (grip handle → drag → new order persists)
- [ ] Publish flow still works (select clip → Publish Now → sequential platform publish)
- [ ] No regressions in Editor, Projects, Rename, or Tracker tabs

---

## 🔲 Paused — Remove Legacy Features (OBS Log Parser + Voice Modes)

> Paused — resume after Queue Phase 1.

### Goal
Remove two legacy features that are no longer useful for a commercial product: the OBS log parser (game detection) and the hype/chill voice mode toggle. Both are either dead code or redundant with newer systems.

### Feature 1 — OBS Log Parser Removal

**Status:** Dead code — built but never wired into the UI. Game detection works via filename + manual dropdown.

**What to remove:**
- [ ] `src/main/main.js` lines ~401-442 — `obs:parseLog` IPC handler (reads OBS logs, extracts game .exe names)
- [ ] `src/main/preload.js` line ~28 — `parseOBSLog()` bridge method
- [ ] `src/renderer/views/RenameView.js` line ~313 — "OBS LOG" cyan status badge (decorative, no logic)
- [ ] `src/renderer/views/RenameView.js` line ~297 — subtitle text referencing OBS specifically
- [ ] `.claude/rules/pipeline.md` — OBS log parsing rules (if present)

**What to KEEP:**
- `RAW_OBS_PATTERN` regex and chokidar file watcher — this is active file detection, not log parsing
- Manual game dropdown selector — this is the real game assignment UI
- All game detection logic in RenameView (filename-based, not OBS-dependent)

### Feature 2 — Hype/Chill Voice Mode Removal

**Status:** Redundant — archetype + description + momentPriorities already convey tone more precisely.

**What to remove:**
- [ ] `src/renderer/editor/stores/useAIStore.js` — `voiceMode` state (line ~6), setter (line ~17), prompt injection ternary (line ~45), reset (line ~95)
- [ ] `src/renderer/editor/components/RightPanelNew.js` lines ~632-661 — voice mode toggle UI (fire/chill emoji buttons)
- [ ] `src/renderer/views/OnboardingView.js` — `ARCHETYPE_VOICE` mapping (lines ~31-37), voiceMode state (line ~71, ~92), PersonalityStep voice toggle UI (lines ~317-373), voiceMode in finishOnboarding (line ~105)
- [ ] `src/renderer/views/SettingsView.js` lines ~1074-1089 — "Default Title Style" toggle section, voiceMode in default profile (~947, ~973)
- [ ] `src/main/main.js` lines ~159-165 — `voiceMode` in creatorProfile store defaults

**What to KEEP:**
- `userContext` parameter flow in useAIStore.generate() — just drop the voice ternary, keep `aiContext`
- `archetype` field and all archetype logic — this stays
- `description` field — this stays
- `momentPriorities` — this stays
- `getArchetypePersonality()` in ai-prompt.js — not voice-dependent

### Verification
- [ ] Build succeeds (`npx react-scripts build`)
- [ ] App launches (`npm start`)
- [ ] Rename view works — file watcher active, game dropdown functional, no "OBS LOG" badge
- [ ] Editor AI panel — no voice toggle, title generation still works
- [ ] Onboarding wizard — screen 3 still has description textarea, no voice toggle
- [ ] Settings AI Preferences — no "Default Title Style" section, rest intact
- [ ] No console errors or missing references

---

## 🔲 Paused — Split Instagram & Facebook into Independent Login Flows

> Paused while we clean up legacy features. Plan is still valid — resume after this task.

(See git history commit for full plan, or check previous version of this file)

---

## 🔲 Planned — Backend Infrastructure for Commercial Launch

> All items labeled `milestone: commercial-launch` on GitHub. Build order reflects dependencies.

### Phase 1 — Foundation (must come first)
- [ ] **#20 — Supabase backend: auth, database, Edge Functions**

### Phase 2 — Security (move secrets off-device)
- [ ] **#21 — Migrate OAuth flows to server-side proxy**
- [ ] **#22 — Move Anthropic API key server-side, proxy AI calls**

### Phase 3 — Monetization
- [ ] **#23 — LemonSqueezy payments + license key management**

### Phase 4 — Distribution
- [ ] **#19 — Auto-updates with electron-updater + code signing**

### Phase 5 — Observability
- [ ] **#24 — Sentry crash reporting**
- [ ] **#25 — Product analytics (PostHog)**

---

## 🔲 Planned — Editor Autosave (Option A — renderer-crash resilience)

> Context: #35 renderer crashes (`blink::DOMDataStore` 0xC0000005) are pre-existing, 57 Sentry events total, happen in editor AND projects tab, wipe all unsaved edits. Explicit Save button is the only current persistence path. Autosave turns every crash into at most ~500ms of lost work.
>
> **Why this first, before fixing the crash itself:** the crash is a native Chromium bug — repro is racy, fix is uncertain. Autosave is a known-good solution that makes the crash non-destructive, buying time to investigate #35 properly.

### Scope
Silently persist editor state to disk during editing. No UI change (no "Saving…" spinner, no flash — the existing Save button stays exactly as-is for explicit user confirmation). On reopen, `loadClip` already restores everything — zero restore-path changes needed.

### What gets saved (reuses existing `handleSave` payload)
Everything `useEditorStore.handleSave` at `useEditorStore.js:1079` already writes via `window.clipflow.projectUpdateClip`:
- `subtitles.sub1` (source-absolute edit segments) — from `useSubtitleStore.editSegments`
- `captionSegments` + `caption` text — from `useCaptionStore`
- `nleSegments` + `audioSegments` — from `useEditorStore`
- `subtitleStyle` (full per-clip snapshot — 30+ style keys) — from `useSubtitleStore` + `useLayoutStore.subYPercent`
- `captionStyle` (full per-clip snapshot) — from `useCaptionStore` + `useLayoutStore.capYPercent`
- `title` — from `useEditorStore.clipTitle`

Restore is already wired: `useEditorStore.js:137-153` calls `initSegments` + `restoreSavedStyle(clip.subtitleStyle)` + `restoreSavedStyle(clip.captionStyle)` + `setSubYPercent/setCapYPercent` on every `loadClip`.

### Triggers
1. **Debounced state change** — any write to `editSegments`, caption state, layout, style, title, or `nleSegments` → schedule save in 800ms. Coalesces rapid edits (typing, dragging sliders) into one IPC.
2. **Window blur** — flush immediately when focus leaves the window.
3. **`beforeunload`** — flush synchronously on reload/close (best-effort; renderer crashes bypass this, which is exactly why we need #1).
4. **Clip switch** — flush the outgoing clip before `loadClip` swaps to the new one.

### File impact
- `src/renderer/editor/stores/useEditorStore.js`
  - Add module-closure vars `_autosaveTimer`, `_autosaveInFlight` OUTSIDE the store (not in state — avoids infinite subscribe loop when timer is (re)set).
  - Add actions `scheduleAutosave()`, `flushAutosave()`, `_doSilentSave()`.
  - Extract the body of current `handleSave` (lines 1079-1141) into `_doSilentSave()` — pure persistence, no UI side effects. `handleSave` becomes a thin wrapper that calls `_doSilentSave()` — no behavior change for the Save button.
  - Guard in `scheduleAutosave`: `!clip || !project` → bail; `extending` → bail (FFmpeg extend/revert actively rewrites the source file + clip metadata). No `dirty` gate — style setters in RightPanelNew don't reliably call `markDirty`, and 800ms debounce absorbs the noise of saving on non-persistable state changes.
- `src/renderer/editor/components/EditorLayout.js`
  - In the existing `loadClip` effect (around line 536), subscribe to `useSubtitleStore`, `useCaptionStore`, `useLayoutStore`, `useEditorStore` — each listener calls `useEditorStore.getState().scheduleAutosave()`.
  - Return cleanup that unsubscribes + calls `flushAutosave()` before the next clip loads.
  - Top-level effect (once per editor mount): `window.addEventListener('blur', flushAutosave)`. Skip `beforeunload` — it can't synchronously IPC in Electron and renderer crashes bypass it anyway; the 800ms debounce + blur flush are what actually protect us.
- **No main-process changes.** `project:updateClip` IPC at `main.js:1463` is a partial merge (`{...old, ...updates}` in `projects.js:187`) — autosave won't clobber render-status writes.
- **No schema migration.** All fields written are already part of the clip shape.

### Steps
1. Extract `_doSilentSave` from `handleSave` body in `useEditorStore.js` — pure persistence, no UI side effects. Verify `handleSave` still flashes "Saved" exactly as before.
2. Add `scheduleAutosave` (800ms debounce) and `flushAutosave` (cancel timer + await `_doSilentSave` if pending) to `useEditorStore`.
3. Wire `window.blur` + `beforeunload` in `EditorLayout.js` (top-level effect, once per editor mount).
4. Wire per-store subscriptions in the `loadClip` effect. Track only the state keys that affect persistence — skip undo stacks, timer refs, transient UI flags. Unsubscribe + flush on effect cleanup (handles clip switch and editor unmount).
5. Add console log `[autosave] saved clipId=… in XXXms` at debug level so we can confirm in `trim-debug.log` after crashes.
6. Build + `npm start` + manually edit subtitles for 60s without clicking Save → force-kill the renderer via Task Manager → reopen clip → verify edits survived.

### Verification
- [ ] `npx react-scripts build` clean, no console warnings
- [ ] App launches, editor opens a clip
- [ ] Edit a subtitle word → wait 1s → check `trim-debug.log` for `[autosave] saved` line
- [ ] Rapid-fire 10 edits in 2s → see only 1–2 save calls (debounce works)
- [ ] Click away to another window → see immediate `[autosave] saved` (blur flush)
- [ ] Explicit Save button still shows "Saved" flash (regression check)
- [ ] Kill renderer via Task Manager mid-edit → reopen clip → all edits + styling + NLE segments + title restored
- [ ] Switch to another clip → outgoing clip's edits flushed before new clip's `loadClip` runs
- [ ] Sentry: no new error volume from autosave itself (watch for 24h)

### Follow-up (separate issues, not this task)
- Update #35 with fresh breadcrumb pattern + broader scope (projects tab crashes too, not just editor)
- #35 fix is still its own work — autosave mitigates, doesn't resolve

---

## ✅ Completed — Previous Tasks
(See git history for details)
