# ClipFlow — Session Handoff
_Last updated: 2026-04-03 — "Queue Tab Phase 1: Dashboard Table Redesign"_

## Current State
App is stable. Queue tab redesigned from card-based layout to dashboard table with stats bar, expandable rows, and drag-to-reorder. Thumbnail extraction wired into render pipeline.

## What Was Just Built

### Queue Tab Phase 1 — Dashboard Table Layout
- **Stats bar**: 4-stat grid at top — Queued, Scheduled, Published Today, Failed — with live counts
- **Dashboard table**: Grid-based table with columns for drag handle, 9:16 vertical thumbnail, title + source, game tag, platform icons, status badge, and quick publish button
- **Expandable rows**: Click any row to expand inline detail panel showing large 9:16 thumbnail, double-click editable title, metadata, platform icons, publish progress, schedule picker, and action buttons (Remove, Schedule, Publish Now)
- **Drag-to-reorder**: @dnd-kit sortable rows with grip handle, persists `queueOrder` integer on each clip via `projectUpdateClip` IPC
- **Dequeue status**: New `"dequeued"` clip status — X/Remove button sets status so clip leaves queue without losing approval. Re-approve in Editor to re-queue
- **Thumbnail extraction at render time**: After `render:clip` and `render:batch` complete, extracts frame at t=1s via `ffmpeg.generateThumbnail()`, saves as `_thumb.jpg` alongside rendered `.mp4`, populates `thumbnailPath` on clip object
- **Project ID preservation**: `approved` list now carries `_projectId` on each clip for IPC calls. `localProjects` passed to QueueView for project name lookup

### Design Exploration
- Created two rounds of HTML mockups (`ClipFlow stuff/queue-mockups.html` and `queue-mockups-v2.html`) with 5 concepts total (A-E)
- User selected Dashboard Table (D) as the winner
- Updated `queue-tab-redesign-plan.md` with all resolved questions and decisions

## Key Decisions
- **Dashboard table over card grid**: Cards don't scale when you have 10+ clips. Table is compact, scannable, and expands inline for detail
- **Dequeued status**: Not back to "none" — separate `"dequeued"` status preserves the distinction from never-approved clips
- **Queue data on clip object**: `queueOrder`, `platformToggles`, `captionOverrides` stored in project.json (Option A), not a separate store
- **No stagger**: Publish sequentially without artificial delay between platforms
- **Reorder across all clips**: Drag-to-reorder works across game types, not within M/O pools
- **Separate phases**: Queue redesign phases 1-5 are separate specs, separate sessions
- **Thumbnails at render time**: Not on-demand — extracted immediately after render completes, ~50-100KB per clip

## Next Steps
1. **Visual polish on dashboard table** — user said "fine, not perfect" — may need spacing, alignment, or interaction tweaks next session
2. **Phase 2 spec: Per-platform control** — platform toggles per clip, resolved caption preview, per-platform caption edit, character count indicators, YouTube-specific fields
3. **Legacy feature removal** — OBS log parser + hype/chill voice mode (paused task in todo.md)
4. **Instagram/Facebook split** — separate login flows (paused task in todo.md)

## Watch Out For
- `data/clipflow.db` has changes — don't commit database files
- `reference/TECHNICAL_SUMMARY.md` was deleted (shows in git status) — was intentional
- `SortableRow` component uses render-prop pattern: `children({ ref, style, attributes, listeners })` — don't restructure without understanding the dnd-kit integration
- Thumbnail extraction is fire-and-forget: if FFmpeg fails, `thumbnailPath` stays null and the UI shows a fallback icon — no error surfaced to user
- `approved` list preserves `_projectId` via `Object.entries(allClips).flatMap()` — if allClips structure changes, this breaks
- Existing rendered clips won't have thumbnails until re-rendered

## Logs/Debugging
- User confirmed: dashboard table is the right layout direction ("dashboard wins hands down")
- User confirmed: current implementation is "fine, not perfect" — expect polish requests next session
- No console errors on launch
- Build size increased by ~16KB (mainly @dnd-kit)
