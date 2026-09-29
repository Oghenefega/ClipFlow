# HANDOFF — Session 279 (2026-09-28 → 29)

## Current State

No installer this session. Fega decided to hold the cut. Four fixes are committed but **unreleased** (the What's New "unreleased" entry is written):
- #472: a Recordings-tab drop can no longer wipe a watch-folder recording
- #475: rename, retag and game ↔ content switch, carrying the entry's history
- #476: hyphenated tags parse
- #477: manual Tracker logs store the tag

All four are closed with `status: untested`, pending Fega on the installed app.

Fega's real library (`%APPDATA%\Corva`) was hand-edited with Corva closed, with backups in `data\backup-2026-09-29-*`:
- RL Sub Reacts is now **Rocket League Reacts** (`RL-R`).
- **VCT** is a content type.
- **Valorant Reacts** (`Val-R`) was added.
- Every em dash is gone from `gamesDb` and `game_profiles.json`.
- Arc Raiders and Egging On play styles are synced from the detection profile. Their Edit-window copies were empty.

The dev profile was restored from backup after the #475 end-to-end runs.

## Key Decisions

- **React switch (#474) design is agreed.** The spec is `tasks/specs/react-switch.md` and the clickable mockup is `tasks/specs/react-switch-mockup.html`. Fega's picks:
  1. VCT and 100T link to Valorant.
  2. Reactions keep their own colour.
  3. One default reaction entry per game. **Valorant's default is 100T**, and Fega confirmed it again after Valorant Reacts existed.
  4. After renaming a reaction, the next row defaults back to the game.
  5. A retag moves the clip's feedback rows.
  6. **Reactions to the main game count as MAIN** in the Tracker. Fega changed this from variety.
- **Reaction taxonomy:** one general reaction bucket per game plus named shows. No per-agent, map or season types, because thin buckets starve learning. Valorant now has 100T (default), VCT (other teams' pro matches) and Valorant Reacts (news).
- **A tag change carries everything over.** Recording files and project names are never renamed (Resolve links, and `feedback.video_id` is the project name). Old tags live in `previousTags`.
- **No em dashes** in anything written for Fega. This is a memory rule.

## Next Steps

1. **Build the React switch (#474).** This is Fega's pick for next session. Plan it in plan mode against the spec. Its prerequisites #475, #476 and #477 are done.
   - It adds a `reactsTo` field on content entries, with a migration.
   - The switch goes in the Rename per-session and bulk pickers, the Recordings drop modal, the Projects retag menu and the split markers.
   - It auto-creates a `<Game> Reacts` entry with the `<TAG>-R` tag, and links the existing entries (RL-R → RL, GTA6-R → GTA6, VCT and 100T → Val, with 100T as the default).
   - Detection and titles get the linked game's `aiContextAuto` as "game being watched".
   - The Tracker main-count also counts linked reactions (`TrackerView.js` ~235).
2. **Keep original file name (#473), explanation first, no plan yet.** Fega asked me to explain it in plain words before any planning. Ask him roughly this:
   > "When a recording is already in a Resolve project, Corva could label it (game, Day, Part) and send it to clipping **without** renaming the file. That keeps Resolve's links working. My recommendation: a one-click 'Keep file name' on the Rename row, and nothing else. No global setting, and no automatic Resolve detection (you already said no to that). Splitting a long recording still works, because it writes new files. Want that?"
3. **Cut an installer when Fega asks.** It carries #472, #475, #476 and #477, plus the library edits' behaviour. It's the only way he can try #475 in Settings.
4. **Dropped:** reconnecting the Resolve project for the Rocket League reaction video. **Dizzy handles it.** Don't raise it again.

## Watch Out For

- **Corva lives in the tray.** Closing the window can leave `Corva.exe` running ("Keep publishing while I stream"). Any external store write must abort in-script if `tasklist` finds Corva. I wrote once while it was running this session. The rule is now in the `clipflow-electron-ipc` skill.
- **#475 renderer/main split.** Main moves the DB, files and `detectedGames`. The renderer rewrites its own persisted slices through `src/shared/entryIdentity.js`. Don't move settings-key writes into main: the renderer would save its stale copy over them.
- **`handleEditGame` is async now.** SettingsView awaits it before closing the modal.
- **Tags:** `[A-Za-z0-9-]`, 1-8 characters, with at least one letter (`cleanTag`/`tagValid` in `modals.js`). The parsers share `TAG_SOURCE` from `reconcile.js`.
- **Leftovers on disk:**
  - four `backup-2026-09-29-entry-*` folders in `%APPDATA%\clipflow-dev\data\`, from the #475 test runs. They're harmless; the delete was blocked.
  - the scratch fixture and `devbackup` in this session's scratchpad.
- **Not exercised end to end:** Undo after a retag (unit-tested only), and the next recording's proposed Day after a retag in the live Rename tab (only the counter carry-over was checked).

## Logs / Debugging

- An identity change logs `Entry identity changed (#475): <old> [<tag>] → <new> [<tag>] <type> {moved…}` in `app.log` (system). A partial file-step failure shows in `moved.problems` and in the toast, with the backup path.
- Import refusals (#472) come back as `{ error }` from `import:externalFile`. The Recordings tab shows "Import failed: …" for 8 seconds.
- CDP driving on this machine:
  - The first `json` target can be the splash window. Wait until `typeof window.clipflow?.importExternalFile === "function"`.
  - Set React inputs through the native value setter plus an `input` event.
  - Scripts: `cdp.js`, `ui.js` and `fill.js` in this session's scratchpad.
- Headless Edge screenshots: `--user-data-dir` needs a real path. A mangled `"\edgeprof"` popped an error dialog on Fega's screen.
