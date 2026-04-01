# ClipFlow — Session Handoff
_Last updated: 2026-04-01 (Project Folders feature built)_

## Current State
App builds and launches. Project Folders feature fully implemented and user-tested — create, rename, recolor, delete folders with undo, move projects between folders, filter by folder.

## What Was Just Built

### Project Folders (Full Spec v1.1 Implementation)
- **Data layer:** `projectFolders` and `folderSortMode` electron-store defaults + migration. 6 IPC handlers (`folder:list` with reconciliation, `folder:create`, `folder:update`, `folder:delete`, `folder:addProjects`, `folder:reorder`). 6 preload bridge methods.
- **Sidebar:** 160px folder panel with "All Projects" always first (total count), folder entries (8px color dot with glow + name + count), sort mode toggle (Created/A-Z/Z-A).
- **Folder CRUD:** "+ New Folder" inline input, right-click context menu (Rename with inline edit, Change Color with 8-dot submenu, Delete Folder), delete confirmation dialog, 5-second undo toast that restores folder + project assignments.
- **Project-to-folder operations:** Floating action bar with "Move to Folder" dropdown (all folders + "New Folder..." + "Remove from Folder"), right-click project context menu (move/remove/delete), move undo toast (5s).
- **Filtering:** Clicking a folder filters the project list. "Select All" operates on visible (filtered) projects. Empty folder state with guidance text.
- **Reconciliation:** `folder:list` prunes stale project IDs on every call. Project deletion triggers `refreshFolders()` to update counts.

## Key Decisions
- **`data-menu` attribute pattern for menus:** React synthetic `stopPropagation` doesn't block native `window.addEventListener` handlers. All menu containers use `data-menu` attr; the global mousedown handler checks `e.target.closest("[data-menu]")` to skip closing when clicking inside menus.
- **Mousedown (not click) for global close:** Menus close on mousedown outside, so click handlers inside menus fire reliably.
- **No `overflow: hidden` on context menus:** Clipped the color picker submenu (positioned at `left: 100%`). Context menus use default overflow.
- **Folder state lives in App.js:** `projectFolders` and `activeFolder` passed as props. Mutations call IPC then `refreshFolders()` to re-read from store (single source of truth).

## Next Steps
1. **Preview template styling** — `_buildAllShadows()` in ProjectsView still simpler than editor's `buildAllShadows()` (carried from prior session)
2. **Subtitle segmentation spec update** — needs Rule 7 (comma flush), Rule 8 (atomic phrases), and linger duration (carried from prior session)
3. **Council reports cleanup** — multiple council reports in repo root; consider `councils/` directory
4. **Video splitting phases 3-5** — phases 1-2 complete (steps 1-14), remaining: Phase 3 (split UI in recordings view), Phase 4 (post-split pipeline), Phase 5 (polish)

## Watch Out For
- **Three render sites for `ProjectsListView` in App.js** — lines ~563, ~574 (fallback), and ~596 (main path). ALL three must receive folder props. The third was missed by `replace_all` causing `onFoldersChanged: undefined` — this was the hardest bug to track down.
- **Ghost folders from debug runs** — earlier test runs created folders in the store before the UI refresh was wired. They now appear in the sidebar. User can right-click → Delete to clean up.
- **Undo toast timer** — uses `setTimeout` (5s). If the component unmounts before timeout clears, the undo callback may reference stale state. Not critical for V1 but worth watching.

## Logs / Debugging
- Folder IPC handlers have try/catch returning `{ success: false, error }` on failure — check renderer console for error objects
- Reconciliation runs on every `folder:list` call — silently prunes stale project IDs
- `console-message` event on Electron's webContents does NOT forward `console.log` (level 1) to the terminal in production builds — only `console.warn` (level 2+) shows. Use `console.warn` for debug logging or open DevTools (`mainWindow.webContents.openDevTools({ mode: "detach" })`)
