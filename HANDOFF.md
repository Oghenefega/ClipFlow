# ClipFlow — Session Handoff

_Last updated: 2026-07-21 — Session 120 — **Projects tab rebuilt as a launch-pad list (folders retired) + three Rename-tab fixes. Cut 0.3.0-alpha.4; Fega installed it.**_

---

## One-line TL;DR

Fega asked for four things and approved an HTML mockup for the big one: the Rename game-dropdown was clipped by its card (fixed with a React portal), always-visible selection checkboxes on Rename + Projects (now hover-reveal), the per-row TEST toggle removed from Rename, and a full redesign of the **outer** Projects list — now a "launch pad" with game-hue poster rows, a per-clip pip progress strip, status + game filter chips and a sort dropdown, with the folder sidebar retired. Built, renderer compiles clean, installer 0.3.0-alpha.4 cut + pushed (commit `0159181`) + installed.

## Current State

- **0.3.0-alpha.4 installed** (Fega confirmed "installed it"). Renderer build clean (2748 modules). **Not yet visually verified by Fega in real use** — awaiting his read on the live Projects/Rename look.
- Four changes shipped (below). Dead folder code left inert in ProjectsView.js — cleanup ticket **#179** open.

## What Was Just Built

- **Rename — game dropdown portal fix.** `GroupedSelect` (RenameView.js) renders its menu via `createPortal` to `document.body` (position:fixed from getBoundingClientRect), escaping the session card's `overflow:hidden` clip + the z-index race with the naming pill. Closes on outside-click / scroll. Removed the old wrapper-only outside-click effect (would've closed the portaled menu before a selection registered).
- **Hover-reveal checkboxes — Rename + Projects.** Hidden (width/opacity 0) until row hover, or shown for all rows when a selection is active ("select mode"). Rename: `.cfr-check` wrappers + `.cfr-selecting`/`.cfr-shead` rules in the injected `<style>`. Projects: `.pl-chk` + `.pl-list.selecting` in a new injected `<style>`.
- **Rename — TEST toggle removed.** Deleted the `<TestChip>` render (~RenameView.js:1709) + its import. TestChip.js untouched (still used by Projects/Queue/Upload). `isTest` still auto-set by the test watcher.
- **Projects OUTER list — launch-pad redesign.** Rebuilt ProjectsListView header/list: game-hue poster + per-clip pip strip (green approved / red rejected / dim to-review) + "N of M left · X rendered" + Review/Open + hover trash. Folder sidebar + Status/Date/Game sort bar removed; replaced by status chips + game filter chips + a Sort dropdown (recent/oldest/most-to-review/name). Move-to-Folder bulk action removed. Pips come from real `p.clips[].status`/`renderStatus` (already in the listProjects summary). Folder store data left untouched.

## Key Decisions

- **Rich rows over Tight** (Fega's pick from the mockup). Kept the game-hue wash (corner glow, not a left-edge bar — his rule) + hover-lift.
- **Portal over dropping overflow:hidden** for the dropdown fix (robust, industry-standard).
- **Folders retired, data left in storage** (Fega: "leave the folder data"). Dead folder UI/handlers left inert to keep the build green; excision → #179 rather than risk a ~400-line delete in the same pass.
- **Version = 0.3.0-alpha.4** (alpha tick, not a minor): the whole 0.3.0-alpha line is the pre-beta iteration track (the Rename redesign itself was alpha.1), so consistency beat a 0.4.0 jump.
- **No projects.js change** — pips derive from clips already in the summary.

## Next Steps

1. **Fega verifies the live look** on the daily driver with real projects. Watch: pip colors correct, game-filter narrows to one game, sort order, hover-reveal feel, nothing misaligned. Fix on report.
2. **#179 — excise the dead folder code** (sidebar handlers, folder + project context menus, delete-folder dialog, undo toast, orphaned state) and drop the now-unused props from the App.js call site. Own focused pass + rebuild.
3. Optional: decide whether to purge the folder store data (left for now).

## Watch Out For

- **ProjectsView.js is CRLF + has emoji escapes.** Large edits fail exact Edit-match — use a Node patch script with ASCII-only `indexOf` anchors + slice (this session: `scratchpad/pv-splice.js`). Single-line ASCII edits via Edit are fine.
- **Inert folder machinery still in ProjectsView.js.** Rows no longer wire `onContextMenu` and the sidebar is gone, so `contextMenu`/`projectContextMenu`/`deletingFolder`/`moveFolderDropdown` never set → those menus/dialogs/toast render nothing; handlers (`handleMoveProjects` etc.) are dead but still defined. #179 removes them.
- **Not driven live this session.** Verified compile + structure only (Fega's app was running; no CDP client installed — no `ws`/`chrome-remote-interface`). Any rendering glitch surfaces on his real-data pass.
- **Sort default changed to "recent";** old stored `status`/`date`/`game` values are ignored on load (guarded), falling back to recent.

## Logs / Debugging

- `npm run build:renderer` → clean (2748 modules, ~17.6s). `npm run build` → `dist/ClipFlow Setup 0.3.0-alpha.4.exe` (124 MB, exit 0). Benign warnings only (chunk >500 kB; "author is missed"; @electron/rebuild).
- No console/runtime driving performed. If a runtime error appears, likely spots: the new injected `<style>` blocks, the sort dropdown's outside-click (shares the existing `[data-menu]` mousedown handler + `setSortOpen`), or a project with no `clips` array (guarded via `p.clips || []` + `clipCount` fallback).
- No CDP tooling present. To drive next time: launch a dev-profile instance from `build/` with `--remote-debugging-port=9222` + install a CDP client, OR use computer-use on "electron.exe" (per memory `project_computer_use_app_names`).
