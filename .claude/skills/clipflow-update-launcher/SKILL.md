---
name: clipflow-update-launcher
description: Use when Fega asks to "update the launcher", "update the ClipFlow prod app", "update the ClipFlow app", "update the installed/daily-driver app", "cut a new build", "cut/ship a new installer", "promote to prod", "bump and build", or "release the next version". This is the release loop — bump the version, build the installer, publish it to the R2 update feed, commit; every installed copy (desktop + laptop) then self-updates via the in-app banner. NOT for `npm run build` dev verification (that's the `build` skill) or for changelog-only updates (that's `release-notes`).
---

# ClipFlow — Update the Launcher (Release Loop)

## What this is for

Fega's **daily driver is the installed Start-Menu exe**, NOT the source build. Fixes land in
the source `build/` folder (via `npm run build:renderer` + `npm start`) but the *installed* app
stays on whatever version it last updated to — so it goes stale. "Update the launcher /
prod app / installed app" means: **cut a fresh versioned installer and publish it to the update
feed, so every installed copy catches up by itself.**

Since session 171 (alpha.54+) the **real auto-updater is live**: `electron-updater` against a
generic feed on the ClipFlow R2 bucket, `https://engine.flowve.app/updates/` (channel manifest
`alpha.yml` while versions are prereleases). Installed apps check on launch and offer a one-click
banner install. Code signing is still deferred (#51) — that's fine for Fega's machines and is the
sole distribution gate before non-Fega testers.

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
2. **ALWAYS tick the alpha counter. NEVER move the minor number on your own judgment**
   (session 129 — Fega reversed the session-103 delegation after two features in a row were
   cut as 0.4.0 and 0.5.0: "We're meant to stay on v3 until a very huge change worthy of going
   to v4 is made"). The default is the only default: `0.3.0-alpha.14` → `0.3.0-alpha.15` →
   `0.3.0-alpha.16`, forever, regardless of how big the feature is. The counter has no ceiling —
   `-alpha.40` is fine.
   - If a build genuinely feels milestone-sized, **propose** the minor bump in chat and wait for
     Fega to agree. Do not bump and explain afterwards.
   - Do not justify a bump in the changelog. If you're writing a paragraph arguing why the
     minor number should move, that's the tell it shouldn't.
3. **If Fega names an explicit version** ("update to 0.2.0", "ship 0.1.9"), that always wins.
4. **Keep `-alpha`** while the product is pre-launch / personal-testing. Only drop the suffix if
   Fega explicitly says so (it's a semantic signal toward release).

## The steps

1. **Bump `package.json`** version (line 3) — the only file to touch for the version.
2. **Add a CHANGELOG.md entry** at the top (above the newest existing entry). Match the existing
   `## [Unreleased] — YYYY-MM-DD (session N) — <summary>` format. One `### Changed` bullet noting
   the version bump and what the build promotes. To summarize what's shipping, look at
   `git log --oneline <last-version-bump-commit>..HEAD` — that range IS the answer. Do **not**
   take the list from a prior HANDOFF or from open `status: untested` issues: that label tracks
   whether Fega has confirmed a fix, not whether the code reached a build, and s219 shipped with a
   handoff claiming five issues when two had already gone out in the previous cut. An installer is a
   full build of master, never a delta — everything merged is in it. To test one specific fix, use
   `git merge-base --is-ancestor <commit> <bump-commit>`; to test whether Fega has RUN a version,
   read `lastSeenVersion` in `%APPDATA%\clipflow` settings (stamped only by `whatsnew:ack`).
   - **Also cut the What's New entry (#330):** in `src/main/release-notes.js`, rename the
     `"unreleased"` entry to the exact new version string and stamp its `date`. If the batch has
     no `"unreleased"` entry, write one now covering what's shipping. These lines are shown to
     USERS on their first launch after the update — plain product language ("The Tracker now
     shows the exact time you posted"), never commit-speak. An entry left as `"unreleased"` is
     never shown, so forgetting this step means a silent update. This file ships inside the build
     (`src/main/**`), so it must be right BEFORE step 3 — and it gets committed in step 6.
3. **Build** — run `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (= `vite build` then
   `electron-builder`; rebuilds the renderer fresh and packages the NSIS installer). Run it in the
   **FOREGROUND** with a 600000 ms timeout — it takes ~3-5 min, and nothing else can usefully
   proceed until it finishes. Backgrounding it loses the build if the session process exits (s219).
   - **The heap flag is required, not defensive.** Without it the build dies at the LAST step with
     `RangeError: Array buffer allocation failed` in `pe-library`/`addWinAsarIntegrity` —
     electron-builder rewrites the whole ~200 MB exe in memory to stamp asar integrity (s219).
   - **A clean `vite build` is not a successful build.** Packaging is a separate failure domain, and
     a failure there leaves `dist/` holding the PREVIOUS version's artifacts — which is exactly
     what step 4 exists to catch. Read the tail of the log for `building block map`, not just ✓ built.
   - The `>500 kB chunk` Vite warning is **benign** (desktop app, no code-splitting wanted). Don't "fix" it.
   - The electron-builder "author is missed" / "@electron/rebuild not required" warnings are cosmetic. Ignore.
4. **Verify the artifacts** — `dist/Corva Setup <version>.exe` (pre-rename builds: `ClipFlow Setup`), its `.blockmap`, and `dist/alpha.yml`
   all with fresh timestamps, and `alpha.yml`'s `version:` line reads the new version.
5. **Publish the feed** — `powershell -ExecutionPolicy Bypass -File scripts/publish-update.ps1`.
   Uploads exe + blockmap + manifest (manifest last, so a torn upload can't advertise a missing
   installer) and **prunes older versions from the feed** (R2 free-tier hygiene — the manifest only
   ever names the newest, so old feed files serve no one). Verify its final "Feed:" line, or
   `curl -s https://engine.flowve.app/updates/alpha.yml | head -1`.
6. **Commit ONLY `package.json` + `CHANGELOG.md`**, then push to master. See the hard rule below.
7. **Tell Fega to relaunch** (see "What Fega does" below).

## CRITICAL — what to commit

```bash
git add package.json CHANGELOG.md src/main/release-notes.js   # ONLY these three
git status --short                  # confirm data/ files are NOT staged
git commit -m "Bump version to <v> and cut installer to promote <what>"
git push origin master
```

**NEVER stage `data/clipflow.db` or `data/game_profiles.json`** — they are always dirty (runtime
churn) and must never be committed. Stage the two files explicitly; never `git add -A` / `git add .`.

## How the install actually reaches Fega

On launch, the installed app's `update:check` handler (`src/main/main.js`, ~line 4463, search
`Auto-update (#250`) asks the feed (`engine.flowve.app/updates/alpha.yml`) whether a newer version
exists. If so, the **"Update available"** banner renders; **Install** downloads with a live
percentage (`update:install` → `electron-updater.downloadUpdate()`), then silently reinstalls and
relaunches — no NSIS wizard. Works identically on the desktop and the laptop; no shared disk, no
manual copying.

- Any installed build ≥ alpha.54 has the network updater. (alpha.53 and earlier had a local-dist
  scanner that only worked on the desktop — #259; if a machine is somehow still that old, its first
  hop must be a manual installer run.)
- First update on a machine is always a **full-size** download; differential (blockmap) downloads
  start from the second, once the updater has a cached installer to diff against.
- Banner is suppressed on the dev profile and on unpackaged runs (`app.isPackaged` guard).

## What Fega does (tell him this)

> Relaunch ClipFlow → banner: "Update available — <version>" → click **Install** → it downloads,
> restarts itself on the new version. Real data in `%APPDATA%\clipflow\` is preserved.

After it relaunches, **Settings → bottom** reads **ClipFlow v<version>** — that confirms the
promotion took.

## Gotchas

- **`package.json` is the single source of truth for the version.** No hardcoded version in the renderer.
- **`npm run build` loads the renderer from `build/`**, but `build` rebuilds it fresh first, so there's
  no stale-renderer risk — never skip the full `npm run build` in favor of a partial step.
- **Sentry caches `userData` at require time** — unrelated to this loop, but don't reorder `main.js`
  top-of-file requires while here (see CLAUDE.md).
- This loop does NOT bump schema versions or run migrations — it's purely a packaging/version step.
- **The feed manifest is `alpha.yml`, not `latest.yml`** — electron-builder derives the channel from
  the prerelease tag (`0.3.0-alpha.N` → `alpha`). If the `-alpha` suffix ever comes off the version,
  the manifest becomes `latest.yml` and `publish-update.ps1` picks it up automatically — but installed
  alpha builds watch `alpha.yml`, so plan that transition deliberately (Fega's call anyway).
- **Old local installers in `dist/` are rollback stock** — keeping the last ~3 is plenty; older ones
  can be deleted freely (any version can be rebuilt from its git commit).
- **Taskbar shows the Electron atom / name "Electron" after an install?** Don't reach for cache-clearing
  first — check the authority chain: does any Start Menu .lnk carry the AUMID `com.clipflow.app`
  (read the .lnk bytes), and is the exe's ProductName right? electron-builder's shortcut does NOT stamp
  the AUMID; source-run boot-verifies claim the prod AUMID from electron.exe (#269 guards this).
  Deterministic fix: stamp System.AppUserModel.ID onto a per-user Start Menu shortcut (s175).
