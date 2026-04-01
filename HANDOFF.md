# ClipFlow — Session Handoff
_Last updated: 2026-04-01 (Audio delete/trim recut fix + Project Folders spec)_

## Current State
App builds and launches. Audio segment delete and left-trim recut bug fixed and verified on a fresh clip.

## What Was Built

### Bug Fix: Audio Delete/Trim Video Recut
- **Root cause:** Deleting or trimming audio segments from the left shifted timeline timestamps to start at 0, but never recut the actual video file. The `<video>` element still played from the beginning of the original file, so users saw the first N seconds instead of the remaining content.
- **Fix:** Three operations now trigger an FFmpeg recut via `recutClip` IPC when content is removed from the left:
  - `deleteAudioSegment` — split + delete left portion
  - `rippleDeleteAudioSegment` — ripple delete first segment
  - `commitAudioResize` — drag left edge rightward to trim
- **New helper:** `_recutAfterDelete(origAudioStart, origAudioEnd)` — async method that unloads video, calls IPC recut, updates clip/project/source metadata, bumps `videoVersion` for cache-bust reload
- **Also fixed:** `_trimToAudioBounds` now always syncs `playbackStore.duration` to final audio bounds (previously only updated during left-shifts)

### Project Folders Spec v1.1 (Council-Reviewed)
- Wrote full implementation spec: `reference/project-folders-spec.md`
- Ran two LLM Council sessions:
  1. **Feature design council** — 5 advisors designed the folder system. Key decisions: flat folders, metadata-only (no filesystem changes), electron-store persistence, skip DnD for V1.
  2. **Spec review council** — 5 advisors reviewed the written spec. Caught 7 issues: move-from-old-folder behavior, persistence failure handling, project deletion cleanup, IPC reduction (8→6), empty folder state, "All Projects" rules, undo toasts for destructive ops.
- All 7 fixes + user's 3 design decisions baked into v1.1

## Key Decisions
- **Audio recut uses existing `recutClip` IPC** — same pattern as `commitLeftExtend`/`revertClipBoundaries`. No new IPC needed.
- **Caller manages `extending` state** — `_recutAfterDelete` is a pure async helper; callers set/clear `extending` and unload video themselves. Prevents double-management bugs.
- **Project folders: 6 IPC handlers** (not 8) — merged rename+recolor into `folder:update(id, patch)`, made `addProjects(null)` handle unassign
- **Folder sort modes** — creation order (default), A-Z, Z-A. Stored in `folderSortMode` electron-store key.
- **One project per folder** — council debated many-to-many but rejected for V1. Structurally extensible to tags later.
- **Undo toasts** — 5-second undo for folder delete and bulk move (unanimous council blind spot catch)

## Next Steps
1. **Build Project Folders** — spec is ready at `reference/project-folders-spec.md`. Follow the 5-phase build sequence. Start with Phase 1 (data layer).
2. **Preview template styling** — `_buildAllShadows()` in ProjectsView still simpler than editor's `buildAllShadows()` (carried from prior session)
3. **Subtitle segmentation spec update** — needs Rule 7 (comma flush), Rule 8 (atomic phrases), and linger duration (carried from prior session)
4. **Council reports cleanup** — multiple council reports in repo root; consider `councils/` directory

## Watch Out For
- **First clip was corrupted** by the old buggy trim/delete operations. Regenerating the clip fixes it. Any clip that was trimmed/deleted before this fix may have stale video content — must be regenerated.
- **`_recutAfterDelete` throws on IPC failure** — callers must catch and handle (they do via try/catch/finally).
- **Project Folders spec lives at `reference/project-folders-spec.md`** — read this before building. It has the exact data model, IPC shapes, UI layout, and build sequence.

## Logs / Debugging
- Audio recut logs: `[Recut]` prefix in console — shows sourceStartTime, origAudioStart/End, newSourceStart/End, and success/failure
- Left-trim logs: `[TrimToAudio]` prefix — shows shift amount
- Delete logs: `[DeleteAudio]` / `[RippleDeleteAudio]` prefixes
- Council reports: `council-report-20260401-160557.html` (feature design), `council-report-20260401-spec-review.html` (spec review)
