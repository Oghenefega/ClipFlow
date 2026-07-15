# ClipFlow — Session Handoff
_Last updated: 2026-07-15 — Session 101 — **UI batch: Tracker game colors fixed, 1440p zoom scaling, DM Sans everywhere, Projects game hues + sorting, Weekly Rundown popup. Alpha.16 cut, awaiting Fega's install.**_

---

## One-line TL;DR
A full UI-polish day: two Tracker display bugs fixed (grey lowercase "rl"), the app now scales up on wide windows, JetBrains Mono is gone app-wide, the Projects tab got game-hue cards + a sort control + TEST-chip cleanup, and the Tracker recap became a "Weekly Rundown" header button with a preview popup. `0.1.8-alpha.16` installer is built — **Fega has NOT installed it yet.**

## Current State
- **Installed daily driver: 0.1.8-alpha.15** — alpha.16 is cut (`dist/ClipFlow Setup 0.1.8-alpha.16.exe`, 2026-07-15 02:36) and the in-app "Install update" banner will offer it on next launch. Everything through commit `7947930` is in it.
- All session-101 changes were verified live in the source-run app via computer-use (screenshots of teal RL chips, maximized-window zoom, hue cards, sort clicks, Rundown modal, and a real PNG save).
- Working tree: usual never-commit `data/` pair + untracked `tasks/mocks/` scratch from an earlier session (bb*.md, diag_sort.js, queue-card-redesign.html — deliberately left uncommitted).

## What Was Just Built
- **Tracker "rl" grey/lowercase fix:** auto-posted entries store the lowercased short tag ("rl"); both display lookups (TrackerView `resolveGameDisplay`, TrackerCalendar `resolveGame`) now match tag/hashtag/name case-insensitively, so weekly-log chips, calendar segments, and day-drawer chips show teal uppercase RL — retroactive, no data repair.
- **1440p scaling:** `main.js` applies `setZoomFactor(clamp(width/1920, 1, 1.35))` on resize + did-finish-load. ≤1920px content width = exactly the old look; maximized on Fega's 2560px monitor ≈ 1.33×.
- **DM Sans everywhere:** `T.mono` (theme.js) and Tailwind `fontFamily.mono` now resolve to DM Sans; hardcoded JetBrains refs swapped in SettingsView (debug pre), editorPrimitives (timecode popover), EditorView (crash screen), recapCardImage (canvas headline); JetBrains dropped from the index.html Google Fonts import. Token names kept so call sites are untouched.
- **Projects tab:** game-color gradient wash + tinted border per card (mockup Variant B — `tasks/mocks/projects-hue-and-recap.html`); "Sort: Status | Date | Game" segmented control persisted as `projectSortMode`; TEST chip renders only on actual test projects (still clickable there to un-test).
- **Weekly Rundown:** the always-visible bottom recap card is gone. Header button ("Weekly Rundown", between the view toggle and Export) opens a modal titled "ClipFlow Rundown · <week range>"; PNG generates/downloads only on the Download click (filename now `clipflow-rundown-<week>.png`). Esc / X / click-outside close it.

## Key Decisions
- **Zoom over per-view widening** for the 1440p problem: one main-process change scales every tab, the editor, and Radix portals consistently; no font-size surgery. If Projects still feels cramped after Fega sees it, widen that view specifically.
- **Mono tokens kept, values swapped:** `T.mono`/`font-mono` deliberately render DM Sans now — do NOT "fix" them back (see memory `feedback_dm_sans_only`; enforcement line added to clipflow-ui-debug).
- **Preview-first Rundown:** Fega explicitly wanted the popup to show BEFORE anything downloads. Don't re-add auto-download on open.
- **TEST toggle:** test-ness is decided at creation (test watch folder); normal projects show no toggle by design now.

## Next Steps
1. **Fega installs alpha.16** and eyeballs: maximized-window scaling (biggest visible change), teal RL in Tracker, Projects hues/sort, Weekly Rundown popup.
2. If the scaling factor feels too strong/weak on his monitor, tune the `width/1920` curve or the 1.35 cap in `main.js` (`applyWindowZoom`).
3. The "Review Rail" Projects-tab premium redesign (session 89 mockup, memory `project_projects_tab_redesign`) is still the bigger pending direction for the project DETAIL view — today's changes touched only the list.
4. #163 (YouTube reconnect messaging) still open; Google Cloud consent screen Testing→Production remains the permanent OAuth fix.

## Watch Out For
- **Rundown PNG canvas** (`recapCardImage.js`) headline now renders in DM Sans — if the share image ever looks off, that's the line that changed (163).
- **A leftover verification PNG** (`clipflow-recap-2026-07-13.png`) landed in Fega's Downloads during testing — safe to delete.
- **Zoom + screenshots:** any future pixel-coordinate automation (computer-use) on a maximized window now operates on zoomed UI; coordinates from old screenshots won't line up.
- **"Dimmer" overlay app** on Fega's machine intermittently owns the foreground and blocks computer-use clicks — `open_application("Electron")` re-fronts the app and unblocks.
- The game-hue wash on Projects cards layers UNDER the selected (accentDim) state; error rows keep red borders. Done rows keep the game border by design (mock-approved).

## Logs/Debugging
- No errors this session. Both builds clean (`vite build` ~12s; electron-builder NSIS ~2.5min with the usual benign "author is missed" warnings).
- Verification was computer-use driven on the source-run app (`npm start`, prod profile). Remember: "electron.exe" is the app name to request; "ClipFlow" for the installed exe.
