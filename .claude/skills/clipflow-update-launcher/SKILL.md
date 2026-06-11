---
name: clipflow-update-launcher
description: Use when Fega asks to "update the launcher", "update the ClipFlow prod app", "update the ClipFlow app", "update the installed/daily-driver app", "cut a new build", "cut/ship a new installer", "promote to prod", "bump and build", or "release the next version". This is the Stage-1 promotion loop — bump the app to the next version, build the installer, commit, and tell Fega to reinstall. NOT for `npm run build` dev verification (that's the `build` skill) or for changelog-only updates (that's `release-notes`).
---

# ClipFlow — Update the Launcher (Stage-1 Promotion Loop)

## What this is for

Fega's **daily driver is the installed Start-Menu exe**, NOT the source build. Fixes land in
the source `build/` folder (via `npm run build:renderer` + `npm start`) but the *installed* app
stays on whatever version's installer he last ran — so it goes stale. "Update the launcher /
prod app / installed app" means: **cut a fresh versioned installer carrying the latest source,
so the daily driver catches up.**

This is the interim loop. The full auto-updater (`electron-updater`) + code signing is deferred
(infra dashboard H4) — do NOT propose `electron-updater` here.

## When NOT to cut one (session 81)

**Do NOT cut an installer as the automatic tail of every fix.** Fega: "don't create a new app
version until we've made like 10 upgrades to the app — we're not wasting time updating after every
minor update." Each installer is a ~2-min build + a reinstall on his side; per-fix builds waste both.
Default after a fix = `build:renderer` compile-check + commit/push source, then STOP. Only run THIS
skill when ~10 changes have accumulated OR Fega explicitly asks ("cut a build", "ship it", "update
the launcher"). This skill is the HOW; this gate is the WHEN. ([[feedback_batch_versions]])

## Version bump policy (default)

1. Read the current version from `package.json` line 3 (the ONLY place it lives — the renderer
   reads it live via `app.getVersion()`, there are no hardcoded version strings in the UI).
2. **Default: bump the patch, keep the existing pre-release suffix.** e.g. `0.1.7-alpha` → `0.1.8-alpha`.
3. **If Fega names an explicit version** ("update to 0.2.0", "ship 0.1.9"), use that instead.
4. **Keep `-alpha`** while the product is pre-launch / personal-testing. Only drop the suffix if
   Fega explicitly says so (it's a semantic signal toward release).

## The steps

1. **Bump `package.json`** version (line 3) — the only file to touch for the version.
2. **Add a CHANGELOG.md entry** at the top (above the newest existing entry). Match the existing
   `## [Unreleased] — YYYY-MM-DD (session N) — <summary>` format. One `### Changed` bullet noting
   the version bump and what the build promotes. To summarize what's shipping, look at
   `git log --oneline <last-version-bump-commit>..HEAD`.
3. **Build** — run `npm run build` (= `vite build` then `electron-builder`; rebuilds the renderer
   fresh and packages the NSIS installer). Run it in the **background** — it takes a few minutes.
   - The `>500 kB chunk` Vite warning is **benign** (desktop app, no code-splitting wanted). Don't "fix" it.
   - The electron-builder "author is missed" / "@electron/rebuild not required" warnings are cosmetic. Ignore.
4. **Verify the artifact** — confirm `dist/ClipFlow Setup <version>.exe` exists with a fresh timestamp
   (`ls -la --time-style=long-iso "dist/ClipFlow Setup <version>.exe"`).
5. **Commit ONLY `package.json` + `CHANGELOG.md`**, then push to master. See the hard rule below.
6. **Tell Fega to install** (see "What Fega does" below).

## CRITICAL — what to commit

```bash
git add package.json CHANGELOG.md   # ONLY these two
git status --short                  # confirm data/ files are NOT staged
git commit -m "Bump version to <v> and cut installer to promote <what>"
git push origin master
```

**NEVER stage `data/clipflow.db` or `data/game_profiles.json`** — they are always dirty (runtime
churn) and must never be committed. Stage the two files explicitly; never `git add -A` / `git add .`.

## How the install actually reaches Fega

The in-app **update notifier** (`src/main/main.js`, `update:check` handler ~line 2937) scans the
repo's `dist/` folder for `ClipFlow Setup *.exe`, sorts by newest mtime, and shows an in-app
**"Install update"** banner when that installer's filename version ≠ the running app version. So a
fresh build auto-surfaces in his installed app — no manual hunting. `update:install` (~line 2962)
spawns the installer and quits.

- The notifier shipped 2026-05-08 (session 35), so any installed build from after that date has it.
- Old installers in `dist/` are harmless — the notifier only ever uses the newest by mtime. Don't
  prune them unless Fega asks.

## What Fega does (tell him this)

> Open ClipFlow → click the **"Install update"** banner (it detects the new build), OR double-click
> `dist\ClipFlow Setup <version>.exe` directly. Real data in `%APPDATA%\clipflow\` is preserved either way.

After he reinstalls, **Settings → bottom** reads **ClipFlow v<version>** — that confirms the
promotion took.

## Gotchas

- **`package.json` is the single source of truth for the version.** No hardcoded version in the renderer.
- **`npm run build` loads the renderer from `build/`**, but `build` rebuilds it fresh first, so there's
  no stale-renderer risk — never skip the full `npm run build` in favor of a partial step.
- **Sentry caches `userData` at require time** — unrelated to this loop, but don't reorder `main.js`
  top-of-file requires while here (see CLAUDE.md).
- This loop does NOT bump schema versions or run migrations — it's purely a packaging/version step.
