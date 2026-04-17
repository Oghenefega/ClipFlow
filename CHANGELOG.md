# Changelog

All notable changes to ClipFlow are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — 2026-04-16 (session 5) — B1 refactor + editor autosave

### Added
- **Editor autosave (resolves #36)**: Debounced (800ms) silent save of editor state — subtitles, caption text/segments, NLE segments, title, and full per-clip subtitle+caption style snapshots — triggered on any edit across `useSubtitleStore` / `useCaptionStore` / `useLayoutStore` / `useEditorStore`. Additional flushes fire on `window.blur` and editor unmount. Renderer crashes (#35 `blink::DOMDataStore` 0xC0000005) no longer wipe unsaved work — at most ~800ms of edits are lost. Verified with force-kill renderer via Task Manager: edits survived reopen. Implementation notes: timer + in-flight counter live in module closure (not Zustand state) to prevent infinite subscribe loops when `set({ dirty: false })` fires during a save. Counter (not boolean) so concurrent explicit-Save + autosave both run when user edits during an in-flight IPC. Existing Save button UI, clip-switch save, back-button save, and queue-and-render flows are unchanged — all route through the refactored shared `_doSilentSave` helper.

### Changed
- **B1 subtitle-extends refactor (cleanup of earlier take-2 fix)**: Primary subtitle source (clip.transcription / clip.subtitles.sub1) and the source-wide extras merged from project.transcription for extends-coverage now run through the same cleanup pipeline (mega-segment filter, duplicate-segment dedup, consecutive-word dedup, word-token merge, validation, timestamp cleanup). Previously extras bypassed those steps. No user-visible regression — pipeline output for the primary-only case is identical to before.

### Notes
- **#36 (editor autosave)** — closed. Autosave is live and verified.
- **#35 (renderer crash)** — still unresolved. Autosave makes crashes non-destructive, which is a major UX win, but does not address the underlying `blink::DOMDataStore` fault. Sentry data from this session (57 events) shows crash also fires in the projects tab, not just editor — #35 scope updated accordingly.
- **New chore filed (#44)**: `setSegmentMode` is called twice on init path, triggering double-dedup log. Harmless but wasteful.

## [Unreleased] — 2026-04-16 (session 4) — Phase 4 post-test triage

### Notes (no code changes in this slice — planning + diagnostics only)
- **Renderer crash is NOT fixed.** Mitigations A/B shipped earlier in the session; crash recurred at 14:51:56 on the new build (~2 min into editor work, same exit code `-1073741819` / `0xC0000005`). Root cause still unknown. Documented in HANDOFF as task B2 (needs `crashReporter` minidumps + renderer error instrumentation before further investigation).
- **New bug B1 identified (root cause found, fix deferred to next session):** `useSubtitleStore.initSegments` filters source-wide transcription down to the original `[clip.startTime, clip.endTime]` range at editor-open time. When the user extends the clip afterwards, the subtitles that would populate the new range were already discarded — Phase 4's "extends reveal already-transcribed audio" promise is only half-kept. Specific lines in HANDOFF.
- **New bug B2a identified:** no editor autosave. Every renderer crash = full loss of unsaved editor state, because `App.js` defaults `useState("rename")` on remount.
- **Subtitle mismatch regression (B3):** reported by user, no specifics yet — parked pending repro.
- **Full prioritized 10-item bug/cleanup board** written to HANDOFF and TodoWrite.

## [Unreleased] — 2026-04-16 (session 4) — Phase 4 hardening: renderer-crash mitigations

### Fixed
- **Renderer crash (ACCESS_VIOLATION 0xC0000005) in `blink::DOMDataStore`**: Observed once during Phase 4 testing, ~6 min into a session before any trim operations. Root cause was the combination of (a) `<video>` now streaming full source recordings (hundreds of MB to GB, vs tens of MB for old pre-cut clips) and (b) React swapping the `src` prop in place, leaving the previous stream's ArrayBuffer in flight while the new fetch started. On large files that overlap window is big enough for Chromium to tear down a detached ArrayBuffer and null-deref.
- **Mitigation A — `preload="auto"` → `preload="metadata"`** on the editor `<video>`. Still fires `onLoadedMetadata` (all Phase 4 needs for duration, seek-to-segment-start, and waveform kickoff). Actual media bytes stream on `play()` — dramatically smaller in-flight buffer during mount/unmount cycles.
- **Mitigation B — Imperative `src` management** replaces `<video src={videoSrc}>` JSX prop. New effect pauses + removes the old src + calls `load()` BEFORE assigning the new src, eliminating the overlapping-ArrayBuffer race. The prior `useRef`-tracked `load()`-after-swap shim is gone.

## [Unreleased] — 2026-04-16 (session 3) — Phase 4: Source-file preview

### Changed
- **Editor preview switched to source-file playback (Phase 4)**: The `<video>` element now plays the full source recording (`project.sourceFile`) instead of a pre-cut clip file. NLE segments (source-absolute coords) are the sole definition of what's visible on the timeline. Trims and extends are now **instant** — no FFmpeg recut, no video reload, no "extending" loading state. This matches the standard DaVinci Resolve / Premiere NLE architecture (media pool + timeline clips as pointers into source). `clipFileOffset` is now permanently `0` since `video.currentTime` IS source-absolute time.
- **Waveform peaks now extracted from source recording with disk cache**: New IPC `waveform:extractCached` extracts peaks from the full source file once per `{sourceFile, mtime, size, peakCount}` tuple and caches to `{projectDir}/.waveforms/*.json`. Subsequent opens read the JSON instantly (no FFmpeg). Peak count scales with duration (~4 peaks/sec, capped at 8000) so a 30-min source gets ~7200 peaks in ~40KB. Waveform never stretches during trim/extend because peaks cover the full source, not the trimmed clip.
- **Render pipeline is now the only consumer of clip files**: Existing NLE-aware render path (from 2026-04-13) handles everything. To ensure render always has segments, every clip created by the AI pipeline now gets an initial `nleSegments: [{ sourceStart, sourceEnd }]` at import time — no more fallback to clip-file-only rendering.

### Added
- **Media Offline state**: When `project.sourceFile` is missing from disk (user moved/renamed/deleted the OBS recording), the editor displays a red "Media Offline" banner in the preview area with the missing path and a **Locate file…** button. Clicking opens a file picker; selecting the moved recording updates `project.sourceFile` and restores preview. Matches DaVinci's offline-media UX. No silent fallback to clip files.
- **`project:locateSource` IPC** + `projectLocateSource` preload bridge to drive the Locate-file flow.

### Fixed
- **Waveform stretches during extend (previously visible as stretched audio peaks while dragging a trim handle past the original clip bounds)**: Root cause was peaks being sliced from a small clip-file range that didn't cover the extended area. Now resolved because peaks span the full source.
- **"Clip has to load after every extend" loading delay**: Eliminated entirely. Extends/trims apply instantly via segment-bound updates; no video reload, no FFmpeg.
- **Playhead snap-back when extending past original clip boundaries**: Eliminated as a class. `video.currentTime` can now reach any point in the source recording that a segment references.

### Removed
- `commitNleExtendCheck` action in `useEditorStore.js` (~150 lines) — the FFmpeg-recut-on-extend pathway is no longer needed.
- `onExtendCommit` prop and callback wiring from `WaveformTrack.js` + `TimelinePanelNew.js` — pointerup no longer triggers a recut.

### Technical notes
- `clip.filePath` (pre-cut clip file) is retained in project JSON for now. The editor no longer reads from it. Per-clip retranscription (Stage 7b in `ai-pipeline.js`) still consumes it; a follow-up can replace that with direct audio extraction from source + in/out.
- Legacy IPC handlers `clip:extend` and `clip:extendLeft` remain in `main.js` as dead code. Not called from the editor anymore. Can be deleted in a cleanup pass.
- `project.transcription` is generated from the full source at project creation and is source-absolute, so extends reveal already-transcribed audio with no Whisper re-run needed.

## [Unreleased] — 2026-04-14 (session 2)

### Fixed
- **Bug A — Waveform peak misalignment after trim**: Waveform peaks drifted out of sync with audio after a left-trim because `TimelinePanelNew` was passing the timeline `duration` (which shrinks on trim) to `WaveformTrack` as the clip-file denominator. Introduced separate `clipFileDuration` field in `usePlaybackStore`, set once from `video.duration` on `loadedmetadata`. Waveform peak slicing now uses the unchanging clip-file extent.
- **Bug C — Segment body "zooms" during active left-trim drag**: While dragging a trim handle, the pixel-per-second scale was recomputing live from the shrinking timeline duration, causing all segments to reflow under the cursor. Fixed by adding a `trimSnapshot` useState in `TimelinePanelNew` that freezes the pixel scale for the duration of the drag. `WaveformTrack` now fires `onTrimStart`/`onTrimEnd` callbacks from pointerdown/pointerup. Trim math still commits live — only the visual scale is frozen.
- **Bug B — Subtitle track drift**: Resolved as a downstream side effect of A + C — timeline subtitle rendering already used `visibleSubtitleSegments`, so once pixel scales stabilized, words re-aligned with audio.
- **Subtitle clamp at segment level**: Subtitles whose start OR end fell into a trimmed region were being dropped wholesale, making subs vanish the moment a trim touched them. `visibleSubtitleSegments` in `timeMapping.js` now clamps start/end to the kept overlap — a sub only disappears when NO part of its range overlaps any kept segment.
- **Subtitle clamp at word level**: Same fix applied to `visibleWords` — individual words now clamp to segment boundaries instead of dropping when only their start is in a deleted region. Subs now vanish when the trim crosses their **end**, not their start (per user requirement).
- **Floating-point segment boundary tolerance**: Added `BOUNDARY_EPS = 0.001` to `sourceToTimeline` so sub-millisecond FP drift at `sourceStart`/`sourceEnd` no longer reports a time as "outside" the segment. Also applied same tolerance to the "is current position inside any segment?" check in `setNleSegments`.

### Changed
- **Subtitle clustering removed**: Tried multi-tier and binary clustering approaches — user rejected both in favor of always-individual subtitle rendering. Stripped all clustering logic from `TimelinePanelNew`; subs now map 1:1 from `visibleSubtitleSegments`. Dead constants (`MERGE_THRESHOLD`, `CLUSTER_GAP_PX`, `CLUSTER_MIN_WIDTH_PX`) left in `timelineConstants.js` for next session cleanup.

### Known Issues
- **Snap-to-0 on ruler click (pre-trim only, UNFIXED)**: On a freshly opened untrimmed clip, clicking the ruler snaps the playhead back to 0 and prevents play. After any trim, the bug disappears for the rest of the session. Logs show an infinite `onTimeUpdate` loop with `needsSeek: true, seekToSource: 0`. FP-epsilon fix did not resolve it; hypothesis now shifted to duplicate `setNleSegments` calls during init re-triggering the `snapToFirst` branch. Investigation plan in HANDOFF.md.

## [Unreleased] — 2026-04-14

### Fixed
- **Trim-left freeze (root cause)**: Trimming the left edge of a clip caused playback to freeze entirely (spacebar/play unresponsive, video element stalled at `readyState=1`). Root cause was a coordinate-space mismatch: `usePlaybackStore` treated `video.currentTime` as source-absolute when the element actually plays the pre-cut clip file (clip-relative). Fixed by introducing `clipFileOffset` in the playback store and routing every conversion through it: `sourceAbs = vidTime + clipFileOffset`, and writing `vid.currentTime = targetSourceAbs - clipFileOffset`. `setNleSegments`, `seekTo`, and `mapSourceTime` all updated. Editor store now sets `clipFileOffset` from the initial segment's `sourceStart` before calling `setNleSegments`.
- **Timeline playhead past trimmed end**: The timeline's rAF was feeding clip-relative `video.currentTime` directly into the ruler (timeline coords). On a left-trim, the playhead marched past the new timeline end. Fixed by routing through `usePlaybackStore.mapSourceTime()` so the ruler always renders in timeline coordinates.
- **rAF seek storm preventing play()**: `PreviewPanelNew`'s rAF loop was writing `video.currentTime = seekToSource` every frame while the element was already seeking, which prevented `play()` from ever resolving. Now guarded by `!video.seeking && Math.abs(delta) > 0.05`.

### Added
- **Renderer crash + console forwarder (debug, temporary)**: `main.js` now auto-opens detached DevTools and appends every renderer console message to `%APPDATA%/clipflow/trim-debug.log`, plus a `render-process-gone` handler. The logger and forced DevTools will be removed once the remaining three trim rendering bugs (waveform, subtitle track, segment drag visual) are fixed; the crash handler stays.

### Known Issues
- Left-trim still visually breaks three rendering layers (same coordinate-space root cause, unfixed): waveform peaks desync with audio, timeline subtitle words drift off speech, and segment body "zooms" during active drag instead of shrinking. All have helpers ready in `timeMapping.js` (`getSegmentTimelineRange`, `visibleSubtitleSegments`, `buildTimelineLayout`). See HANDOFF.md for fix plan.

## [Unreleased] — 2026-04-13

### Added
- **NLE-aware render pipeline (Phase 4)**: `render.js` now assembles the final video from `sourceFile + nleSegments` using FFmpeg `trim`/`atrim`/`concat` filter_complex instead of requiring pre-cut clip files. Single-segment clips use simple trim; multi-segment clips concat. Falls back to legacy `clipData.filePath` behavior only when no NLE segments exist.
- **Source FPS preservation**: Added `probeFps()` and forced `-r` flag on render output. Fixes the known 60fps→25fps drop bug by matching the source recording's frame rate.
- **Batch render subtitle auto-mapping**: Batch render detects source-absolute subtitles via `_format` marker and maps to timeline time internally (single-clip render already did this in EditorLayout).
- **Phase 3D migration tests**: Added 9 tests covering old audioSegments→NLE conversion, subtitle offset migration, round-trip save/load, double-offset prevention, and the new ID/index lookup API for `getSegmentTimelineRange`. Test suite now 74/74 pass.
- **QueueView redesign**: 716-line rewrite of the Queue tab with expanded layout and improved scheduling UX (uncommitted from previous session, now landed).
- **Commercial architecture references**: Added `reference/commercial-electron-architecture.md` and `reference/social-media-api-research.md`. Upgraded `TECHNICAL_SUMMARY.md` to v3.

### Changed
- **Render subtitle flow**: `EditorLayout.doQueueAndRender` now maps subtitles from source-absolute to timeline time via `visibleSubtitleSegments()` before sending to the overlay renderer. Passes `nleSegments` in clip data.
- **Subtitle overlay renderer**: Accepts explicit `timelineDuration` parameter (NLE mode skips ffprobe duration call) and separate `resolutionProbeFile` path (still probes the source for video dimensions).
- **getSegmentTimelineRange API**: Swapped parameter order to `(idOrIndex, segments)` and now accepts either a segment ID string or numeric index. Returns `null` for invalid lookups instead of an empty range.
- **Queue badge count**: Only counts unscheduled approved/ready clips (scheduled ones no longer inflate the count).
- **Waveform alignment**: Fixed `WaveformTrack` peak slicing to offset by `clipOrigin` when converting source-absolute NLE coords to clip-relative frame positions.

### Fixed
- **Video source playback**: Reverted `PreviewPanelNew` from `project.sourceFile` back to `clip.filePath` (segment-aware source playback is deferred to a later phase — current NLE model still relies on pre-cut clip files for playback). Added `initNleSegments` call on video load for clips without saved segments.

## [Unreleased] — 2026-04-07

### Added
- **Non-destructive NLE segment model**: New pure-function architecture where audio segments are source-file references (`{ sourceStart, sourceEnd }`), timeline position is always derived (never stored), and edit operations (split, delete, trim, extend) are instant with no FFmpeg calls. Includes 65 unit tests covering all operations, coordinate roundtrips, and subtitle visibility mapping. Foundation for eliminating subtitle sync bugs by construction.
- **Segment-aware playback engine**: Playback store converts between source time and timeline time, with automatic gap-crossing at segment boundaries. Video element plays the original source file directly instead of re-encoded clips.
- **Architecture plan**: Full 5-phase implementation plan for non-destructive editing documented in `tasks/nle-architecture-plan.md`, validated by 5-advisor LLM council session.
- **"Research Before Editing" rule**: Added as non-negotiable section in CLAUDE.md — all affected files must be read before any code changes.

### Changed
- **Video preview source**: Preview panel now loads from `project.sourceFile` (original recording) instead of `clip.filePath` (re-encoded clip), with legacy fallback for old projects.
- **Waveform extraction**: Now extracts 800 peaks from source file (up from 400 from clip file), cached once per project since source never changes.
- **Editor store**: Added `nleSegments` state with migration from old `audioSegments` format on load. New instant actions (`splitAtTimeline`, `deleteNleSegment`, `trimNleSegmentLeft/Right`, `extendNleSegmentLeft/Right`) replace legacy destructive actions.
- **Subtitle store (Phase 3B)**: Timestamps are now source-absolute internally. Added `getTimelineMappedSegments()` selector that converts source-absolute → timeline coordinates for UI display. `_displayFmt()` helper keeps formatted timestamps showing clip-relative times while `startSec`/`endSec` are source-absolute. Undo snapshots capture `nleSegments` instead of old `audioSegments`/`clipMeta`. Saved subtitles use `_format: "source-absolute"` marker for backward compatibility.
- **Timeline UI (Phase 3C)**: `TimelinePanelNew.js` fully wired to NLE model — all operations (`split`, `delete`, `trim`, `resize`, `drag`) use `nleSegments` and pure functions. Removed all `leftOffset`, `audioMaxEnd`, `extending` concepts. Audio track renders from `nleSegments` with derived timeline positions. `WaveformTrack.js` rewritten with source-absolute peak slicing and NLE trim handles. `SegmentBlock.js` simplified (position derived from `seg.startSec / duration`). Subtitle resize/drag handlers use dual-coordinate-space pattern: timeline originals for overlap detection, `toSource()` conversion at store call sites.

### Discovered
- **60fps frame drop bug**: `cutClip` in `ffmpeg.js` is missing `-r 60` flag, causing source 60fps HEVC to be re-encoded to 25fps H.264. Fix planned for Phase 4 export pipeline rebuild.

- **Concat recut for mid-clip deletes**: New `concatCutClip` FFmpeg function and `clip:concatRecut` IPC handler that splices only the kept segments from the source recording, physically removing deleted mid-sections from the clip file instead of just trimming outer bounds.
- **Audio segment sourceOffset tracking**: Audio segments now track their shift from original file position, used by WaveformTrack to slice correct peaks after ripple shifts.

### Fixed
- **Subtitles not trimmed when clip is trimmed and saved**: `handleSave` now wraps editSegments as `{ sub1: [...] }` matching the format `initSegments` expects on reload. Added legacy flat-array fallback for clips saved before this fix.
- **Stale transcription overriding saved subtitles after trim**: `initSegments` now detects when `clip.transcription` spans significantly longer than the current clip duration and skips it, falling through to the correctly-saved `clip.subtitles`. Also clears `clip.transcription` on recut.
- **Waveform not regenerated after recut**: `waveformPeaks` is now set to `null` after any recut operation (delete, trim, revert), triggering fresh FFmpeg extraction from the new video file.
- **Waveform extracting wrong audio track**: `extractWaveformPeaks` now uses the configured `transcriptionAudioTrack` setting instead of FFmpeg's default stream, ensuring the waveform matches the same audio used for transcription (mic, not game audio).
- **Duplicate subtitles from whisperx**: Added segment-level and word-level deduplication that strips punctuation before comparing, catching cases like "friendly," and "friendly" being output as separate entries.
- **EPIPE crash dialog on app quit**: Added uncaughtException handler that suppresses EPIPE errors from Sentry/electron-log writing to a closed stdout pipe.
- **Missing upper bound filter in initSegments**: When falling back to project transcription with `clipStart=0`, `clipEnd` now uses `clip.duration` instead of `Infinity`, preventing segments past the trimmed end from loading.

### Known Issues
- **Subtitle/waveform alignment after mid-clip delete is still broken**: The concat recut approach was just introduced and needs testing. Subtitle shifting during `_trimToAudioBounds` may not correctly map to the new concatenated file's timeline. This is the top priority for the next session.

---

## [Unreleased] — 2026-04-06

### Added
- **Audio track setting for transcription**: New "Audio Track to Transcribe" selector in Settings (BetterWhisperX section) lets users choose which OBS audio track (1-4) to use for transcription. Saves immediately to electron-store.

### Fixed
- **Transcription using wrong audio track**: Default audio track was set to Track 2 (game audio) instead of Track 1 (mic). Changed default to Track 0 (Track 1 / mic) across all extraction points — main pipeline, retranscribe handler, and ffmpeg:extractAudio IPC. Includes a one-time migration for existing installs.
- **AI-generated titles and captions contained emojis**: Added explicit "no emojis" rules to both the title/caption generation prompt and the clip detection prompt. Three layers of reinforcement: per-section rules, DO NOT list, and example emoji characters to avoid.
- **PostHog shutdown crash on app close (CLIPFLOW-3)**: `posthog.shutdown()` was called on every `beforeunload` event, but PostHog JS SDK v1.364.5 has no `shutdown()` method — causing a TypeError 68 times in Sentry. Removed the broken handler; PostHog handles flush-on-unload automatically.
- **AI title/caption generation now uses trimmed transcript**: Previously, generating titles and captions in the editor always sent the full original clip transcript to the AI, ignoring timeline trims, segment deletions, and text edits. Now reads the current `editSegments` from the subtitle store, so the AI sees exactly what will appear in the final video. Also means user-corrected transcription text (e.g., fixing Whisper errors) is reflected in generated titles.

---

## [Unreleased] — 2026-04-03

### Added
- **Queue tab dashboard layout**: Replaced card-based queue with a dashboard table featuring a 4-stat bar (Queued, Scheduled, Published Today, Failed), sortable table rows with 9:16 vertical thumbnails, and click-to-expand inline detail panels with editable titles, platform icons, schedule picker, and publish actions.
- **Drag-to-reorder queue clips**: Installed @dnd-kit and added sortable rows with grip handles. Persists `queueOrder` integer on each clip in project.json. Reordering works across all clips regardless of game type.
- **Thumbnail extraction at render time**: After clip render completes, automatically extracts a frame at t=1s via FFmpeg and saves as `_thumb.jpg` alongside the rendered video. Populates the existing `thumbnailPath` field on the clip object. Works for both single and batch renders.
- **Dequeue (remove from queue)**: New `"dequeued"` clip status. Remove button on each clip sets this status so the clip leaves the queue without losing its approval — can be re-approved in the Editor to re-queue it.

### Changed
- **Queue tab layout**: Migrated from inline-style cards to a grid-based dashboard table. Stats bar replaces the old Main/Other game count cards. Publishing accounts section removed (info now visible per-clip via platform icons).

---

## [Unreleased] — 2026-04-03

### Added
- **Word timestamp post-processing pipeline** (`cleanWordTimestamps.js`): 4-pass correction for Whisper's raw word timestamps — monotonicity enforcement, minimum 50ms duration, micro-gap filling (150ms), and suspicious timestamp detection with character-count redistribution. Runs automatically at segment initialization.
- **Unified word-driven highlight lookup** (`findActiveWord.js`): Shared algorithm used by both the editor preview and the burn-in renderer, eliminating timing divergence between what you see in the editor and what appears in exported video. syncOffset now applied in burn-in path.
- **Progressive karaoke highlight** (opt-in): Aegisub-style gradual fill across each word, available as `highlightMode: "progressive"`. Original instant highlight remains the default.
- **Expanded subtitle segmentation rules**: Added contractions (let's, I'm, I'll, we're, etc.), auxiliaries (is, are, was, will, etc.), and demonstratives (that, this, these, those) to forward connectors. Added atomic phrases ("light work", "let's get", "real quick", etc.) that are never split across segments. Unicode apostrophe normalization for consistent word matching.

### Improved
- **Segment timing accuracy**: startSec clamped to first word (no early segment display), last word extended through linger time, intra-segment gaps filled. Segments now tightly track actual speech boundaries.

### Fixed
- **Subtitle timing drift**: Whisper's DTW-based word alignment produces near-zero durations, overestimated gaps, and cumulative drift. The new 4-pass post-processing pipeline corrects these before segmentation, significantly reducing karaoke highlight drift.

---

## [Unreleased] — 2026-04-03

### Fixed
- **Editor style persistence:** Saved subtitle and caption customizations (color, position, font, effects) now persist when navigating away from the Editor tab and back. Root cause: `initFromContext()` always applied the default template on mount, overwriting saved `clip.subtitleStyle` and `clip.captionStyle`. Template now provides defaults, then saved customizations are restored on top via new `restoreSavedStyle()` methods on both stores.
- **Caption style save was silently broken:** `handleSave()` was reading unprefixed property names from the caption store (`capState.fontFamily` instead of `capState.captionFontFamily`), causing all caption styling to save as `undefined`. Fixed to use correct prefixed names and expanded to save all caption effects (stroke, shadow, glow, background) — previously only saved 7 basic fields.

### Improved
- **Subtitle segmentation — forward connector rule:** Expanded the "never end a segment on 'I'" rule to cover 19 forward-connecting words: prepositions (to, in, on, at, for, of, with, from, by), articles (a, an, the), and conjunctions (and, but, or, so, if, as). Words that grammatically connect forward now start the next segment instead of dangling at the end. Edge case: if the connector is the last word before a hard pause, it stays with the preceding segment.

### Added
- **Subtitle timing rebuild spec:** Full 4-phase spec for fixing karaoke timing drift, based on research into whisper-timestamped, stable-ts, CrisperWhisper, WhisperX, and Aegisub. Covers word timestamp post-processing, progressive karaoke highlight, unified preview/burn-in algorithms, and segmentation safe fixes. See `tasks/subtitle-timing-rebuild-spec.md`.

---

## [Unreleased] — 2026-04-03

### Added
- **clipflow-optimize skill:** Profile-driven performance optimization adapted from `extreme-software-optimization`. Covers React re-renders, IPC batching, memory leaks, startup time, FFmpeg pipeline, and Whisper transcription with measure-first methodology and opportunity scoring.
- **clipflow-mock-finder skill:** Multi-method stub/placeholder detection — keyword search, suspicious return values, short function analysis, behavioral detection (fake delays, hardcoded scores), and caller tracing. Produces categorized findings table.
- **clipflow-ux-audit skill:** Nielsen's 10 heuristics mapped to ClipFlow's views, Big 4 accessibility checks, user flow analysis with happy/error paths, and prioritized reporting template.
- **research-software skill (global):** Source-code-first research methodology for investigating dependencies — clone at stable tag, grep for hidden flags/env vars, mine PRs and tests, structured output.

### Fixed
- **Critical blank screen crash resolved:** Root cause identified via Sentry as a Chromium renderer process crash (`blink::DOMDataStore::GetWrapper` — EXCEPTION_ACCESS_VIOLATION_READ). Video elements were being removed from the DOM while Chromium's internal fetch stream was still reading the file, causing a null pointer dereference in Blink. Fixed by adding `useEffect` cleanup hooks that abort video loading before unmount (`pause()` + `removeAttribute("src")` + `load()`). Applied to both PreviewPanelNew.js (editor) and ProjectsView.js (projects preview).

### Added
- **Sentry API integration:** Personal API token configured for querying Sentry errors directly from development sessions. Org `flowve`, project `clipflow`.
- **DOM-level crash recovery:** Added global `window.error` and `unhandledrejection` handlers in index.js that render a crash screen directly to the DOM, bypassing React entirely. Ensures users always see an error message even if the React tree is dead.
- **Renderer crash detection:** Added `render-process-gone`, `unresponsive`, and `responsive` event handlers on Electron webContents in main.js. Auto-reloads the renderer on non-clean-exit crashes.
- **ClipPreviewBoundary error boundary:** Wraps clip video players in ProjectsView so bad clip data shows a "Preview error" with retry button instead of crashing the entire app.
- **Defensive guards:** Protected `currentSeg.text.split()` in PreviewOverlays.js against null text, guarded `applyTemplate()` against malformed templates, wrapped `posthog.capture` in try-catch during tab navigation, made AppErrorBoundary robust against Sentry import failures.
- **Shared preview overlays:** Extracted `SubtitleOverlay` and `CaptionOverlay` into shared components (`PreviewOverlays.js`) used by both Editor and Projects tabs, eliminating ~200 lines of duplicate rendering code and ensuring Projects preview matches Editor exactly.
- **Tracker tab:** Extracted the full schedule tracker (stat cards, weekly grid, Edit Template, Export/Import, presets, undo/redo, drag-to-reorder, popovers) out of Queue into its own standalone TrackerView tab with a 📊 icon in the nav bar.
- **Captions section in Queue tab:** The Captions & Descriptions content (YouTube descriptions + Other Platforms templates) is now embedded directly in the Queue tab below the publish log as a natural scroll continuation, replacing the standalone Captions tab.

### Fixed
- **Projects preview yPercent:** Projects tab now reads saved clip position values instead of always falling back to template defaults, so subtitle/caption positions saved in the Editor are correctly reflected in Projects preview.
- **DraggableOverlay blank screen:** Gated DraggableOverlay on `editSegments.length > 0` to prevent it from mounting when no segments exist, which was contributing to app blank screen crashes.

### Changed
- **Navigation restructured:** Tab order is now Rename → Recordings → Projects → Editor → Queue → Tracker → Settings. The Captions tab has been removed from the nav bar.
- **Sequential-immediate publishing:** Removed the 30-second stagger delay between platform uploads. Publishing now proceeds immediately from one platform to the next with no artificial wait. The "30s stagger" label has been removed from the publishing accounts info bar.

### Removed
- **Captions tab:** No longer a standalone tab — content is now part of the Queue tab.
- **30s stagger delay:** The `STAGGER_MS` constant and `setTimeout` between platform uploads have been removed from the publish pipeline.

## 2026-04-03

### Added
- **Test watch folder:** Secondary configurable watch folder for testing the full pipeline without polluting real content history. Configurable in Settings under "Files & Folders" with a yellow DEV badge. Runs a separate chokidar watcher instance alongside the main one — same OBS filename pattern detection, same rename/recording/clip/editor/queue pipeline.
- **Test file tracking (is_test flag):** Files originating from the test folder are flagged `is_test = 1` in the `file_metadata` SQLite table (schema migration V4). The flag propagates through split children automatically.
- **Test group in Recordings tab:** Test files appear in a dedicated "Test" group pinned to the top of the Recordings tab instead of their date-based month group. Same card style, grid layout, and collapse/expand behavior as normal month groups.
- **TEST badge in Rename tab:** Pending files from the test watcher show a yellow "TEST" pill between the filename and rename preview arrow so test clips are visually distinguishable.
- **Project tags system:** Projects now have a `tags` array field in their JSON schema. Projects generated from test recordings automatically receive a `tags: ["test"]` value. A yellow "TEST" pill appears on project cards in the Projects tab.
- **Test render output isolation:** Rendered clips from test projects are saved to `{testWatchFolder}\ClipFlow Renders\` instead of the main output folder, keeping all test artifacts self-contained for easy cleanup.

### Changed
- **Watcher refactored to shared handler:** The OBS file detection logic (pattern matching, pendingImports check, IPC dispatch) was extracted into `handleWatcherFileAdded()` and `createOBSWatcher()` functions — both the main and test watchers share the same code path with zero duplication.
- **Pending file dedup uses filePath instead of fileName:** Prevents edge case where the same OBS filename in both folders would cause the second detection to be silently dropped.
- **Same-folder guard:** Setting the test folder to the same path as the main watch folder is rejected at the IPC level to prevent duplicate detections.

### Fixed
- **Preview thumbnail collision for files in same directory:** The `fileId` used for preview frame temp directories was generated by truncating base64url-encoded paths to 32 characters. Files in the same folder shared an identical prefix after truncation, causing all preview frames to overwrite each other in the same temp directory. Fixed by using MD5 hash of the full path. Also affects scrubber thumbnail strips.

- **Video preview thumbnails in Rename tab:** Each pending file card now shows a 160x90px thumbnail on the left side. Frames are extracted at smart positions based on video duration (1-4 frames scaling with length). On hover, thumbnails crossfade through frames every ~1 second so you can identify the game at a glance without opening the file. Uses a concurrency-limited FFmpeg extraction pipeline (max 2 simultaneous).
- **Inline preset name picker:** Clicking the colored renamed filename opens a dropdown showing all 6 naming formats with their actual rendered values for that file. Replaces the old preset `<Select>` dropdown, saving significant space in the controls row.
- **Click-to-edit Day/Pt pill controls:** Replaced the +/- spinbox buttons with clean pill-style controls. Click the number to type a new value, or scroll wheel to increment/decrement. No visible buttons — much more compact.
- **Last-renamed game auto-selection:** After renaming a file as a specific game, newly detected files automatically default to that game instead of requiring manual selection each time.
- **"split video" button:** Renamed from "split by game" and now visible for all probed files (previously only showed for recordings over a threshold).

### Changed
- **Color-matched UI elements:** Day/Pt pills, renamed filename text, preset dropdown highlights, and game dropdown border all use the game's assigned color for visual unity across the card.
- **Unified control sizing:** Game dropdown, Day pill, and Pt pill all share the same 36px height for consistent alignment.
- **GamePill centering fix:** Small size variant now properly vertically centers text with explicit alignItems/justifyContent and lineHeight.
- **RENAME/HIDE buttons tightened:** Smaller padding and font size to match the more compact card layout.
- **PillSpinbox component (new):** Reusable pill-style number input in shared.js with scroll wheel support and fixed-width editing.

## 2026-04-02

### Added
- **Pixel-perfect subtitle/caption burn-in for rendered clips:** Rendered clips now have subtitles and captions that exactly match the editor preview. Uses an offscreen Electron BrowserWindow with the same `subtitleStyleEngine.js` and CSS rendering as the editor, capturing PNG frames and compositing them via FFmpeg. Supports all styling: multi-ring strokes, glow, karaoke word highlighting, DM Sans/Latina Essential fonts, and caption positioning.
- **Offscreen overlay renderer (`subtitle-overlay-renderer.js`):** New module that creates a transparent BrowserWindow at source video resolution, injects the shared style engine, captures sequential PNG frames at 10fps, and returns them for FFmpeg compositing.
- **Overlay HTML renderer (`public/subtitle-overlay/`):** DOM-based renderer running inside the offscreen window, implementing the same `findActiveWord`, `buildCharChunks`, `renderSubtitle`, and `renderCaption` logic as `PreviewPanelNew.js`.

### Fixed
- **AI titles/captions persisting between clips:** Generated titles, captions, and accepted/rejected state from one clip were leaking into the next when switching clips in the editor. Added `useAIStore.getState().reset()` to the clip-switching logic in `useEditorStore.initFromContext()`.
- **Cloudflare AI Gateway 2009 Unauthorized on all requests:** The default gateway URL had a truncated Cloudflare account ID (29 chars instead of 32, missing `ef9` segment). Every gateway request hit a nonexistent endpoint. Fixed the stored URL default in `main.js`.
- **Gateway BYOK auth conflict:** When using Cloudflare Provider Keys (BYOK), the app was sending both `x-api-key` and `cf-aig-authorization`, causing Cloudflare to reject requests. BYOK mode now sends only `cf-aig-authorization`; direct/passthrough mode sends only `x-api-key`.
- **Delete project not allowing re-generation:** Deleting a project didn't clear the SQLite "done" status or electron-store doneRecordings entry. The `isDone()` check has three conditions; now all three are cleared on deletion via fileMetadataId lookup, project name fallback, and doneRecordings key matching. Added orphan reconciliation on project list load for files stuck from pre-fix deletions.
- **"Unmark done" button missing on SQLite-status files:** Files marked as "done" by SQLite status (not manual mark) had no way to reset. Added an × button on the DONE badge that resets SQLite status to "renamed" and refreshes the file list.
- **Subtitle/caption Y positions wrong in Projects preview:** Editor save code read `yPercent` from the wrong store (`subPos` legacy slider instead of `useLayoutStore.subYPercent`). Fixed save to read from layout store. Projects view now prefers template positions over saved clip values.
- **Pop animation missing in Projects preview:** FALLBACK_TEMPLATE was missing animation fields (`animateOn`, `animateScale`, `animateGrowFrom`, `animateSpeed`). Added them and made animation config prefer the user's selected template over per-clip saved values.
- **Subtitle timing drift in Projects preview:** Time updates used `timeupdate` event (~4Hz) causing words to be skipped. Replaced with `requestAnimationFrame` loop (~60Hz) matching the editor's approach. Also added `syncOffset` support from saved clip data.
- **Whisper hallucination cascade ("Let's go" bug):** Whisper's `condition_on_previous_text=True` default caused hallucination loops on gaming audio — one hallucinated phrase would feed back into the next 30-second chunk and repeat for the entire recording. Set `condition_on_previous_text=False` so each chunk is transcribed independently.

### Added
- **Per-clip retranscription in pipeline (Stage 7b):** After clips are cut, each clip gets its own fresh Whisper run on its short audio. Produces far more accurate subtitles than slicing from the source transcription. Stored in `clip.transcription` which the editor already prioritizes.
- **Retranscription failure flag:** If per-clip retranscription fails, the clip is flagged with `transcriptionFailed: true` and `transcriptionError`. A red "⚠ Subs failed" badge appears in the Projects tab so the user knows which clips need manual re-transcription.
- **Shared subtitle rendering engine:** Extracted pure functions (`buildSubtitleStyle`, `buildSubtitleShadows`, `buildCaptionStyle`, etc.) into `subtitleStyleEngine.js`. Both editor and Projects preview now use the same rendering logic, eliminating visual drift.
- **Video pause on play another:** Playing a preview video in the Projects tab now pauses any other playing video via a module-level singleton ref.
- **Three gateway routing modes:** Refactored Anthropic provider to support BYOK (cf-aig-authorization, no API key), passthrough (API key through gateway for logging/analytics), and direct (API key to Anthropic). Mode is determined by which Settings fields are populated.
- **BYOK-only mode:** Users with Cloudflare Provider Keys no longer need a local Anthropic API key configured.
- **Gateway error detection:** Cloudflare returns errors as JSON arrays, not Anthropic-style objects. Added proper detection, logging, and user-facing error messages for gateway-specific failures.
- **HTTP status code logging:** All Anthropic API responses now log HTTP status codes and response size for debugging.
- **Subtitle segmentation spec v1.2:** Added Rules 6 (Never End on "I"), 7 (Comma Flush), 8 (Atomic Phrase Protection), linger duration, updated constants, 6 conflict resolution entries, and 4 regression test cases.

### Changed
- **Settings sections all start collapsed:** All 6 collapsible sections in Settings now start collapsed on fresh launch instead of a mix of expanded/collapsed. Expanded/collapsed state persists across tab switches within the same session (lifted state from SettingsView to App.js).
- **Editor save now persists layout positions correctly:** `yPercent` for subtitles and captions is read from `useLayoutStore` (the actual rendered position) instead of the legacy subtitle store slider. `syncOffset` is also persisted for Projects preview sync.

## [Unreleased] — 2026-04-01

### Added
- **Cloudflare AI Gateway proxy support:** All Anthropic API calls can now route through a Cloudflare AI Gateway proxy. Refactored `anthropicRequest()` to use an options object (`{ timeout, gateway }`) instead of positional args. When `gatewayAuthToken` is set in electron-store, requests go through the configured gateway URL with `cf-aig-authorization` header; when empty, calls go direct to `api.anthropic.com` as before. Gateway URL stored with configurable default, trailing slashes normalized, invalid URLs caught with fallback to direct. Every request logs its routing path (Direct vs Gateway) via electron-log.
- **Gateway credentials in Settings UI:** New Gateway URL and Gateway Auth Token fields in Settings > API Credentials > Anthropic panel. Edit mode shows URL text input (prefilled with default) and masked token input with show/hide toggle. Display mode shows masked token or "Direct (no gateway)" with show/hide/copy buttons. Status row shows "Gateway active" in green when token is configured.
- **Sentry error tracking (@sentry/electron v7.10.0):** Remote crash reporting in both main and renderer processes. `Sentry.init()` runs before all other code in main.js and before React mounts in index.js. New `AppErrorBoundary` wraps the entire app and reports caught React errors to Sentry with a user-facing "Reload App" button. Existing `EditorErrorBoundary` now also reports via `Sentry.captureException()`. Removed `electronLog.errorHandler.startCatching()` so Sentry is the sole crash handler; electron-log remains the local file-based diagnostic logger.
- **PostHog product analytics (posthog-js):** Tracks 7 custom events (`clipflow_tab_changed`, `clipflow_pipeline_started`, `clipflow_pipeline_completed`, `clipflow_pipeline_failed`, `clipflow_clip_approved`, `clipflow_clip_rejected`, `clipflow_publish_triggered`) with no PII. Stable device ID generated on first launch via electron-store UUID and used with `posthog.identify()` for consistent cross-session tracking. Autocapture and pageview capture disabled (Electron SPA generates noise). Event queue flushed on quit via `posthog.shutdown()`.
- **Analytics opt-out toggle:** "Send anonymous usage data" toggle in Settings > Diagnostics. Persists to electron-store and calls `posthog.opt_out_capturing()` / `posthog.opt_in_capturing()` immediately. Defaults to enabled.

### Fixed
- **Preload script crash from @sentry/electron/preload:** The bare `require("@sentry/electron/preload")` failed to resolve in Electron's preload context, crashing the entire preload script and preventing `window.clipflow` from being exposed — making the app an empty shell with no data. Wrapped in try/catch so Sentry gracefully falls back to protocol mode while the IPC bridge loads normally.
- **Audio segment delete/trim now recuts the video file:** Deleting or left-trimming audio segments previously shifted timeline timestamps but never recut the actual video, causing the `<video>` element to show the wrong section (first N seconds instead of the remaining content). All three left-shift operations (delete, ripple delete, drag-trim) now trigger an FFmpeg recut via `recutClip` IPC, updating clip metadata, source boundaries, and `videoVersion` for cache-bust reload. Also fixed `_trimToAudioBounds` to always sync playback duration to final audio bounds.

### Added
- **Project Folders feature (full build from spec v1.1):** Sidebar folder panel (160px) with "All Projects" always first, color-coded folder entries, and sort mode toggle (Created/A-Z/Z-A). Full CRUD: create folders via inline input, rename/recolor/delete via right-click context menu, 8-preset color picker submenu, delete confirmation dialog with 5-second undo toast. Move projects between folders via floating action bar dropdown or project right-click context menu, with move undo toast. Folder filtering narrows the project list; empty folder shows guidance text. Reconciliation prunes stale project IDs on every `folder:list` call. Data layer: electron-store defaults + migration, 6 IPC handlers, 6 preload bridge methods.
- **Project Folders spec v1.1 (council-reviewed):** Full implementation spec at `reference/project-folders-spec.md`. Flat folders stored as metadata in electron-store, 6 IPC handlers, sidebar folder panel with filtering, multi-select floating action bar, undo toasts for destructive ops. Two council sessions (feature design + spec review) caught 7 issues and produced 3 design decisions.
- **Claude Code behavioral directives (council-reviewed):** Analyzed fakegurus-claude-md repo and ran a full 5-advisor LLM Council with peer review. Cross-referenced 10 proposed directives against 50+ documented failures in lessons.md. Merged 3 evidence-backed rules: failure recovery protocol (stop after 2 failed attempts, re-read, new approach), context decay awareness (re-read files after 10+ messages), and large file read safety (chunked reads for 500+ LOC files). Also added one-word mode to project config for faster interaction flow.
- **Rename safety checklist in code review skill:** Upgraded the existing "grep for ALL references" check to a 6-category safety checklist covering direct calls, type references, string literals, dynamic imports, re-exports/barrel files, and test files/mocks. Addresses a documented failure where a renamed variable was missed in JSX, causing a blank screen crash.

## [Unreleased] — 2026-03-31

### Added
- **Canonical subtitle segmentation function (`segmentWords.js`):** Extracted all segmentation logic from Zustand store into a standalone pure function with 29 regression tests. Eight rules in priority order: repeated phrases, filler isolation, forward look, max 3 words, 20-char limit, never end on "I", comma flush, atomic phrase protection. Hard wall pre-partitioning on sentence enders and 0.7s gaps.
- **Subtitle linger duration (0.4s):** Segments now extend 0.4s into empty space after the last word is spoken, so subtitles don't vanish instantly. Never overlaps the next segment.
- **Comma flush rule:** Words ending with commas or semicolons always end their segment — prevents awkward segments starting with "some," or "it,". A comma signals a natural phrase boundary.
- **Atomic phrase protection:** Common 2-word phrases ("as always", "of course", "by the way", "let's go", "trust me", etc.) are never split across segments. The chunker flushes early to keep phrases together.
- **Project preview word-level karaoke:** Preview cards now render subtitles with per-word highlighting, matching the editor's karaoke behavior. Each word is an individual span with highlight color on the active word and pop animation support.
- **Preview uses canonical segmentation:** Project preview tab now uses the same `segmentWords()` function as the editor instead of its own simplified 3-word chunking. Punctuation stripping applied per template config.
- **Editor save expanded:** Now persists `highlightColor`, `punctuationRemove`, `animateOn`, `animateScale`, `animateGrowFrom`, `animateSpeed`, and `segmentMode` to the clip's `subtitleStyle` for accurate preview rendering.
- **Preview template merging:** Clips with stale saved styles (missing new fields) now merge with the default template, so old projects pick up glow/highlight/animation settings.
- **Pure function for preview subtitles (`buildPreviewSubtitles.js`):** Shared utility that handles word gathering, segmentation, punctuation stripping, and active word detection — used by the project preview tab.
- **Audio track selection for transcription:** New `transcriptionAudioTrack` setting (default: track 2 / index 1) allows targeting the mic track in multi-track recordings.
- **LLM Council reports:** Four council sessions run during this session covering segmentation approach, spec v1.0 review, spec v1.1 review, and preview rendering architecture.

### Changed
- **MAX_CHARS raised from 16 to 20:** Better fit for subtitle display — "unfortunately I died" (20 chars) now stays as one segment.
- **FORWARD_LOOK_GAP changed from 1.0s to 0.5s:** Old value could never fire since all gaps ≥0.7s were already walled off by hard partitioning.
- **Segmentation logic removed from useSubtitleStore.js:** ~217 lines of inline chunking logic replaced with a single import of `segmentWords()`. Store now delegates entirely to the pure function.
- **Project preview onBack reloads from disk:** Returning from editor to projects view now reloads the project data so saved subtitle/caption styles are picked up immediately instead of showing stale state.

### Fixed
- **Ghost subtitle bug:** Transcription data sometimes contained a mega-segment spanning the entire clip. Now filtered out during segment initialization.
- **Subtitle segmentation regression (final fix):** Three recurring regressions (sentence boundary crossing, time gap grouping, phrase splitting) are now structurally impossible due to hard wall pre-partitioning architecture. Enforced by 29 regression tests.
- **Preview subtitle ghost double effect:** Project preview was running its own separate segmentation logic that produced poorly-timed segments. Now unified with editor's canonical function.
- **Stale preview after editor save:** Saved subtitle styles weren't reflected in the project preview because `onBack` didn't reload the project from disk. Fixed.

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
