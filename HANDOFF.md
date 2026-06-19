# ClipFlow — Session Handoff
_Last updated: 2026-06-18 — Session 86 — **Executed the approved Bucket A packaged-app remediation (4 fixes) and cut alpha.9; then Fega hit a Recordings-list sort regression during testing, root-caused it to a missed load-path sort, fixed it, and cut alpha.9.1. Bucket B (customer-machine portability) filed as launch-ops issues. alpha.9.1 is the install target — it carries BOTH the packaged-app subtitle/export fixes AND the sort fix.**_

---

## One-line TL;DR
Packaged app now exports clips WITH subtitles in the correct font (alpha.9 fixed the blank-subtitle + font + render-repair + icon bugs), and the Recordings list stays oldest-first after a reset (alpha.9.1). Install **0.1.8-alpha.9.1**. Next session: confirm Fega's in-app verification, close #144.

## Current State
On **0.1.8-alpha.9.1** in git (`aded2a3`, installer `dist/ClipFlow Setup 0.1.8-alpha.9.1.exe`, 121MB). All work committed + pushed. No schema change, no migrations this session. **Awaiting Fega's one reinstall + verification.** alpha.8 (blank subtitles) and alpha.9 (superseded by 9.1's sort fix) should NOT be installed — use 9.1. Working tree: usual runtime churn (`data/clipflow.db`, `data/game_profiles.json`) + untracked `tasks/mocks/` (this session's scratch: `diag_sort.js`, `bb*.md` issue bodies) + the `tasks/todo.md` ACTIVE-PLAN status edit.

## What Was Just Built (this session)
1. **Bucket A → alpha.9** (`7b122e5`) — the 4 packaged-app fixes from session 85's audit, batched into one installer:
   - **#1 CRITICAL** — `package.json build.files` now bundles `src/renderer/editor/utils/**` (excl `*.test.js`). The overlay preload's cross-tree `require()`s of `subtitleStyleEngine.js`+`findActiveWord.js` were absent from the asar → preload threw → overlay rendered BLANK subtitle/caption frames. Confirmed fixed via `npx asar list`.
   - **#2 HIGH** — fonts ship via `extraResources` `{from:"src/fonts",to:"fonts"}`; `subtitle-overlay-renderer.js` resolves `fontsPath` from `process.resourcesPath` when packaged (repo path from source). Burned-in subs now use Latina Essential, not sans-serif. Font-load failure now `console.error` (loud) via the offscreen console pipe.
   - **#8 MEDIUM** — `render.js` (batch/Queue render-from-disk) now routes subtitles through the SHARED `resolveClipSubtitles` (same as editor + preview) so word-repair (token-merge, dedup, timestamp-clean) is applied. Required converting `resolveSubtitles.js`, `cleanWordTimestamps.js`, `wordRepair.js` from ESM → **CJS** so the main process can `require()` them (renderer still imports them as named ESM bindings; Vite handles interop).
   - **#9 LOW** — main-window icon → `build/icon.png` (was unpackaged `public/icon.png`).
2. **Recordings sort regression → alpha.9.1** (`aded2a3`) — `resetFileDone` (`UploadView.js`) reloaded the list from the DB (`ORDER BY date DESC`) without re-applying `compareRecordings`, flipping the whole list to newest-first until restart. Added the sort (matches the 3 other load paths). Fega hit it because regenerating a clip (for the subtitle test) triggers the reset path.
3. **Bucket B filed** (customer-machine portability, NOT fixed — Fega's PC is fine): [#145](https://github.com/Oghenefega/ClipFlow/issues/145) FFmpeg/FFprobe not bundled, [#146](https://github.com/Oghenefega/ClipFlow/issues/146) Python/Whisper runtime not bundled, [#147](https://github.com/Oghenefega/ClipFlow/issues/147) hfHome hardcoded `D:\whisper\hf_cache`; [#68](https://github.com/Oghenefega/ClipFlow/issues/68) commented + tagged `track: launch-ops`. All parked under `track: launch-ops`.
4. **Lesson distilled** — "a list-reload path must re-apply the canonical sort (DB ORDER BY ≠ UI order; every `setX(rows)` reload must satisfy the invariant)" → `clipflow-code-review` (No Regressions).

## Key Decisions
- **Did all 4 Bucket A fixes in one installer, including #8 (the ESM/CJS one), to honor Fega's "stop the install-and-discover loop" goal.** The plan assumed #8 was "just add editor/utils to build.files" but render.js (CJS) can't `require()` the ESM resolver — so I converted the 3 utils to CJS. Safe because named-import-from-CJS is already proven here (`subtitleStyleEngine`/`findActiveWord` are CJS, imported by `PreviewOverlays.js`). Verified with `build:renderer` (2741 modules clean) + `npx asar list`.
- **#8 makes render == editor == preview for subtitles** — the render path now uses the same single source of truth (`resolveClipSubtitles`), permanently killing a divergence vector. Incidentally hardened the editor-saved render path (resolver normalizes display-string startSec that old render.js would've NaN'd).
- **Recordings sort fixed surgically** (one line, matching the existing per-load-path pattern + the #126 "single source of truth" comment intent) rather than re-architecting to a display-layer sort. The display-layer option is the bulletproof alternative if this class recurs.
- **Bucket B parked, not fixed** — per `feedback_prebeta_priorities`, ffmpeg/python/hfHome only break OTHER machines; Fega's has them. Launch-hardening, not his-testing-blocker.
- **Diagnosed the sort bug empirically before touching code** — queried the actual installed DB with sql.js and proved `compareRecordings` produces correct ascending order on real data, so the cause had to be a bypassing path, not the comparator (and not my session-86 changes, which never touched that screen).

## Next Steps (prioritized)
1. **Fega installs alpha.9.1 + runs the combined verification** (one pass):
   - Recordings list = oldest-at-top (Day7 first); reset a "done" recording → list STAYS oldest-first (the 9.1 fix).
   - Generate a clip → open (subtitles show, #144) → **EXPORT** → open the `.mp4` → subtitles present AND in Latina Essential (the alpha.9 fix).
   - On confirmation: close **#144** + note Bucket A resolved.
2. **If the Recordings list is STILL upside-down on a FRESH open** (before any reset) after 9.1 → there's a second cause (initial-load or a stale bundle); investigate `loadFiles`/the built bundle. (Unlikely — node + asar both verified.)
3. **Still-pending verification pile** (shipped source-only earlier, never confirmed on the installed app): #140 cancel-render, #137 timeline split, #138 ALL-CAPS, #99 style-bleed — roll into the 9.1 pass.
4. **Future audits** (untouched coverage gaps): publish/OAuth flows (the big works-on-dev-only risk), packaged smoke-test of `tools/signals/*`, electron-store migration on UPGRADE of a real installed profile, fresh-clip divergence beyond subtitles (captions/titles/thumbnails).

## Watch Out For
- **Install alpha.9.1, not alpha.8/alpha.9.** alpha.8 exports blank subtitles; alpha.9 lacks the sort fix. The in-app notifier picks newest by mtime → 9.1 surfaces correctly.
- **The 3 shared utils are now CJS** (`resolveSubtitles`, `cleanWordTimestamps`, `wordRepair` use `module.exports`). Do NOT re-add `export`/`import` keywords to them — the main-process `require()` in render.js would break, and the asar bundle relies on them being requireable. Renderer imports them as named ESM (Vite interop). Cross-tree-requires note in CLAUDE.md updated to reflect this.
- **`npx asar list` prints Windows BACKSLASH paths** — grep `editor\utils` (or dump to a file + grep `utils`), not `editor/utils`, or you'll get a false "missing" (cost me a verification round this session).
- **`package.json` silent-strip gotcha** ([[project_package_json_strip]]) — if builds break for no reason, check it's 99 lines (`wc -l package.json`) and `git checkout HEAD -- package.json`.
- **`data/clipflow.db` + `data/game_profiles.json` always dirty — never commit.** Stage files explicitly; never `git add -A`. `tasks/mocks/` is untracked scratch.

## Logs / Debugging
- **Sort-diagnosis technique (reusable, saved):** `tasks/mocks/diag_sort.js` reads the INSTALLED DB (`%APPDATA%\clipflow\data\clipflow.db`) via sql.js, runs the `allRenamed` query + `compareRecordings`, and prints both the raw SQL order and the sorted order. This is how I proved the comparator was correct and the bug was a bypassing load path. Reuse it whenever "the list/order looks wrong" — verify against REAL data, don't reason from code alone.
- **asar verification (definitive packaging check):** `npx asar list dist/win-unpacked/resources/app.asar` for what shipped INSIDE the asar; `ls dist/win-unpacked/resources/fonts/` for `extraResources` OUTSIDE it. Confirmed `editor/utils/*` in asar + 8 `.otf` fonts in `resources/fonts/`.
- **Packaged overlay font failure** now logs as `[OverlayRenderer] Font load failed:` at ERROR level (was a swallowed warn) — surfaces in the main console via the offscreen-window `console-message` pipe (`subtitle-overlay-renderer.js:197`).
- **Pipeline logs:** `%APPDATA%\clipflow\processing\logs\<name>_<ts>.log` (per-video). **App log:** `%APPDATA%\clipflow\logs\app.log` (lifecycle/db/preview/waveform; NOT the AI pipeline). Bash tool is Git Bash — resolve `%APPDATA%` via `node -e "console.log(process.env.APPDATA)"`.
