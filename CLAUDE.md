# ClipFlow (now **Corva**) — Commercial Desktop App for Gaming Content Creators

**Product is named Corva (formerly ClipFlow, #268).** User-facing name, `productName`, installer, and window titles are Corva. Deliberately KEPT under the old name: `appId` `com.clipflow.app` (upgrade identity — never change), `window.clipflow` bridge, `.clipflow` project dotfolder, store filenames (`clipflow-settings/-tokens/-publish-log`, `clipflow.db`), `CLIPFLOW_PROFILE` env var, "ClipFlow Imports" folder, `clipflow_*` PostHog events, persisted `source: "clipflow"` tracker value, Cloudflare internals. The GitHub repo and the Google developer app still say ClipFlow; renaming them waits on a pending trademark opinion. The Meta and TikTok developer apps are named Corva (exceptions, not a lifting of that gate); the TikTok name ships with the `video.list` revision (#388) while the live version keeps publishing, so check the TikTok portal for that revision's state before any TikTok dev-app work. `%APPDATA%\clipflow` migrates to `%APPDATA%\Corva` on first boot via `src/main/user-data-migration.js`.

Electron + React desktop app for gaming/streaming content creators. Automates the full content pipeline: OBS recording → file rename → local clip generation (FFmpeg + Whisper) → editor (subtitles, captions, AI titles) → render → schedule & publish to multiple social platforms.

## Product Context

ClipFlow is a **commercial software product** being built for public release with a subscription/lifetime license model. Currently in personal testing phase (Fega is the sole tester), but all architecture decisions should be made with a multi-user, paid product in mind. This is not a personal tool — it is a business.

- Target market: gaming and streaming content creators
- Revenue model: subscription + optional lifetime upgrade
- Platform publishing: built for "publish on behalf of users" — each user connects their own social accounts via OAuth
- Platform scope: YouTube, TikTok, Instagram, Facebook, X (Twitter), Kick, and others added over time

## Technical Summary (External — Source of Truth)

The canonical technical summary lives at:
`C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\technical-summary.md`

**When generating or updating the technical summary, always write to that path. Single file, no version number. Overwrite it — git tracks history. Do not create versioned copies (v2, v3, etc.) in the local reference/ folder.**

Read it when you need full product context: stack, architecture, feature status, known issues.

## Infrastructure Dashboard (External, Filtered)

An external infrastructure dashboard lives at `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\infrastructure\ClipFlow Infrastructure.md`. **Most sessions will never need to load it.**

**Consult it only when the session's work directly touches infrastructure** — defined narrowly as: Electron/Chromium/Node version changes, build tool (CRA/Vite) changes, dependency version bumps, module system (CJS/ESM) changes, security posture (CSP, `contextIsolation`, `sandbox`, preload scripts), code signing, auto-updater, installer config, or external infrastructure (Cloudflare, Supabase, Railway, LemonSqueezy, Sentry, PostHog).

**Do NOT consult it for:** product features, new tabs, UI redesigns, platform integrations, pipeline changes, bug fixes, AI prompt changes, editor behavior changes, or anything that belongs on GitHub as a feature/bug issue. That's the vast majority of sessions.

When the dashboard IS relevant: read Section 9 ("Current decisions in flight") before proposing anything. Decisions recorded there are committed — follow them, don't re-litigate. If the work you're about to do invalidates a recorded decision (e.g., you discover a prior decision's assumption was wrong, or the fix needs to diverge), flag it explicitly in chat so the dashboard can be updated. Do not silently deviate.

## Interaction Shortcuts

When the user responds with "yes", "do it", "go", "proceed", or similar single-word confirmations — execute the last proposed plan immediately. No restatement, no recap, no asking for clarification. They've already approved it.

## Git Workflow

Commit and push directly to master. No PRs, no feature branches.

## Changelog

Every session's changes get `CHANGELOG.md` entries before the session's final commit, normally in the same commit as the work. Categorize entries under the current date using Added/Changed/Fixed/Removed. Each entry should be descriptive enough that someone reading the changelog understands the change without digging into code — 1-2 sentences per item. Not too terse, not a journal.

## Tech Stack

See the technical summary for current stack, versions, and dependencies:
`C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\technical-summary.md`

That file is the source of truth. Never hardcode versions here.

## Build & Run

Renderer is Vite. Commands:

```bash
npm install                  # Install deps
npm run build:renderer       # Build renderer → build/ (vite build)
npm start                    # Launch Electron from source (prod profile)
npm run dev                  # Vite + Electron from source (dev profile)
npm run build                # Build installer → dist/Corva Setup *.exe
npm run dev:seed             # Copy prod data → dev profile (--force to overwrite)
```

`isDev` in `src/main/main.js` is a hard-coded `false`, so Electron always loads the renderer from `build/` — including under `npm run dev`, which starts Vite on http://localhost:3000 but still shows the last `build:renderer` output in the Electron window.

**After a code change:** build and launch the app and see the change working before calling it done; a clean build alone doesn't show that. Launch the dev app with the committed harness in `scripts/dev/` (its `README.md` is the recipe: sandbox → launch → probe/screenshot → kill → restore). `npm start` exits 0 at once while the installed Corva is running (same profile, single-instance lock).

**Only the installed app auto-publishes (#376).** The publish scheduler refuses to start on any
source run — `npm start` included — and on the dev profile. So the verification step above cannot
fire a scheduled clip at your accounts. The tradeoff is
deliberate: running prod from source will **not** post scheduled clips. Overrides exist for a
deliberate test (`CLIPFLOW_ALLOW_SOURCE_PUBLISH=1`, `CLIPFLOW_ALLOW_DEV_PUBLISH=1`); neither can
trigger by accident. A manual "Post now" in the UI is unaffected on every profile.

## Dev / Daily profile split (#80)

Two profiles via `CLIPFLOW_PROFILE` env var. Only userData (settings, tokens, DB) is separate: `dev:seed` copies prod's folder settings, so **the dev app reads and writes the REAL library** (projects, recordings, renders) until `node scripts/dev/dev-fixture.js setup` repoints it at a scratch copy.

| Profile | userData | DB | How to launch |
|---|---|---|---|
| **prod** (daily) | `%APPDATA%\Corva\` (a legacy `%APPDATA%\clipflow\` is renamed into place on first boot, #268/#288) | `<userData>\data\clipflow.db` (packaged) or `<repo>/data/` (source) | Start Menu (installed exe) or `npm start` |
| **dev** | `%APPDATA%\clipflow-dev\` | `%APPDATA%\clipflow-dev\data\clipflow.db` | `npm run dev` |

The daily-driver is the **installed exe** (`C:\Program Files\Corva\Corva.exe`) from `npm run build` + `dist/Corva Setup *.exe`. Source-running prod via `npm start` exists as a backup but is not the daily path — and since #376 it does not auto-publish, so it is a viewing/verification backup, not a substitute for the installed app on a day with scheduled clips.

**Promotion loop (live auto-updater):** use the `clipflow-update-launcher` skill — bump the version, `npm run build`, publish installer + manifest to the R2 update feed (`https://engine.flowve.app/updates/`), commit `package.json`, `CHANGELOG.md` and `src/main/release-notes.js` only. Every installed copy (desktop + laptop) then offers a one-click "Update available" banner on next launch; real data in `%APPDATA%\Corva\` is preserved. Don't cut an installer per fix — batch ~10 changes or wait for an explicit ask.

**Sentry** caches `userData` at `require()` time (getsentry/sentry-electron#796) — `app.setPath('userData')` MUST happen at the top of `main.js` BEFORE `require('@sentry/electron/main')`. Don't reorder.

**Cross-tree requires:** main-process files (`render.js`, `ai-pipeline.js`, `subtitle-overlay-preload.js` and others) require shared files from `src/renderer/editor/models/` and `src/renderer/editor/utils/`. Both folders are bundled via `package.json` `build.files` — adding a cross-tree import into any OTHER renderer folder requires adding that folder to `build.files` or the packaged exe crashes at startup. Shared files that main requires use CJS `module.exports`; renderer code imports them as named ESM bindings (Vite handles the interop). Verify what actually shipped with `npx asar list dist/win-unpacked/resources/app.asar`, not `build.files` globs.

## Where things live

**Code map:** `.claude/docs/nav-map.md` (generated by `node scripts/dev/nav-map.js`). Grep it, don't read it whole. It has every source file with its one-line summary, the giant files (`main.js`, `QueueView.js`, `ProjectsView.js`, …) section by section, and every `window.clipflow` method → IPC channel → handler file.

| What | Where (prod; dev = same names under `%APPDATA%\clipflow-dev\`) |
|---|---|
| Settings (every `store.get` key: `projectsRoot`, `gamesDb`, `trackerData`, …) | `%APPDATA%\Corva\clipflow-settings.json` |
| OAuth tokens | `%APPDATA%\Corva\clipflow-tokens.json` (encrypted per profile) |
| Publish results and errors | `%APPDATA%\Corva\clipflow-publish-log.json` (never in app.log) |
| App log | `%APPDATA%\Corva\logs\app.log` |
| Pipeline runs: logs with API cost, exact detection prompts, frames, transcripts | `%APPDATA%\Corva\processing\` (`logs\`, `claude\<video>.system_prompt.txt`, …) |
| Database | `%APPDATA%\Corva\data\clipflow.db`. The repo's `data/clipflow.db` is stale. Copy it before reading (the app holds it open); read with Python `sqlite3` or `node:sqlite` (no sqlite package in the repo). |
| Projects | `<projectsRoot>\.clipflow\projects\proj_*\project.json`. `projectsRoot` is its own setting (`W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards`), NOT `watchFolder`; resolved in `libraryRoot()` in `main.js`. Close the app before any script writes one. |
| Recordings / renders | `watchFolder` (`W:\…\Recordings\YYYY-MM`) / `outputFolder`; test-mode projects render under `testWatchFolder` |
| FFmpeg / ffprobe | resolved by `src/main/app-paths.js`: `vendor/ffmpeg/*.exe` from source (git-ignored, fetched by `scripts/fetch-ffmpeg.ps1`), `resources/ffmpeg/` when packaged, PATH as fallback |
| What's New lines | the top `version: "unreleased"` entry of `src/main/release-notes.js` (session-end step 3) |

## Shell and file rules (Windows)

- **Bash eats one level of backslashes, and expands backticks and `$` in double quotes.** Anything with Windows paths, regexes or backticks goes in a `.js`/`.py` file (Write it, then run it). Pass node forward-slash paths (`C:/Users/...`). Never `node -e` with a backslash.
- **Line endings don't need checking.** Git stores every file as LF (`core.autocrlf=true`, no `.gitattributes`). About 125 working-tree files are CRLF, and that never reaches a commit. The Edit tool handles both. A scripted string-replace must normalize first (`s.replace(/\r\n/g, "\n")`) or it finds 0 matches.
- Python: set `PYTHONIOENCODING=utf-8`, or printing non-ASCII crashes on the cp1252 console.
- `rm -rf` is usually refused. Leave throwaway files in the session scratchpad.
- Foreground `sleep` is blocked: wait with Monitor and an until-loop.
- `.claude/hooks/check-wrap-changelog.js` blocks any `git commit` command containing "wrap" unless CHANGELOG.md changed. Reword it ("close-out").
- The Browser pane can't act on `file://` pages. Open HTML mockups with `Start-Process`.
- Stop the source-run app with `node scripts/dev/dev-kill.js`. Never `taskkill //IM`: it also kills `Corva.exe` (the daily driver) or DaVinci's `electron.exe`.

## Coding Conventions

- React functional components with hooks
- **Existing views:** Inline styles via `T` (theme) object from `src/renderer/styles/theme.js`
- **Editor UI:** shadcn/ui + Tailwind CSS utility classes
- IPC through `window.clipflow` bridge (see `src/main/preload.js` for full API)
- File paths use Windows backslashes internally
- PascalCase components, camelCase functions
- App state: useState/useEffect in App.js, passed as props
- Editor state: Zustand stores with selector subscriptions (never `getState()` in render paths)

## Key Design Decisions

1. Files are NEVER auto-renamed — user must review and click Rename
2. Close = quit **by default**. With Settings → Publishing → "Keep publishing while I
   stream" turned ON, closing the window destroys the renderer and leaves the main
   process resident with a tray icon, so the publish scheduler keeps its slots; "Quit
   Corva" on the tray is then the only full exit. The setting is OFF by default.
3. Windows-only (NTFS paths, Windows file behavior)
4. Fully local pipeline — no cloud deps except Anthropic API for AI generation
5. Checkbox component is purely visual — parent handles clicks (prevents double-toggle)
6. Queue scheduling is manual — no auto-slotting into template
7. Editor state isolated in 6 Zustand stores with selector subscriptions

## GitHub

- Repo: https://github.com/Oghenefega/ClipFlow.git
- Branch: master (private)
- Token: `C:\Users\IAmAbsolute\.claude\github_token.txt` — read this file to authenticate `gh` / GitHub API calls

## Autonomous Issue Filing

Issues are filed and closed autonomously via `gh` — never ask permission, never output PowerShell for the user to run. Always include `--repo Oghenefega/ClipFlow`.

- **File** when something surfaces that's not fixable inline in ≤60 seconds — keep working on the current task and file in parallel.
- **Close** when the user confirms resolution ("that works", "fixed", "all good") and a filed issue clearly matches the work just completed.
- **"Start session" trigger:** when the user says "start session", "let's pick up", "resume", "begin" — run the full session-start ritual including the open **code backlog** (`gh issue list --repo Oghenefega/ClipFlow --search 'is:open -label:"track: launch-ops"' --limit 50`) grouped by label. Launch/infra/business-setup work is parked under `track: launch-ops` and excluded by default — surface it only as a one-line hidden count (reveal on request). See the doc for both commands.

**Full procedure** (when to file, body requirements, label list, close trigger details, command style): [`.claude/docs/issue-filing.md`](.claude/docs/issue-filing.md). Read it before filing, closing, or running the start-session issue list.
