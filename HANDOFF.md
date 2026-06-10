# ClipFlow — Session Handoff
_Last updated: 2026-06-09 — Session 78 — **0.1.7-alpha cut & promoted to the daily driver.** Bumped the app version, built a fresh installer carrying all of session 77's karaoke/subtitle fixes, and Fega installed it via the in-app update banner — his daily-driver app runs those fixes for the first time. Also codified the whole promotion loop into a new `clipflow-update-launcher` skill._

---

## One-line TL;DR
Short maintenance session, no feature/code changes: `0.1.6-alpha → 0.1.7-alpha`, `npm run build` → `dist/ClipFlow Setup 0.1.7-alpha.exe`, Fega updated and confirmed. New `clipflow-update-launcher` skill makes "update the launcher / prod app" a one-phrase command. No schema change (still v4).

## Current State
Healthy on **0.1.7-alpha**, schema **v4** (unchanged, no migrations). The installed Start-Menu app now carries the session-77 fixes — the first promoted build that has them (the prior `dist` installer was the Jun-5 `0.1.6-alpha`, pre-session-77). 2 commits pushed this session (`c3fee47` version+changelog, `4ee8fdf` skill) plus this handoff commit. Working tree has ONLY runtime churn (`data/clipflow.db`, `data/game_profiles.json`) — never commit those. **Code backlog: 30 open** (unchanged; 12 launch-ops parked/hidden).

## What Was Just Built
1. **Version bump `0.1.6-alpha` → `0.1.7-alpha`** (`c3fee47`) — `package.json` line 3 only. The renderer reads the version live via `app.getVersion()` (Settings → bottom), so there is no hardcoded version string in the UI. CHANGELOG session-78 entry added.
2. **Fresh installer** — `npm run build` produced `dist/ClipFlow Setup 0.1.7-alpha.exe` (118 MB, Electron 40.9.1, NSIS). First installer to carry session-77's 10-issue karaoke/subtitle sweep. Fega installed it through the in-app **Install update** banner and confirmed ("I just updated it. great!").
3. **`clipflow-update-launcher` skill** (`4ee8fdf`, `.claude/skills/clipflow-update-launcher/SKILL.md`) — codifies the Stage-1 promotion loop. Triggers on "update the launcher / prod app / installed app / cut a new build / promote to prod". Default: bump patch + keep `-alpha`; build; commit ONLY `package.json` + `CHANGELOG.md` (never `data/` churn); tell Fega to reinstall via banner or double-click.

## Key Decisions
- **Kept the `-alpha` suffix** (`0.1.7-alpha`, not `0.1.7`) — product is still pre-launch / personal-testing, so the alpha track is the honest label. Fega chose this when asked; the skill's default preserves it.
- **Default bump = next patch, keep suffix.** Encoded in the skill. An explicit version overrides it ("update to 0.2.0").
- **Old installers in `dist/` left in place** (8 now, ~940 MB). The update notifier only ever picks the newest by mtime, so they're harmless. Fega said leave them.
- **Did NOT touch the update-notifier code or electron-builder config** — used the existing Stage-2 local notifier (`main.js` ~2930) and installer config as-is. Full `electron-updater` + code signing remains deferred (infra dashboard H4); this loop is the interim manual-reinstall + local-notifier path.

## Next Steps (prioritized)
1. **#137** — timeline subtitle split passes *timeline* time into `splitSegment`'s *source-absolute* lookup → splits the wrong place on generated clips. Mirror the `LeftPanelNew.js:576-581` `timelineToSource` pattern; also fix the `hasSub` track-pick check. (Warm from session 77.)
2. **#138** — AA (ALL CAPS) toggle updates panel `text` but not `words[]`, so preview/export keep old casing until a mode switch re-syncs. Fix in `updateSegmentText` (re-sync `words[i].word` from text when counts match — same rule #89 uses). Part of the `words[]`-must-cover-`text` family.
3. **#135** — caption box corner handles (free-transform scale; `DraggableOverlay` in `PreviewPanelNew.js`).
4. **#99** caption styling bleeds across clips · **#105** over-trim sliver · **#68→#62** pipeline pair (needs a silent screen-recording from Fega).

## Watch Out For
- **`data/clipflow.db` + `data/game_profiles.json` are always dirty (runtime churn) — never commit them.** Stage files explicitly; never `git add -A` / `git add .`.
- **`package.json` line 3 is the single source of truth for the app version** — no hardcoded version in the renderer. Settings "ClipFlow v…" reads `app.getVersion()` via IPC.
- **To promote source fixes to Fega's daily driver you MUST cut a new installer** (`npm run build` → `dist/`) AND he must run it — `npm start` from source is a backup path only and does NOT update the installed Start-Menu exe. Use the `clipflow-update-launcher` skill.
- **The update notifier** (`main.js` ~2937 `update:check`) scans `C:\Users\IAmAbsolute\Desktop\ClipFlow\dist` for the newest `ClipFlow Setup *.exe` and shows the in-app banner when its filename version ≠ the running version. Shipped 2026-05-08 (session 35), so any post-that install has it.
- (Carried from session 77, still live) **Segment time-ownership is half-open `[startSec, endSec)`** in `LeftPanelNew` — don't revert to `<= endSec`. **`words[]` must always cover `text` (or be empty)** — #138 is the open AA-toggle variant.

## Logs / Debugging
- **Build:** `npm run build` = `vite build` + `electron-builder`. Renderer ~12s; full installer a few minutes. The `>500 kB chunk` Vite warning and electron-builder's "author is missed" / "@electron/rebuild not required" notices are all benign — ignore them.
- **No test runner installed** (jest/vitest absent; CRA-era leftover). Verify pure-function/model changes with a direct `node -e "require('./src/...')"` check.
- **Renderer changes need `npm run build:renderer` before `npm start`** — `npm start` loads from `build/`.
- **Prod log:** `%APPDATA%\clipflow\logs\app.log` (electron-log).
- **Stale-install gotcha:** the installed exe only carries fixes from the installer Fega last RAN. Source-only fixes (`build/` + `npm start`) don't reach the daily driver until a new installer is cut AND installed.
- **Issue hygiene:** reference issues in commits as `(#N)`, NOT `Fix #N` (auto-closes on push before verification). Close via `gh issue close --reason completed --comment …`.
