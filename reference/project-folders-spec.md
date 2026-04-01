# Project Folders Spec v1.1

This is the canonical spec for ClipFlow's project folder feature. Folders let users organize projects into named groups. This spec covers data model, persistence, IPC, UI, and edge cases.

Council-reviewed: v1.0 reviewed by 5-advisor council on 2026-04-01. 7 fixes applied in v1.1.

---

## 1. Data Model

### Folder Object Shape

```javascript
{
  id: string,          // "folder_{timestamp}_{random}" (same pattern as projectId)
  name: string,        // User-editable display name (e.g., "Production", "Testing")
  color: string,       // Hex color (e.g., "#ef4444") — default palette of 8 colors
  createdAt: string,   // ISO timestamp — used for creation-order sort
  projectIds: string[] // Ordered array of project IDs in this folder
}
```

### Storage Location

**electron-store** key: `projectFolders`

```javascript
// Default
projectFolders: []
```

Folders are a metadata layer. Projects stay in `{watchFolder}/.clipflow/projects/{projectId}/` — no filesystem restructuring. Folder membership is tracked entirely in electron-store.

### Why electron-store, not project.json

- Moving a project between folders = one electron-store write (update two `projectIds` arrays), not N project.json file writes
- Folder rename/delete/recolor = zero project.json writes
- Avoids desync between folder metadata and project files
- Reconciliation on startup handles deleted/missing projects (see Section 7)

### Constraints

- A project belongs to **zero or one** folder. Not multi-folder.
- Projects not in any folder appear under "All Projects" (implicit, not stored).
- `projectIds` array order is preserved — enables future manual sort without migration.
- Folder names are **not unique** — users can have two folders named "Test" (distinguished by color/position). No enforcement needed.
- Folder colors are **not unique** — multiple folders can share the same color. No enforcement needed.
- **No folder limit.** Users can create as many folders as they want.

---

## 2. Color Palette

8 preset colors. Users pick from palette — no custom hex input for V1. Multiple folders can use the same color.

```javascript
const FOLDER_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#6b7280", // gray
];
const DEFAULT_FOLDER_COLOR = "#3b82f6"; // blue
```

Displayed as a filled circle (8px) next to the folder name in the sidebar.

---

## 3. Persistence & Migration

### electron-store Schema Addition

```javascript
// In store defaults (main.js)
defaults: {
  // ... existing defaults ...
  projectFolders: [],
  folderSortMode: "created", // "created" | "name-asc" | "name-desc"
}
```

### Migration

```javascript
// In migration block (main.js)
if (!store.has("projectFolders")) {
  store.set("projectFolders", []);
}
if (!store.has("folderSortMode")) {
  store.set("folderSortMode", "created");
}
```

### Upgrade Behavior

On first launch after update:
- `projectFolders` is `[]` — no folders exist
- All projects appear in "All Projects" as before
- Zero friction — user sees no change until they create their first folder

---

## 4. IPC Handlers

All folder operations go through main process IPC. Renderer never writes to electron-store directly.

**Error handling (all handlers):** Every mutating handler wraps in try/catch. On failure returns `{ success: false, error: string }`. Renderer must check `result.success` or `result.error` and show a toast on failure.

### Handler: `folder:list`

```
Returns: { folders: Folder[] }
```

Reads `projectFolders` from store. Runs reconciliation (Section 7) before returning.

### Handler: `folder:create`

```
Args: { name: string, color?: string }
Returns: { success: true, folder: Folder } | { success: false, error: string }
```

Generates ID, sets `createdAt` to ISO timestamp, creates folder with empty `projectIds`, appends to store array.

### Handler: `folder:update`

```
Args: { folderId: string, patch: { name?: string, color?: string } }
Returns: { success: true } | { success: false, error: string }
```

Merges patch fields into the folder. Replaces separate rename/recolor handlers.

### Handler: `folder:delete`

```
Args: { folderId: string }
Returns: { success: true, freedProjectIds: string[] } | { success: false, error: string }
```

Removes folder from array. Returns the projectIds that were in it (now unassigned). Does NOT delete any project files.

### Handler: `folder:addProjects`

```
Args: { folderId: string | null, projectIds: string[] }
Returns: { success: true, movedFrom: { projectId: string, folderName: string | null }[] } | { success: false, error: string }
```

**When `folderId` is a folder ID:** Removes each projectId from any current folder first (a project can only be in one folder), then appends to target folder's `projectIds`. Returns `movedFrom` array so the UI can show a toast: "Moved from X to Y."

**When `folderId` is `null`:** Removes each projectId from its current folder (unassigns). This replaces the separate `removeProjects` handler.

### Handler: `folder:reorder`

```
Args: { folderIds: string[] }
Returns: { success: true } | { success: false, error: string }
```

Replaces the full `projectFolders` array order. Used for sidebar reordering (V2 — drag-and-drop).

### Preload Bridge

```javascript
// In preload.js — Folders
folderList: () => ipcRenderer.invoke("folder:list"),
folderCreate: (data) => ipcRenderer.invoke("folder:create", data),
folderUpdate: (folderId, patch) => ipcRenderer.invoke("folder:update", folderId, patch),
folderDelete: (folderId) => ipcRenderer.invoke("folder:delete", folderId),
folderAddProjects: (folderId, projectIds) => ipcRenderer.invoke("folder:addProjects", folderId, projectIds),
folderReorder: (folderIds) => ipcRenderer.invoke("folder:reorder", folderIds),
```

6 IPC handlers, 6 bridge methods.

---

## 5. UI Layout

### Overview

The Projects view gains a **sidebar folder panel** on the left. The existing project list becomes the **main panel** on the right, filtered by the selected folder.

```
┌─────────────────────────────────────────────────┐
│  Projects                    6 projects · 6 ...  │
├──────────┬──────────────────────────────────────┤
│          │                                       │
│ All (6)  │  ┌─ Project Card ──────────────────┐ │
│          │  │  2026-01-23 AR Day16 Pt4  [REV] │ │
│ ● Prod(3)│  └─────────────────────────────────┘ │
│ ● Test(3)│  ┌─ Project Card ──────────────────┐ │
│          │  │  RL 2026-03-04            [REV] │ │
│ + New    │  └─────────────────────────────────┘ │
│          │                                       │
├──────────┴──────────────────────────────────────┤
│  [floating action bar when items selected]       │
└─────────────────────────────────────────────────┘
```

### Sidebar Panel

- **Width:** 160px fixed, dark background (`T.bgDarker` or similar)
- **"All Projects" entry:** Always first. Shows total project count. Cannot be renamed/deleted/recolored. No right-click context menu. Selected by default on load.
- **Folder entries:** Color dot (8px filled circle) + name + count in parentheses. Truncate long names with ellipsis.
- **Folder sort:** Controlled by `folderSortMode` setting. Options: creation order (default), name A-Z, name Z-A. Cycle via small sort icon in sidebar header.
- **"+ New Folder" button:** At bottom of sidebar. Opens inline rename input pre-focused.
- **Active folder:** Highlighted background to show current filter.
- **Right-click context menu on folder:** Rename, Change Color, Delete

### Sidebar Context Menu (right-click folder)

```
┌─────────────────┐
│ Rename           │
│ Change Color   > │  ← submenu with 8 color dots
│ ─────────────── │
│ Delete Folder    │
└─────────────────┘
```

- **Rename:** Turns folder name into an inline text input. Enter to confirm, Escape to cancel.
- **Change Color:** Submenu/popover showing the 8 color options as clickable dots. Click to apply immediately.
- **Delete Folder:** Shows confirmation dialog (see Section 6). After confirmation, shows undo toast (see Section 6).

### "All Projects" Entry

- Always first in sidebar, always visible
- Shows total project count (all projects, not just unassigned)
- Cannot be renamed, deleted, or recolored
- **No right-click context menu** — right-click does nothing
- Selected by default on app load

### Main Panel Changes

- The existing `ProjectsListView` component gains an `activeFolder` prop.
- When `activeFolder` is `null` (All Projects): show all projects (current behavior).
- When `activeFolder` is a folder ID: filter `localProjects` to only those whose ID is in `folder.projectIds`.
- Existing sort order (status then date) applies within the filtered list.
- "Select All" selects all visible (filtered) projects, not all projects globally.

### Empty Folder State

When a folder is selected but contains zero projects, the main panel shows:

```
┌─────────────────────────────────────────┐
│                                          │
│         No projects in this folder       │
│                                          │
│   Select projects from All Projects      │
│   and use "Move to Folder" to add them.  │
│                                          │
└─────────────────────────────────────────┘
```

Styled as muted text, centered vertically and horizontally in the main panel area.

### Multi-Select Actions

When projects are selected (checkbox), a **floating action bar** appears at the bottom:

```
┌─────────────────────────────────────────────────┐
│  3 selected    [Move to Folder ▾]    [Delete]   │
└─────────────────────────────────────────────────┘
```

- **"Move to Folder" dropdown:** Lists all folders + "New Folder..." option at bottom. Clicking a folder moves all selected projects into it (removing from previous folder if any). "New Folder..." opens a create dialog, then moves.
- **After move:** Shows undo toast: "3 projects moved to Production. [Undo]" (5-second timeout). Undo reverses the move by calling `folder:addProjects` with original folder IDs (or `null` for previously unassigned).
- **"Delete" button:** Existing two-step confirmation behavior (unchanged).
- **Bar styling:** Fixed bottom, slight elevation/shadow, dark background, centered content.

### Right-Click on Project Card

Add a context menu to project cards:

```
┌──────────────────────┐
│ Move to Folder     > │  ← submenu listing folders + "New Folder..."
│ Remove from Folder   │  ← only shown if project is in a folder
│ ──────────────────── │
│ Delete Project       │
└──────────────────────┘
```

---

## 6. Confirmation Dialogs & Undo Toasts

### Delete Folder

**Step 1 — Confirmation dialog:**

```
┌─────────────────────────────────────────┐
│  Delete "Production"?                    │
│                                          │
│  This will remove the folder only.       │
│  Your 3 projects will still be           │
│  available in All Projects.              │
│                                          │
│  No project files will be deleted.       │
│                                          │
│          [Cancel]  [Delete Folder]       │
└─────────────────────────────────────────┘
```

**Step 2 — Undo toast (5 seconds):**

```
Folder "Production" deleted. [Undo]
```

Undo re-creates the folder with same name, color, and projectIds. After 5 seconds, toast disappears and deletion is permanent.

Key: **Folder deletion never deletes project files.** The dialog makes this explicit.

### Bulk Move — Undo Toast

After moving projects between folders:

```
3 projects moved to "Production". [Undo]
```

Undo returns each project to its previous folder (or unassigned). 5-second timeout.

### Delete Projects (existing, unchanged)

The existing two-step delete button in the action bar. This deletes project files from disk. Behavior is unchanged from current implementation. No undo for this — files are deleted.

---

## 7. Reconciliation

On every `folder:list` call (app startup and after folder mutations), reconcile:

```javascript
function reconcileFolders(folders, existingProjectIds) {
  return folders.map(folder => ({
    ...folder,
    // Remove projectIds that no longer exist on disk
    projectIds: folder.projectIds.filter(id => existingProjectIds.includes(id))
  }));
}
```

**When it runs:**
- On app startup when loading folders
- After any project deletion (the delete flow calls `refreshFolders()` which triggers reconciliation)

**What it handles:**
- Projects deleted outside ClipFlow (manual file deletion)
- Projects deleted via the app (project:delete IPC removes files; reconciliation cleans up stale folder references on next folder:list)

### Project Deletion Cleanup Path

When a project is deleted via the existing `project:delete` IPC:
1. Project files removed from disk
2. `localProjects` state updated in App.js (existing behavior)
3. `refreshFolders()` called — this runs `folder:list` which reconciles, pruning the deleted project's ID from any folder's `projectIds`
4. UI updates with correct folder counts

This is lazy cleanup via reconciliation, not eager removal. It's simpler and handles all edge cases (including projects deleted outside the app).

---

## 8. State Management

### App.js Changes

```javascript
// New state
const [projectFolders, setProjectFolders] = useState([]);
const [activeFolder, setActiveFolder] = useState(null); // null = "All Projects"

// Load on mount (alongside existing project load)
const folderResult = await window.clipflow.folderList();
if (folderResult?.folders) setProjectFolders(folderResult.folders);

// Persist after mutations (same pattern as localProjects)
// No — folders are always read from/written to electron-store via IPC.
// State is refreshed after each mutation by re-calling folderList().
```

### Props Flow

```javascript
<ProjectsListView
  localProjects={localProjects}
  projectFolders={projectFolders}
  activeFolder={activeFolder}
  onSelectFolder={setActiveFolder}
  onFoldersChanged={refreshFolders}  // calls folderList() and updates state
  onSelect={handleSelectProject}
  onDeleteProjects={handleDeleteProjects}
  mainGame={mainGame}
  gamesDb={gamesDb}
/>
```

### Refresh Pattern

After any folder mutation (create, rename, delete, move projects), call:

```javascript
const refreshFolders = async () => {
  const result = await window.clipflow.folderList();
  if (result?.folders) setProjectFolders(result.folders);
};
```

This ensures the UI always reflects the reconciled state from electron-store.

---

## 9. Interaction with Existing Features

### Pipeline Status Filtering

Folder selection **composes with** existing status-based sorting. When a folder is active:
1. Filter projects to those in the folder
2. Apply existing sort (status priority, then date)

Folders narrow the list. Status sort orders within that narrowed list.

### Project Deletion

When a project is deleted via the existing delete flow:
1. `project:delete` IPC removes project files from disk
2. `localProjects` state updated (existing)
3. `refreshFolders()` called — reconciliation removes the deleted project ID from any folder's `projectIds`
4. UI updates with correct counts

### Clip Browser / Editor

No changes. Opening a project from within a folder works identically to opening from "All Projects." The folder context is not passed to the editor.

### New Project Creation (AI Pipeline)

When the pipeline creates a new project, it is unassigned (no folder). It appears in "All Projects." Users manually organize into folders.

---

## 10. Files Touched

| File | Changes |
|------|---------|
| `src/main/main.js` | electron-store defaults + migration, 6 IPC handlers |
| `src/main/preload.js` | 6 bridge methods |
| `src/renderer/App.js` | `projectFolders` + `activeFolder` state, load/refresh, pass props, wire delete to refreshFolders |
| `src/renderer/views/ProjectsView.js` | Sidebar panel, folder filtering, context menus, floating action bar, undo toasts, empty state |
| `src/renderer/styles/theme.js` | Any new color tokens if needed |

Estimated: **5 files**, one session.

---

## 11. What Is NOT in V1

| Feature | Reason |
|---------|--------|
| Nested folders | Complexity trap. One level is sufficient. |
| Drag-and-drop (projects into folders) | Multi-select + dropdown is 10% of the dev cost for same result. |
| Drag-and-drop (folder reorder in sidebar) | Sort modes (creation, A-Z) cover this. Manual drag-reorder is V2. |
| Smart/auto-populating folders | No validated need. Can be added as filter consumers later. |
| Tags / multi-folder membership | Folders-as-metadata is structurally extensible to tags later. |
| Folder templates | V2+ feature — pre-configured platform defaults per folder. |
| Batch folder operations (render all, schedule all) | Useful but out of scope for organizational feature. |
| Folder icons / emoji | Color dot is sufficient visual differentiation. |
| Custom hex color input | 8 preset colors covers all realistic needs. |
| Per-folder sort order | Default sort (status then date) applies. Manual sort is V2. |
| Search within folder | Not needed until project count exceeds ~50. |
| Keyboard shortcuts for folders | Low-frequency operations. V1.1 polish. |
| Sort by completion rate | More of a project sort feature than a folder sort feature. Revisit later. |

---

## 12. Build Sequence

### Phase 1 — Data Layer
1. Add `projectFolders: []` and `folderSortMode: "created"` to electron-store defaults + migration
2. Write all 6 IPC handlers in `main.js` (with try/catch error handling)
3. Add all 6 bridge methods to `preload.js`
4. **Verify:** App builds, launches, `folder:list` returns `{ folders: [] }`

### Phase 2 — Sidebar + Filtering
5. Add `projectFolders` and `activeFolder` state to `App.js`
6. Load folders on mount, pass as props to `ProjectsListView`
7. Build sidebar folder panel in `ProjectsView.js` (with "All Projects" always first, no context menu on it)
8. Implement folder click -> filter project list
9. Implement folder sort mode toggle (creation order, A-Z, Z-A)
10. **Verify:** Sidebar shows "All Projects" + any created folders, clicking filters the list

### Phase 3 — Folder CRUD UI
11. "+ New Folder" button -> inline rename input
12. Right-click context menu on folders -> Rename, Change Color, Delete
13. Delete confirmation dialog + 5-second undo toast
14. Color picker submenu/popover (8 dots, no uniqueness enforcement)
15. **Verify:** Can create, rename, recolor, and delete folders. Undo toast restores deleted folder.

### Phase 4 — Project-to-Folder Operations
16. Multi-select floating action bar with "Move to Folder" dropdown
17. Move toast with undo: "3 projects moved to X. [Undo]"
18. Right-click context menu on project cards -> Move to Folder submenu, Remove from Folder
19. Wire project deletion to trigger `refreshFolders()`
20. **Verify:** Can move projects between folders, undo moves, remove from folder, delete projects without orphaned folder references

### Phase 5 — Polish
21. Empty folder state message ("No projects in this folder")
22. Folder count updates live after mutations
23. Error handling: show toast on IPC failures
24. **Verify:** Full flow — create folder, move projects, rename, recolor, delete folder, undo delete, delete project, verify counts
