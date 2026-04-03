# ClipFlow — Session Handoff
_Last updated: 2026-04-03 — "Shared Preview Overlays + Bug Discovery"_

## Current State
App builds and launches. Projects preview now uses the same rendering components as the Editor (shared SubtitleOverlay/CaptionOverlay). Three bugs were discovered — one was fixed (DraggableOverlay blank screen), two remain open, and the blank screen issue may still be recurring.

## What Was Just Built

### Shared Preview Overlays (Committed: `173c2fd`)
- **`src/renderer/editor/components/PreviewOverlays.js`** (NEW) — Shared `SubtitleOverlay` and `CaptionOverlay` components consumed by both Editor and Projects. Contains `buildCharChunks()`, `buildGlobalWordIndex()`, `findActiveSegAndWord()`. Has try-catch guards in useMemo callbacks.
- **`src/renderer/editor/components/PreviewPanelNew.js`** — Removed ~200 lines of duplicate rendering code. Now imports shared overlays. Added memoized `subtitleStyleConfig` and `captionStyleConfig` objects.
- **`src/renderer/views/ProjectsView.js`** — Removed `buildSubPreviewStyle()`/`buildCapPreviewStyle()` helpers. Now uses shared overlays. Fixed yPercent sourcing to read saved clip value instead of template value.

### DraggableOverlay Blank Screen Fix (Committed: `173c2fd`)
- Changed gate from `{showSubs && <DraggableOverlay>}` to `{showSubs && editSegments.length > 0 && <DraggableOverlay>}` in PreviewPanelNew.js.

## Open Bugs (NOT YET FIXED)

### BUG: Blank Screen (CRITICAL, RECURRING)
- App goes completely blank (no error boundary, fully black) — happens in editor and project tabs.
- Was partially addressed by the DraggableOverlay gate fix, but user reports it happened again during this session.
- Needs deep investigation — likely multiple causes. Possibly related to subtitle editing, store state corruption, or render errors not caught by error boundary.

### BUG: Editor Position Not Persisting
- Drag subtitle/caption to new Y position → Save → Projects preview shows correct position → Reopen clip in Editor → position reverts to template default.
- Root cause: `initFromContext` in `useEditorStore.js` calls `applyTemplate()` which unconditionally overwrites `useLayoutStore`'s `subYPercent`/`capYPercent` with template values. Saved clip positions are never restored after template application.
- Fix: After each of the three `applyTemplate()` calls (~lines 101, 106, 110), read `clip.subtitleStyle.yPercent` / `clip.captionStyle.yPercent` / `clip.captionStyle.widthPercent` back into `useLayoutStore`. The `clip` variable is in scope via closure. `useLayoutStore` is already imported.
- Unknown: whether other saved style properties (font, color, effects) also revert — user hasn't tested this yet. The subtitle/caption stores have their own `initFromClip` which may already handle those.

### BUG: Tab Flash on Switch (Recordings, Rename)
- Brief 1-frame flash of default/initial state when switching to Recordings or Rename tabs.
- Root cause: `renderView()` in App.js uses conditional rendering (if/else), so tabs unmount/remount on every switch. Views with async data loading show default state for one frame before data arrives.
- Only observed on Recordings and Rename tabs so far.
- Fix approach: Use CSS `display: none` to keep these tabs mounted instead of unmounting them. Editor should remain conditional (too heavy to keep mounted).

## Key Decisions
- Shared overlays approach chosen over full shared preview component (rejected historically for performance/complexity)
- Projects preview is read-only — no editing capability in Projects tab
- SubtitleOverlay uses animation key derived from segment identity to avoid setState-in-render

## Next Steps
1. **Blank screen** — Highest priority. Needs proper investigation to find all causes. Consider adding an error boundary that catches and reports rather than going fully black.
2. **Editor position persistence** — Fix `initFromContext` to restore saved positions after `applyTemplate()`.
3. **Tab flash** — Switch Recordings/Rename to CSS display:none pattern in App.js.
4. **Sentry backlog** — 7 deferred items before launch.

## Watch Out For
- The blank screen has multiple potential causes — the DraggableOverlay fix helped but didn't fully resolve it. Don't assume one fix will solve all blank screen cases.
- `applyTemplate()` in `templateUtils.js` unconditionally sets layout positions (lines 181-183). Any fix to position persistence must happen AFTER this call, not before.
- `renderView()` in App.js wraps views in padding/maxWidth divs — if switching to CSS display:none, those wrapper styles need to apply per-tab too.
- CaptionsView import exists in both App.js (dead code) and QueueView.js (active).

## Logs / Debugging
- Build succeeds, app launches
- Blank screen occurred during this session while editing — no console errors captured
- User reports blank screen is "constantly" happening, especially in editor/project tabs
