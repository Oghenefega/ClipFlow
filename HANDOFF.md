# HANDOFF — Session 257 (2026-09-14)

## Current State

Master is clean at this wrap's commit. **No installer was cut** — alpha.4 is still what's on
the feed and on Fega's daily driver, so the one code change this session (#417) is on master
only. One commit of product code: `3d8c729`.

Two asks, both done:

1. **Caption templates got the follow line (data, not code).** All three social templates now
   read `{title} | FOLLOW FOR MORE!😏 <platform tags> {gametags}`. Instagram also gained the
   `!` it was missing. YouTube untouched. Written directly into
   `%APPDATA%\Corva\clipflow-settings.json` with Corva closed; backup at
   `clipflow-settings.backup-2026-09-14-pre-followline.json`.
2. **#417 — a scheduled clip shows its captions.** The expanded scheduled row now renders the
   same per-platform block the Unscheduled card has, editable, so reading or fixing a
   description no longer means unscheduling. Closed `status: untested`.

**#416 is open** — filed, not started.

## Key Decisions

- **The three social templates are global, and Fega believes they're per-game.** He opened with
  "broken into categories and games… I can't just change 1". They are three strings shared by
  all 16 library entries. The panel's two disclaimers are the smallest, faintest text on it.
  That's #416.
- **Editable, not read-only, in the scheduled panel.** Read-only would have left the
  unschedule-to-edit loop intact, which is the whole ticket; the panel already let him toggle
  platforms, so nothing new is being risked.
- **`renderCaptionCards(clip)` is a pure move**, not a rewrite — the block read nothing from the
  unscheduled map's loop scope. Both views call the one function so they can't drift.
- **CUSTOM now means "differs from the game's line", not "carries its own copy".** Scheduling
  freezes the tag lines onto the clip (#383), which the old check read as a user edit — every
  scheduled clip would have worn two badges it never earned.
- **Titles keep their trailing `#valorant`.** Offered to move it into the tag line; Fega:
  "leave the titles the way it is. Don't wanna excavate that."

## Next Steps

1. **Cut an installer, or wait.** #417 and the CUSTOM fix are the only unshipped changes; the
   batch rule says wait for ~10 or an explicit ask. Fega was told to say "cut it".
2. **Clear the `status: untested` labels** on #406, #407, #409–#415 once he confirms alpha.4's
   layouts and overlays, and on #417 once it reaches him.
3. **#416** — the Captions panel reading as per-game.
4. **#265 first-run setup checklist**, still the largest code item.
5. **#408**, **#405**, **#21** — unchanged from s255/s256.
6. Still open from s255: is the Google OAuth consent screen verified or only published?

## Watch Out For

- **A source run of the prod profile rewrites the tracked `data/clipflow.db`** (245KB → 564KB
  via the boot backfill) and `git add -A` will commit it. Stage by path in any session that
  launched from source; `git show --name-only HEAD` before pushing. `--amend --only <paths>`
  does **not** drop an already-committed path — `git checkout HEAD~1 -- <path>` then a plain
  `--amend` does.
- **Never edit `clipflow-settings.json` while Corva runs.** electron-store holds the file in
  memory and rewrites the whole thing on the next `store.set`. Close the app first (the store
  is not created with `watch`), and verify the values survived the next boot.
- **Expanding a scheduled row now fires TikTok's `creator_info` call**, because the TikTok
  options panel is part of the shared block. Same call the Unscheduled card always made; six
  rows opened one after another means six calls.
- **An expanded scheduled row is now tall** — four platforms, four caption cards. Bounded (each
  caption's read view caps at 120px) but no longer a small panel. Folding it behind a reveal is
  the follow-up if it reads badly.
- **`taskkill /IM Corva.exe` without `/F` does not close it** — the signal is accepted and the
  processes stay. `/F` is needed. Killing the source run is different: filter `Win32_Process`
  on a CommandLine containing `Desktop\ClipFlow` rather than `/IM electron.exe`, which takes
  DaVinci's Epidemic Sound plugin with it.
- **`TaskStop` on a backgrounded `npx electron .` kills the wrapper, not the Electron tree.**
  Five processes survived it; kill by PID afterwards.
- **Approved clips missing from the Queue are usually correct** — `scheduledClipIds` knocks out
  anything the tracker already has with a `clipId`. Two approved, rendered, unscheduled AIMBOT
  clips are absent for exactly that reason (published 2026-09-08/09). Not a bug.

## Logs / Debugging

- **CDP driver:** `scratchpad/cdp.js` — `eval "<js>" | shot <png> [w h]`. Boot the prod profile
  from source with `npx electron . --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion
  --disable-renderer-backgrounding --disable-background-timer-throttling` (built renderer, not
  Vite), with the installed Corva closed or it exits on the single-instance lock.
- **Clicking a queue row over CDP:** `document.querySelectorAll('div')` finds the outer layout
  div first — filter on `style.display==='grid' && style.cursor==='pointer' &&
  style.gridTemplateColumns.startsWith('48px')` or you click a 936px-tall wrapper and nothing
  happens.
- **Typing into a React field over CDP:** the native value setter plus
  `dispatchEvent(new Event('input',{bubbles:true}))`, then `.blur()` to trigger the save.
- **Reversible data round-trip:** `window.clipflow.projectUpdateClip(pid, cid, {...})` from the
  renderer is the same call the UI makes, so a clip can be unscheduled and restored exactly;
  `location.reload()` between steps. Diff the clip's fields against a snapshot afterwards —
  only the project's `updatedAt` should move.
- **Emulated viewport:** `Emulation.setDeviceMetricsOverride` at 1280×860 yields a 960px CSS
  viewport here (a 1.333 zoom factor is in play), so it's a stricter fit test than asked for.
  Clear the override afterwards.
- **Settings history is on disk:** `clipflow-settings.backup-*.json` and `.bak-*` beside the
  live file date any change to the store — that's how "FOLLOW FOR MORE was added this morning"
  was established. `clipflow-publish-log.json` holds what actually went out, under
  `clipTitle` / `clipCaption` (not `title` / `caption`).
