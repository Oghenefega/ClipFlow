# Council Transcript: Project Folders Feature
_April 1, 2026_

## Original Question

Design a "Project Folders" feature for ClipFlow's Projects view. The user needs to separate test/dev projects from real production content. Core requirements: multi-select into folders, rename, delete (with warning), create new folders, plus all sensible folder operations.

## Framed Question

**Design a "Project Folders" feature for ClipFlow's Projects view.**

Context: ClipFlow is a commercial Electron + React desktop app for gaming content creators. It automates the pipeline from OBS recording to clip generation to editing to publishing. Projects are currently stored as flat JSON files in `{watchFolder}/.clipflow/projects/{projectId}/project.json`. The Projects view shows a flat list sorted by status then date — no grouping exists.

The user's situation: They're the sole tester of a pre-release product. They need to separate test/dev projects from real production content they're posting daily. This is a real immediate pain point, not hypothetical.

Core requirements: Select multiple projects -> add to new/existing folder. Edit folder name. Delete folder (with clip deletion warning). Create new folder. Plus "all the generic, sensible things needed for folders."

Constraints: Windows-only, electron-store for settings, file-based project storage, Tailwind + shadcn/ui in editor (inline styles via theme.js elsewhere), dark theme, Zustand for editor state but useState/props for main views.

---

## Advisor Responses

### The Contrarian

The fatal flaw here is scope creep disguised as a simple feature. "Plus all the generic, sensible things needed for folders" is how a two-day task becomes a two-week rabbit hole.

**What will actually go wrong:**

Nested folders. Someone will propose them. The moment you allow folders-in-folders, you inherit tree traversal, breadcrumb navigation, drag-drop reordering between depths, and recursive deletion confirmation. For a sole tester separating "test" from "real" — that is absurd. Flat folders only. One level. Period.

**The data persistence question nobody is asking:** Where do folder assignments live? If you store them in each `project.json`, you now have N file writes to move projects between folders, and folder rename requires zero file writes (good) but folder deletion requires reading every project to find orphans. If you store them in a separate index file or electron-store, you have a single source of truth that can desync from the actual project files on disk. Both approaches have failure modes. Pick electron-store but build a reconciliation check on app startup that handles missing projects gracefully.

**Drag-and-drop is a trap.** It feels essential but it is the single most expensive UX feature to get right in Electron — ghost images, drop zones, scroll-while-dragging, accessibility. A multi-select checkbox plus a "Move to folder" dropdown does the same job in 10% of the dev time. Ship that. Add drag-drop in v2 if users actually complain.

**What is actually needed right now:** Two hardcoded categories — "Development" and "Production" — with a toggle on each project. No folder creation UI, no naming, no colors, no icons. Solve the real pain point in an afternoon. If that proves insufficient after two weeks of real use, then build the full folder system with actual usage data informing the design.

Don't build folder infrastructure for a one-person test phase. Build a filter.

### The First Principles Thinker

The real problem isn't folders. It's filtering.

A content creator with dozens of projects needs to answer one question fast: "what needs my attention right now?" Folders are a filing cabinet metaphor from the 1990s. They force a single axis of organization (test vs production, or by game, or by platform — pick one). The moment someone needs two axes, folders break. You end up with "do I put this Valorant TikTok in the Valorant folder or the TikTok folder?"

What you actually need is **tags + saved filters**. But — and this is critical — you don't need to build that right now.

Strip it further. The sole tester has exactly one pain point: test projects polluting the real project list. The minimum viable solution is a single boolean: **archive/hide**. Right-click, "Archive project." Toggle "Show archived" in the toolbar. Done. Ships in an hour. Solves the actual problem today.

If you insist on building folders anyway, here's what matters:

**Flat, not nested.** Nested folders are a complexity trap. No content creator is building a taxonomy three levels deep. One level. Period.

**Folders are metadata, not filesystem.** A folder is a tag stored in `project.json` as `"folder": "folder-id"`. The folder list lives in electron-store. Never move files on disk — that's a corruption and sync nightmare for zero user benefit.

**A project belongs to exactly one folder (or none).** Multi-folder membership means you've reinvented tags, so just build tags instead. Pick a lane.

**Default state: no folders, flat list.** The feature should be invisible until someone creates their first folder. Zero onboarding cost.

The question you should really be asking: will this product need tags, smart filters, or search within six months? If yes, build the thin metadata layer that supports all three, and make folders the first consumer of it. Don't paint yourself into a corner solving today's problem with yesterday's metaphor.

### The Expansionist

Folders are the floor, not the ceiling. Here's what everyone else will undersize:

**Smart Folders / Auto-Folders.** Static folders are table stakes. The real unlock is saved-filter folders that auto-populate: "All TikTok clips this week," "Unrendered projects," "Projects with scheduled posts." Content creators think in workflows, not file trees. Ship manual folders now but architect the data model to support dynamic folders from day one — same UI, same sidebar slot, just a `type: "manual" | "smart"` field and a `filter` object.

**Folder-level batch operations.** Right-click a folder -> "Render All," "Schedule All," "Export All." This is where folders stop being organizational and start being operational. A creator with 15 TikTok clips in a "Tuesday Batch" folder should be able to queue-render the entire folder in one click. Nobody else will push for this but it's the feature that makes folders feel like a power tool instead of a filing cabinet.

**Folder templates.** "New Project from Folder Template" — pre-configured with platform targets, subtitle style, aspect ratio. Creator makes a "YouTube Shorts" folder template, every new project dropped in inherits those defaults. This alone could be a marketing bullet point.

**Color + emoji tags on folders.** Not just names. Creators are visual. Let them slap a red dot or a flame emoji on "Priority" folders. Tiny effort, disproportionate delight.

**Cross-folder project references.** A single clip often goes to TikTok AND YouTube Shorts. Don't force a copy — let one project live in multiple folders (like labels, not directories). This prevents the "where did I put it" problem that kills every rigid folder system.

The architectural bet: model folders as lightweight metadata layers over projects, not as filesystem directories. This keeps every expansion path open.

### The Outsider

The first thing that jumps out: you said "folders" but what you actually described is "tags." You want one project in multiple groups? That's tags. You want strict hierarchy? That's folders. Pick one. Doing both is a trap that doubles your UI complexity for a pre-release app with one tester.

My bet: you want folders. Simple, familiar, zero learning curve. One project lives in one folder. If someone drags it to another folder, it moves. Done.

**The thing nobody on your team will say:** Don't store folder membership in the filesystem. Don't restructure `{watchFolder}/.clipflow/projects/` into subdirectories. That's a migration nightmare for existing users and creates coupling between your organizational layer and your storage layer. Store folder assignments as a simple map in electron-store: `{ folderId: { name, projectIds[], color, sortOrder } }`. Projects stay exactly where they are on disk.

**What "all the generic sensible things" actually means for a sole tester who just wants to separate test from real:**
- An "Uncategorized" pseudo-folder that catches everything not explicitly placed
- Sidebar list of folders with counts
- Click folder to filter the existing project list (not a separate view — filtering is cheaper to build and less disorienting)
- Right-click project -> "Move to folder"
- That's it for v1

**What you should NOT build yet:** Nested folders, drag-and-drop, folder colors, folder icons, custom sort per folder. You have one user. Ship the filter. See if it sticks.

**The edge case that will bite you:** Deleting a folder that contains projects someone scheduled for publishing tomorrow. The warning needs to distinguish "remove from folder" versus "delete project files from disk." These are extremely different operations and conflating them will cause data loss.

### The Executor

Here's what you do Monday morning:

**Data model: flat folder list in electron-store.** One new key: `projectFolders` — array of `{ id, name, color, projectIds[] }`. No nested folders. No folder-on-disk changes. Projects stay exactly where they are. A project can exist in zero or one folder. Unfiled projects show under an implicit "All Projects" view. This is a 2-hour implementation, not a 2-week one.

**UI: sidebar folder list + bulk selection.**
1. Left side of Projects view gets a narrow folder panel: "All Projects" at top (always), then user folders, then a "+ New Folder" button at bottom.
2. Clicking a folder filters the project list. That's it. No page navigation, no routing changes.
3. Multi-select: checkboxes on project cards (already have checkbox patterns in the codebase). Selection triggers a floating action bar at the bottom — "Move to Folder" dropdown, "Delete" button.
4. Right-click folder name: Rename, Change Color, Delete. Delete shows a confirmation dialog that says exactly how many projects are inside and whether it will delete clips from disk or just remove the grouping.

**What to skip:**
- Nested folders. Zero users need this at launch. Add it never, probably.
- Drag-and-drop reordering. Nice but not Monday's problem. Sort folders alphabetically.
- Default/auto-generated folders (by game, by status). Sounds clever, solves nothing the user actually asked for.
- Folder icons. Color dot is enough. Ship it.

**First commit scope:** electron-store schema for folders, folder CRUD in main process IPC, sidebar component, filter logic in Projects view, multi-select with move-to-folder action. Six files touched, maybe eight. One session if you're focused.

The hard part isn't the feature — it's resisting the urge to over-design it.

---

## Peer Reviews

### Anonymization Map
- Response A = The Contrarian
- Response B = The First Principles Thinker
- Response C = The Expansionist
- Response D = The Outsider
- Response E = The Executor

### Review 1
**Strongest: Response E.** Only response delivering a concrete, buildable plan scoped to one session. Names data model, UI components, and what to skip.

**Biggest blind spot: Response C.** Designs for thousands of users when ClipFlow has one tester. Smart folders, cross-folder references, folder templates — months of unvalidated work.

**All missed:** Project ordering within folders. Also: what happens to "All Projects" view — flat list? Folder headers inline?

### Review 2
**Strongest: Response E.** Concrete data model, scoped UI plan, realistic effort estimate, clear cut list.

**Biggest blind spot: Response C.** Feature suite for a product with thousands of users. Ignores codebase reality.

**All missed:** Project ordering within folders. Migration path for existing projects — do they land in "Uncategorized"? Does UI prompt? Silent default?

### Review 3
**Strongest: Response E.** Buildable as described in a single session, matches ClipFlow's workflow.

**Biggest blind spot: Response C.** Pure feature fantasy with zero implementation grounding.

**All missed:** How folders interact with existing pipeline. Projects flow through states (ready/processing/done). Does folder override pipeline filtering? If so, users lose visibility.

### Review 4
**Strongest: Response E.** Reads like an implementation brief.

**Biggest blind spot: Response C.** Ignores stated context — solo tester, early-stage app.

**All missed:** Migration path. Persistence location (electron-store vs SQLite). Sort order within and across folders.

### Review 5
**Strongest: Response E.** Concrete, buildable spec matching actual stack.

**Biggest blind spot: Response C.** Designs for product with thousands of users.

**All missed:** Persistence migration. What happens to existing projects on upgrade.

---

## Chairman's Verdict

### Where the Council Agrees
- **Flat folders, not nested.** Universal.
- **Metadata layer, not filesystem.** Universal.
- **The Executor's data model.** Unanimously rated strongest.
- **Skip drag-and-drop for V1.** Multi-select + action bar instead.
- **Delete folder must NOT delete projects.** Returns them to All Projects.

### Where the Council Clashes
- **Folders vs tags vs filters.** Resolution: folders-as-metadata is structurally identical to single-value tags. Not a dead end.
- **How minimal is too minimal.** Resolution: commercial product needs user-created folders, not hardcoded categories.

### Blind Spots Caught
- Migration path for existing projects (3/5 reviewers)
- Folder + pipeline status filter interaction (1 reviewer — critical)
- Sort order within folders (2/5 reviewers)

### The Recommendation
Build the Executor's plan with peer review additions: electron-store schema, sidebar folder list, multi-select + floating action bar, right-click menus, "All Projects" always at top, existing filters compose with folder selection, zero-friction upgrade migration.

### The One Thing to Do First
Define the electron-store schema for `folders` and write IPC handlers (create, rename, delete, recolor, addProjects, removeProjects) — data layer first, UI second.
