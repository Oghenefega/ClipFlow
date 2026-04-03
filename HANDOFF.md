# ClipFlow — Session Handoff
_Last updated: 2026-04-03 — "Tab Restructure: Tracker Split & Captions Merge"_

## Current State
App builds and launches. Navigation restructured from 7 tabs to 7 tabs with different content — Captions tab removed from nav, Tracker extracted to its own tab, captions content embedded in Queue.

## What Was Just Built

### Tab Restructure
- **New tab order:** Rename, Recordings, Projects, Editor, Queue, Tracker, Settings
- **TrackerView.js** — New standalone component extracted from QueueView containing the full tracker: stat cards (This Week / main game / other), weekly schedule grid, Edit Template, Export/Import CSV, template presets, undo/redo, drag-to-reorder, time slot editing, cell popovers
- **Queue tab restructured** — Now contains: clip picker, publishing accounts display, publish log, and the full Captions & Descriptions section (YouTube descriptions + Other Platforms) embedded below the publish log as a natural scroll continuation
- **Captions tab removed from nav** — CaptionsView component is now imported and rendered inside QueueView rather than as a standalone route. The component itself is unchanged.

### 30s Stagger Removed
- Removed `STAGGER_MS` constant and the `setTimeout` delay between platform uploads in `publishClip()`
- Publishing is now sequential-immediate: each platform upload completes, then the next starts with no artificial delay
- "PUBLISHING TO N ACCOUNTS · 30S STAGGER" info bar replaced with "Publishing to N accounts" (no stagger mention)

### QueueView Cleanup
- Removed ~700 lines of tracker-specific state, functions, and JSX from QueueView
- Removed unused constants: `MONTHS_2026`, `getWeekLabel`, `buildCaption`, `buildYouTubeTitle`, `sortTemplateByTime`, `findGameFromClip`
- QueueView still retains `logPost`, `snapToSlot`, `effectiveTemplate` for logging publish events to tracker data
- Added caption-related props (`setYtDescriptions`, `setCaptionTemplates`, `setPlatformOptions`) to QueueView signature

## Key Decisions
- CaptionsView is embedded as-is (not duplicated) — imported inside QueueView, all props passed through from App.js
- TrackerView owns all its own state (weekOffset, editTmpl, popover, undo/redo, etc.) — no shared state with QueueView
- QueueView keeps tracker data write access (via `logPost`) so publish events still auto-log to the tracker grid
- `effectiveTemplate` still computed in QueueView (always for current week, weekOffset=0) for `snapToSlot` in `logPost`
- Tracker icon uses 📊 (bar chart) emoji to differentiate from Queue's 📋 (clipboard)

## Next Steps
1. **Visual verification** — Open app, navigate all 7 tabs, verify Queue shows captions below publish log, Tracker shows full grid
2. **Publish flow test** — Verify publishing still logs to tracker data correctly after stagger removal
3. **Project tags UI** — General-purpose tag CRUD (add/remove/edit arbitrary tags), filtering in Projects tab
4. **Sentry backlog** — 7 deferred items before launch

## Watch Out For
- QueueView still imports and uses `DAY_NAMES`, `getWeekDates`, `FULL_DAY_NAMES`, `TIME_OPTIONS`, `parseTimeToMinutes`, `snapToSlot` — these are needed for `logPost` and schedule date generation. Don't remove them thinking they're tracker-only.
- CaptionsView import exists in both App.js (for the old route reference, now unused at render time but still imported) and QueueView.js (where it's actually rendered). The App.js import of CaptionsView is now dead code but harmless.
- TrackerView duplicates some helper functions from QueueView (`getWeekDates`, `parseTimeToMinutes`, `sortTemplateByTime`). Could be extracted to a shared utils file later but not worth the churn now.
- `weekOffset` in QueueView is always 0 now (no UI to change it) — this is correct since publishing always happens "now" or for upcoming dates

## Logs / Debugging
- No errors during build or launch
- QueueView went from ~1258 lines to ~610 lines
- TrackerView is ~520 lines (self-contained)
- Build output size essentially unchanged (+36B gzipped)
