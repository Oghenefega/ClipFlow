# ClipFlow — Session Handoff

_Last updated: 2026-08-13 — Session 166 wrap (game art on Projects tiles + card redesign + transparent taskbar icon, all shipped as **alpha.48** and **Fega-confirmed installed and working** — "good job. All the changes are here.")_

---

## One-line TL;DR

Fega asked for two things and got three: Projects-tab tiles now show each game's real Steam poster (auto-fetched once, cached forever, manual override in Settings), the project cards were redesigned around the bigger art (Fega's variant-A pick: 60×80 posters, 8px glowing circle clip-dots, counts pinned to the card's right edge, static REVIEW badge deleted, Review + delete bin hover-reveal together top-right), and the taskbar icon lost its navy plate (rebuilt from the transparent mark). Alpha.48 cut, installed by me on his machine at his ask, and confirmed live by Fega with screenshots.

## Current State

**Fega's daily driver is alpha.48** (installed this session, visually confirmed). Master is at the alpha.48 bump commit. The alpha.46/47 verification items (#248 feedback pill 6-step script, #219 Rename-tab check, #244 live shakedown) rode along and are still pending his real-world pass — #244's natural test is the next scheduled slot / weekly YouTube token death.

## What Was Just Built (session 166)

- **`src/main/game-art.js`** (NEW) — Steam art fetcher: name → appid via public storesearch (exact-match preferred; `DELISTED_APPIDS` map covers Rocket League = 252950 since Epic delisted it from search), appid → `library_capsule` URL via keyless `IStoreBrowseService/GetItems` (content-hashed asset paths; legacy CDN fallback for old apps), cached to `<DATA_DIR>/game-art/<slug(name)>.jpg`. No gamesDb schema change — art is keyed by slugified game name on disk. `fetchMissing()` boot sweep (5s after launch, main.js) fills gaps; fails soft offline/not-found.
- **`src/main/main.js`** — 4 IPC handlers (`gameArt:list/fetch/setFile/clear`), boot sweep + `logger` lines, `gameArt:changed` pushes to the renderer after any art change.
- **`src/main/preload.js`** — `gameArtList/Fetch/SetFile/Clear` + `onGameArtChanged` bridges.
- **`src/renderer/App.js`** — `gameArt` state (name → `{path, v}`; `v` = file mtime for `<img>` cache-busting), refresh on `gameArt:changed`; new games fetch art in background via `handleNewGame`.
- **`src/renderer/views/ProjectsView.js`** — the whole card redesign: poster tile 44×58→60×80 shows the art (`toFileUrl(path)?v=`), letters remain the no-art fallback; clip-ladder dashes → 8px circles (colored stages get the ui-standards glow, ghosts flat); count pinned right via space-between; static Badge column deleted; Review/Open button + trash bin moved into the title row, hover-revealed (`.pl-open`/`.pl-trash` CSS untouched).
- **`src/renderer/components/modals.js`** — GameEditModal "Game Art" section: 44×58 preview, Find on Steam / Refresh, Choose image… (jpg/png/webp via `openFileDialog`), Remove.
- **Icon**: `ClipFlow stuff\Logo\make-app-ico.py` SOURCE → `clipflow-mark-1024.png` (transparent master, 83–90% canvas fill — healthy); rebuilt 9-rung ICO (transparent corners verified at 16 + 256), copied to `public/icon.ico`; `public/icon.png` → transparent master. Logo README updated (tile = social avatars only now).
- Mocks: `tasks/mocks/game-art-tiles.html` (art variants) and `project-card-layout.html` (3 card-layout variants; Fega picked A + circles).

## Key Decisions

- **Art source = Steam's public store art, not AI generation** — real key art, free, keyless, poster is exactly the tile's 2:3 shape. Industry-standard practice (Playnite/GOG Galaxy/Discord).
- **Art keyed by slugified game NAME on disk** (name is the codebase's primary key for games) — zero schema change, zero migration.
- **Non-Steam games (Valorant, Meccha Chameleon) keep letters** until Fega picks a file — deliberate fail-soft; never fake art.
- **Variant A** ratified by Fega from the mock: no static status badge; the right-aligned count carries status; actions hover-reveal top-right.
- Card redesign is Projects launch-pad list only — the clip browser inside a project is untouched.

## Next Steps

1. **Open questions Fega never answered (non-blocking, Settings override exists):** which Prince of Persia he actually plays (Steam matched the 2008 game — his tiles show it; if wrong: Settings → game → Choose image), and whether he wants a Valorant poster file found for him.
2. **#250** (beta distribution / auto-update) — unchanged from last session's queue.
3. Pending verifications riding alpha.48: #248 6-step script, #219 Rename-tab 10-second check, #244 live shakedown at next scheduled slot.
4. Carry-over: Arc Raiders Aug-8 "Video file not found" publish-log tail (Queue territory); #156 close on Fega's nod.

## Watch Out For

- **`tasks/todo.md` is a 3,724-line session ARCHIVE** despite its header claiming "active plan only" — NEVER full-file Write it (session 166 near-loss; rule now in clipflow-code-review + memory `project_todo_md_is_archive`).
- **Steam fetch retries every boot for not-found games** (no negative cache — deliberate, 2 requests/boot/game). If Fega adds many non-Steam games this could get chatty; fine at current scale.
- **`?v=` cache-buster on file:// img URLs works** (verified live) — `toFileUrl` escapes `?` inside the path, so appending the query after the call is safe.
- **Art dir differs by profile**: `%APPDATA%\clipflow[-dev]\data\game-art\` (packaged/dev), `<repo>\data\game-art\` for source-run prod (now gitignored).
- **The GameEditModal art buttons call IPC directly** (window.clipflow, like gameProfilesGet) — no prop threading; ProjectsView refreshes via the `gameArt:changed` push, not via modal onSave.
- **CDP synthetic clicks fire handlers on elements BEHIND overlays** (`el.click()` bypasses hit-testing) — a "find the ✕ button" click hit a Main-Game chip's remove button behind the open modal and silently mutated the dev profile's main pool (restored). Target selectors by scoped container, and prefer `CSS.forcePseudoState` over synthetic mousemove for :hover (Input.dispatchMouseEvent did NOT trigger :hover).
- **Git Bash mangles `taskkill /IM`** into a path — use `taskkill //IM electron.exe //F`. Also bash expands `$p` inside double-quoted PowerShell one-liners — single-quote or use a file.

## Logs/Debugging

- **Game-art boot sweep:** app log, `(system) Game-art boot sweep done {"fetchedNew":bool}` ~5s after launch; a per-game failure surfaces in the Settings modal as a yellow message ("Not on Steam…" / "Couldn't reach Steam…").
- **Art cache:** `%APPDATA%\clipflow\data\game-art\*.jpg` — delete a file + restart (or Refresh in Settings) to re-fetch.
- **Prior session's channels unchanged:** publish results in `clipflow-publish-log.json` (scheduled attempts carry `"scheduled": true`), pre-flight in app log scope `(preflight)`, `needsReconnect` in `clipflow-tokens.json`, feedback reports in Sentry `flowve/clipflow`.
