# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

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
