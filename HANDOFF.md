# ClipFlow — Session Handoff
_Last updated: 2026-06-09 — Session 78 — **Two things: (1) shipped 0.1.7-alpha to the daily driver, (2) traced + parked the APPROVED TikTok audit Round 2 plan — that plan is the next session's headline work.** Cut a fresh installer carrying session 77's karaoke fixes (Fega installed it, confirmed), codified the promotion loop into a `clipflow-update-launcher` skill, then spent the back half investigating the TikTok resubmission blocker and writing an approved, fully-traced implementation plan (parked in [`tasks/todo.md`](tasks/todo.md) ACTIVE PLAN). No code written for TikTok yet — deferred at ~200k tokens._

---

## One-line TL;DR
Two-part session. (1) Maintenance: `0.1.6-alpha → 0.1.7-alpha`, fresh installer cut + Fega installed it, new `clipflow-update-launcher` skill. (2) Planning: the TikTok Content Posting audit Round 2 fix was investigated and an APPROVED implementation plan parked in `tasks/todo.md` ACTIVE PLAN — **next session codes it.** No schema change (still v4).

## Current State
Healthy on **0.1.7-alpha**, schema **v4** (unchanged, no migrations). The installed Start-Menu app now carries the session-77 fixes — the first promoted build that has them (the prior `dist` installer was the Jun-5 `0.1.6-alpha`, pre-session-77). 4 commits pushed this session (`c3fee47` version+changelog, `4ee8fdf` skill, `74ef69d` mid-session wrap, `6f1a22f` TikTok plan) plus this handoff commit. Working tree has ONLY runtime churn (`data/clipflow.db`, `data/game_profiles.json`) — never commit those. **Code backlog: 30 open** (unchanged; 12 launch-ops parked/hidden). The TikTok Round 2 work is NOT a backlog issue — it's the spec at `tasks/specs/tiktok-content-posting-audit.md`.

## What Was Just Built
1. **Version bump `0.1.6-alpha` → `0.1.7-alpha`** (`c3fee47`) — `package.json` line 3 only. The renderer reads the version live via `app.getVersion()` (Settings → bottom), so there is no hardcoded version string in the UI. CHANGELOG session-78 entry added.
2. **Fresh installer** — `npm run build` produced `dist/ClipFlow Setup 0.1.7-alpha.exe` (118 MB, Electron 40.9.1, NSIS). First installer to carry session-77's 10-issue karaoke/subtitle sweep. Fega installed it through the in-app **Install update** banner and confirmed ("I just updated it. great!").
3. **`clipflow-update-launcher` skill** (`4ee8fdf`, `.claude/skills/clipflow-update-launcher/SKILL.md`) — codifies the Stage-1 promotion loop. Triggers on "update the launcher / prod app / installed app / cut a new build / promote to prod". Default: bump patch + keep `-alpha`; build; commit ONLY `package.json` + `CHANGELOG.md` (never `data/` churn); tell Fega to reinstall via banner or double-click.
4. **TikTok audit Round 2 plan — investigated + parked, NOT coded** (`6f1a22f`, [`tasks/todo.md`](tasks/todo.md) ACTIVE PLAN). Approved by Fega. Three renderer-only `QueueView.js` fixes for the resubmission blocker (audit DENIED 2026-06-03 on Point 5d + panel order). **Key finding:** the A9 "may take a few minutes" notice already exists at `QueueView.js:1646` but is dead — gated on TikTok status `"done"`, which only fires *after* `pollPublishStatus` completes; during the "Processing on TikTok…" window the recording captures, it's absent. Plan covers: A9 trigger broadened to publishing-or-done + made visibly prominent; Music Usage moved above Commercial Disclosure; A8 done as a publish-time over-limit message (creator_info has NO pre-flight capacity flag — verified, decided). No schema bump. Then cut 0.1.8-alpha for re-recording.

## Key Decisions
- **Kept the `-alpha` suffix** (`0.1.7-alpha`, not `0.1.7`) — product is still pre-launch / personal-testing, so the alpha track is the honest label. Fega chose this when asked; the skill's default preserves it.
- **Default bump = next patch, keep suffix.** Encoded in the skill. An explicit version overrides it ("update to 0.2.0").
- **Old installers in `dist/` left in place** (8 now, ~940 MB). The update notifier only ever picks the newest by mtime, so they're harmless. Fega said leave them.
- **Did NOT touch the update-notifier code or electron-builder config** — used the existing Stage-2 local notifier (`main.js` ~2930) and installer config as-is. Full `electron-updater` + code signing remains deferred (infra dashboard H4); this loop is the interim manual-reinstall + local-notifier path.

## Next Steps (prioritized)
0. **🔴 TikTok audit Round 2 UI fixes — APPROVED, ready to code (full plan in [`tasks/todo.md`](tasks/todo.md) ACTIVE PLAN).** Resubmission blocker (first audit DENIED 2026-06-03 on Point 5d + panel order). Three renderer-only fixes in `QueueView.js`: A9 5d notice made visible during the "Processing on TikTok…" window (the message already exists at `QueueView.js:1646` but is dead — gated on status `"done"`, which only hits after the poll finishes), reorder Music Usage **above** Commercial Disclosure, and a publish-time over-limit message for A8 (creator_info has NO pre-flight capacity flag — decided). No schema bump. Then cut **0.1.8-alpha** for re-recording. Plan is fully traced — code straight from it, don't re-investigate.
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
