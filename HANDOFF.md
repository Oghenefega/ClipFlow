# HANDOFF — Session 268 (2026-09-19)

## Current State

**0.5.0-alpha.10 is on the feed** (`2cc6561`). Fega has installed it and **confirmed #449**: the
waiting Sep 16 Valorant session now proposes Pt1–Pt4 in recording order. #449 is closed with the
`status: untested` label removed. The build carries only that fix on top of alpha.9. alpha.9's three
items (#446, #447, #448) are still open and untested.

## Key Decisions

- **One pass owns pending Day/Pt numbers** (`renumberRows` + one effect in `RenameView.js`). Every
  path that adds or retags a waiting file just drops it into the list: both watchers, import, the
  AI retag and Set Game. The pass then re-derives numbers in filename (= recording) order. Two
  arrival-order recount effects were removed.
- **Hand-typed Day/Pt stick** (Fega's call). `dayManual` / `partManual` survive every pass, and
  derived parts step around a pinned one. Switching a row's game releases them. An Undo restore is
  pinned to its original slot.
- **`renameFiles` still renames in `createdAt` order.** That was left on purpose: for OBS files
  it's birthtime (= recording start), and imports keep arbitrary names, so sorting by filename
  isn't clearly better there. It only matters for the conditional-part naming styles.
- **Old Arc Raiders Day oddities (Jan–Feb) and a test file named "RL 2026-10-15" stay as they are**
  (Fega). Recorded in memory `project_known_library_day_oddities`, so audits don't flag them again.

## Next Steps

1. **Get Fega's alpha.9 results** (they're in the alpha.10 he now runs). Close each on confirmation
   and drop `status: untested`:
   - #448: Gameplay only → Crop 16:9 → Put on clip;
   - #446: re-render after changing the title card; the Queue picture updates at once;
   - #447: a trimmed clip's length in the Queue.
2. Ask whether the Media tab should list **newest first** (unanswered since s267).
3. From s265: ask how the alpha.8 Layout drawer changes went, and close #442/#443/#444 on
   confirmation. #438's first real end-to-end is the next scheduled post that fires while Corva is
   open.
4. Carry-overs: #445 (recording levels undo), #439 (Post with no platforms is silent; a good small
   pick), #440, the alpha.7 items still untested (#433–#437). Ask about #425, #419, #418, #416, #265.
   #176 ("same-day files after a rename get Day+1") is probably settled by #267 + #449; check it and
   close it if so.

## Watch Out For

- **Day/Pt re-derives whenever the pending list, `gamesDb`, the library rows or the rename history
  changes.** Any new code that writes `day`/`part` onto a pending row has two options: set the
  manual flag, or accept that the next pass overwrites the value.
- **The dev profile's settings were restored from a backup** (watch folder, test folder, projects
  root and Gemini key checked by read-back). The scratch fixture under the s268 scratchpad is
  disposable. The test run sent about a dozen Gemini frame-sniff calls on colour-bar test videos
  through the gateway.

## Logs / Debugging

- A Pending row's order of arrival shows in app.log as the order of `Generated N preview frames for
  <file>` lines after a boot. That's how the Sep 18 23:46 boot was shown to load 14-41-45 before
  14-11-40. Read these with the `sess_` id.
- Numbering audit (read-only, on a COPY of `%APPDATA%\Corva\data\clipflow.db`): s268 scratchpad
  `audit449.js` checks parts within each game+date, and `audit449-days.js` checks Day numbers per
  game.
- Rename-tab test harness: s268 scratchpad `fx449-setup.js` / `fx449-drive.js` /
  `fx449-restore.js`. Recipe and traps are in memory `project_cdp_verification_gotchas` (81).
