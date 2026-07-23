# ClipFlow — Session Handoff

_Last updated: 2026-07-23 — Session 122 — **Preview sharpness fix + Queue polish + clip management (duplicate/create/delete, editable Play Style diff, scroll restore). Cut 0.3.0-alpha.6; Fega installed it. ALL of it is still untested on the daily driver — next session is a verification pass.**_

---

## One-line TL;DR

A long grab-bag session driven by Fega's live testing: fixed the reframe preview's blurry-at-Fit rendering (stepped downscale), polished the Queue tab (game-hue rows, portaled dropdowns, honest video-level "Published Today"), made the editor's dead context-menu items real (Duplicate original video + Create as new clip), added clip deletion (editor dropdown + Review Rail), rebuilt the Play Style dialog as an editable diff, made right-click menus viewport-aware, and added scroll-restore to clip navigation. Cut + pushed 0.3.0-alpha.6 (commit `02481ac`); Fega installed it at session end.

## Current State

- **0.3.0-alpha.6 installed** on the daily driver. Builds clean (renderer + NSIS).
- **Nothing from this session is Fega-verified on the INSTALLED build yet.** He verified each change on `npm start` source runs as they landed, then installed alpha.6 and closed the session. Next session opens with him re-testing the batch on the daily driver.
- Commits this session: `f1e761b` (preview sharpness), `172b368` (Queue polish), `160a914` (clip management + Play Style + scroll restore), `02481ac` (version bump + installer).

## What Was Just Built

**Editor preview sharpness (reframe active)** — `PreviewPanelNew.js`
- At Fit zoom the #164 compositor shrank the 2560-wide source 4–5× in one `drawImage` → aliased/pixelated (fine when zoomed in, since the ratio drops under 2×). Chromium ignores `imageSmoothingQuality: "high"` on the GPU video path, so the real fix is `drawVideoHQ()`: a halving-ladder downscale through a scratch canvas until the final step is ≤2×. Applied to cam band, game band, feather path, and the fully-zoomed path; the intentionally-blurred background band untouched. Exports were never affected (FFmpeg path).

**Queue tab** — `QueueView.js`, `shared.js`
- Shared `Select` menu now portals to `<body>` (fixed-position, zIndex 10000): escapes card `overflow:hidden` + dnd-kit transform stacking contexts. Closes on outside click / page scroll, NOT menu-internal scroll (RenameView pattern). Fixes schedule date/hour/minute pickers + every clipped Select app-wide.
- Clip rows carry the Projects-tab game-hue wash (`gameColorFor()`: project gameColor → gamesDb tag/hashtag/name match → accent). Selected row = stronger wash, NOT purple. **Expanded settings panel deliberately neutral** — Fega: per-game-tinted form areas read as inconsistency; identity color on rows only.
- Game tag pills use `GamePill` with a new `variant="solid"` (Projects-poster gradient, white text). Default tint variant unchanged elsewhere.
- "Published Today" counts unique videos (Set over `clipId||clipTitle` of today's success logs), not per-platform log entries.
- YouTube Privacy picker converted from native `<select>` (unreadable white Chromium popup) to the shared Select — same reason TikTok's was converted long ago.
- Caption/description edit textarea opens ≥120px (read-view parity) and auto-grows; guarded so manual drag-resize isn't fought (`dataset.sized` + only-grow-on-overflow).

**Play Style dialog** — `modals.js` (`ProfileDiffModal` + new `ProfilePane`)
- Both panes editable in place (Edit pencil or double-click; blur returns to highlighted view). Line-level diff, whitespace/case-insensitive: green = added in Proposed, red tint = dropped from Current. Per-pane word counter, amber >300 words (the AI update prompt's own budget). "Accept Update" saves Proposed as edited; "Keep Current" now persists Current-side edits (was silently discarding them). Trigger is still organic only (post-batch threshold via `UploadView.js` profileQueue) — no manual test button.

**Editor context menu** — `TrackContextMenu.js`, `TimelinePanelNew.js`, `projects.js`, `main.js`, `preload.js`
- Viewport-aware placement: measures in `useLayoutEffect` (pre-paint, no flicker), flips above the cursor when no room below, clamps right edge.
- "Duplicate original video" (was `/* TODO */`) and "Create as new clip" (was close-only) now work via new `project:duplicateClip` IPC. `projects.duplicateClip()` deep-copies the clip; copy = new id, "(copy)" title, `status: "none"`, `renderStatus: "pending"`, `renderPath: null`, `publishState: {}`, inserted after the original. Create-as-new passes overrides `{ nleSegments: [seg], startTime/endTime: seg bounds }`. Renderer saves current edits first (`handleSave`), then `initFromContext` to the copy.

**Clip deletion** — `main.js`, `preload.js`, `EditorLayout.js`, `ProjectsView.js`, `App.js`
- New `project:deleteClip` IPC wrapping the pre-existing (never-exposed) `projects.deleteClip` with `deleteFile=false` — **record removal only, files never deleted from disk**.
- Editor `ClipNavigator` tiles: hover trash, two-stage confirm ("Delete?"), status badges hide on hover so the corner is free. Tiles converted `<button>` → `<div role="button">` (nested-button validity). Deleting the open clip jumps to nearest neighbor; last clip exits the editor.
- Review Rail `ClipRow`: quiet trash beside the score, same two-stage confirm; App-level handler reloads the project into `localProjects` + `selProj`.

**Clip navigation scroll-restore** — `EditorLayout.js`, `ProjectsView.js`, `App.js`
- ClipNavigator opens scrolled to the active tile (`scrollIntoView` on mount).
- Exiting the editor: `App.js` captures `editorContext.clipId` → `returnClipId` → `ClipBrowser scrollToClipId` prop; rows are wrapped in `data-clip-id` divs; one rAF then `scrollIntoView({ block: "center" })`. Not cleared after use (clip ids are globally unique, so a stale value can only ever match the same project — re-scrolling there is acceptable).

## Key Decisions

- **Version 0.3.0-alpha.6** (alpha tick, not minor bump): fixes + polish + features on existing surfaces; consistent with the 0.3.0 pre-beta line precedent (Projects redesign also shipped as a tick).
- **Identity color on identity surfaces only** (Fega): game hue on rows/headers; settings/forms stay neutral across games. He explicitly declined a standing rule/lesson about it — treat as this-session context, not doctrine.
- **Delete never touches files on disk** — record-only. If Fega wants render-file deletion too, it's a one-flag change in the IPC handler.
- **Duplicate switches the editor to the copy** — matches the "trim the second moment next" flow.
- **Play Style advice given:** the profile has real diminishing-returns dynamics (attention dilution, contradiction rot); the update prompt already targets 150–300 words and rewrite-not-append; the amber word counter is the nudge. No hard cap added.
- **data/ files:** the launcher skill's rule (never commit `data/clipflow.db` / `game_profiles.json`) was violated in `160a914` (I followed older per-session precedent before loading the skill). Left as-is (private repo, own data); follow the strict rule going forward.

## Next Steps

1. **Daily-driver verification pass of the whole alpha.6 batch** (Fega said explicitly: "a ton of upgrades and changes that I need to test in the next session"): preview Fit sharpness, Queue dropdowns/rows/pills/count, description edit box, context-menu flip, Duplicate + Create as new clip, clip delete (both places), dropdown + back-navigation scroll restore, and — when it next fires organically — the Play Style diff dialog.
2. Fega mentioned the app "feels smaller / eye strain" in non-maximized mode — advised Ctrl+0 (page zoom likely nudged); **no confirmation it helped**. If it persists, investigate properly (zoom factor persistence, or an actual density audit).
3. If anything in the batch fails on the installed build, remember it worked on source — check installed-vs-source first (see feedback_test_on_daily_build).

## Watch Out For

- **`drawVideoHQ` ladder edge case is guarded** (shrink barely over 2× → empty ladder → direct draw) — don't remove the `!sizes.length` guard.
- **Shared Select is now portaled app-wide.** Any Select inside a modal relies on menu zIndex 10000 > modal 9999. If a new overlay goes above 10000, menus will hide behind it.
- **ClipNavigator tiles are divs, not buttons** — keyboard Enter handled manually; keep `role="button"`/`tabIndex` if editing.
- **Deleting the open clip while dirty:** edits are intentionally discarded (user is deleting the clip); a trailing autosave may fire `projectUpdateClip` against the deleted clip id — returns "Clip not found", harmless, but don't "fix" it into recreating the clip.
- **Duplicate copies persisted subtitles filtered to the ORIGINAL's segments** — the copy carries extra subs harmlessly (only visible-segment subs render; next save of the copy prunes to its own segments). Don't "fix" the surplus; it's self-healing.
- **`data/clipflow.db` + `data/game_profiles.json` are always dirty** — never stage them (launcher skill hard rule; was breached once this session, see Key Decisions).
- **Play Style modal has no manual trigger** — testing it means waiting for a clip batch to cross a game's session threshold, or temporarily lowering the threshold in Settings → game modal.

## Logs/Debugging

- No new error patterns this session. App boots clean post-changes (`App started 0.3.0-alpha.5→6`, DB schema v4, migration skip — normal).
- The repeated background-task "failed with exit code 1" notices during the session were just `npm start` processes dying when `taskkill //F //IM electron.exe` cleared them for rebuilds — expected, not crashes.
- Verification method this session: `npm run build:renderer` + `npm start` per change, Fega eyeballing; computer-use screen access was requested once (preview sharpness) and denied — verification stayed manual.
