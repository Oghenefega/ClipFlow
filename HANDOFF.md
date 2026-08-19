# HANDOFF — Session 175 (2026-08-19)

## Current State
**The product is Corva.** 0.3.0-alpha.60 is installed and verified on Fega's desktop (in-place upgrade over ClipFlow: full tracker history/XP/rank/streak, all projects, all platform connections intact) and published to the live update feed — the laptop self-updates on next launch and runs the same data migration. #268 closed verified. Steps 1–3 of the rename brief are DONE; Step 4 (external names) stays gated on the trademark opinion. The previously-pending #264/#267 work also shipped inside alpha.60 (it was on master), so those four `status: untested` closures are now installable for Fega's in-app pass.

## What Was Just Built
- **Corva rename Step 1 (inventory)**: 1,455 hits classified into 3 buckets; approved by Fega. Key discoveries: persisted `source:"clipflow"` tracker value (find-replace trap), `clipflow-tokens.json` as load-bearing as trackerData, the `.clipflow` tree on the video drive is a second data root, OAuth redirect URIs are all localhost (zero name coupling).
- **Step 3 (58ceefe)**: `productName`/`name` → Corva/corva; `appId` kept `com.clipflow.app` (NSIS GUID = upgrade identity); new `src/main/user-data-migration.js` — atomic `%APPDATA%\clipflow` → `%APPDATA%\Corva` rename at top of main.js (before Sentry require + single-instance lock), falls back to old folder on any failure, 16 unit checks; 51 display strings across 25 files → Corva; top-level `productName` added so packaged userData resolves proper-case.
- **Kept by design**: `window.clipflow` bridge, `.clipflow` dotfolder, store filenames, `CLIPFLOW_PROFILE`/`clipflow-dev`, "ClipFlow Imports" folder, `clipflow_*` PostHog events, `clipflow-runtime` R2 contract. "Corva AI" for new engine-setup picks (old "ClipFlow AI" recognized).
- **Released**: `Corva Setup 0.3.0-alpha.60.exe` published to `engine.flowve.app/updates/` (alpha.yml verified live, alpha.59 pruned).
- **Post-install fixes**: install went per-machine (`C:\Program Files\Corva`, old per-user copy cleanly removed). Taskbar showed "Electron" — root cause: no shortcut carried the AUMID + dev boot-verify had claimed it; fixed by stamping `System.AppUserModel.ID` onto a per-user Start Menu shortcut + icon-cache purge (verified fixed). Filed **#269** (guard `setAppUserModelId` with `app.isPackaged`) for the next batch.

## Key Decisions
- **appId/AppUserModelID never change** — it's what made the renamed installer upgrade in place. Treat as immutable.
- **Migration is rename-not-copy** (atomic on NTFS, no partial state) and **never boots against empty userData** while real data exists — split-brain prefers the newer Corva folder, locked/stray states fall back to old.
- **Internal identifiers keep the clipflow name** — invisible to users, and renaming them is pure risk (the `source:"clipflow"` value especially: display label maps to Corva, stored value untouched).
- **Recap watermark now "Corva"** — supersedes the old ClipFlow-vs-Flowve decision; Fega saw the build and confirmed all good.

## Next Steps
1. **Laptop**: launch ClipFlow there → banner → alpha.60 → confirm it comes up as Corva with its data intact. Until then, keep the desktop backup at `%APPDATA%\clipflow-backup-2026-08-19` (149 MB); delete after.
2. Fega's in-app pass on the #264/#267 closures (now installed via alpha.60) — remove `status: untested` labels on confirmation.
3. Next batch: #269 (AUMID guard) + remove the extra per-user Corva.lnk once the installer stamps identity properly; #263/#265/#266 feature work.
4. **Step 4 externals when the trademark opinion lands** (Fega's gate): GitHub repo, Meta/Google app display names, corva.gg switchover — one platform at a time; **TikTok dev app (7620331243271407632) frozen mid-review, moves LAST**.
5. Obsidian technical summary still says ClipFlow throughout — refresh it (single file, overwrite) in a docs pass.
6. Session-start backlog: `gh issue list --repo Oghenefega/ClipFlow --search 'is:open -label:"track: launch-ops"' --limit 50`.

## Watch Out For
- **Don't boot prod from source on a machine that hasn't migrated yet** — `npm start` runs the migration and strands any still-installed ClipFlow. Desktop already migrated (safe there now); the laptop until it self-updates.
- **seed-dev-profile** now prefers `%APPDATA%\Corva`, falls back to legacy clipflow — fine on both machines.
- **`Get-ItemProperty HKCU:...Uninstall`** still shows a stale "ClipFlow 0.3.0-alpha.48" per-user entry (the new install registers per-machine under HKLM); harmless, but don't let it mislead a future "what's installed" check — the truth is `C:\Program Files\Corva`.
- **Memory `project_db_locations_verification` updated**: prod DB is now `%APPDATA%\Corva\data\clipflow.db`.
- **The update feed serves Corva-named artifacts from alpha.60 on** — publish-update.ps1 reads the exe name from the manifest, nothing hardcoded, but any tooling that globbed `ClipFlow Setup*` must use `Corva Setup*` now (update-launcher skill already updated).
- Session-174 watch-outs still apply to the newly-installed #264 split behavior (migration v9 ALTER ran on first alpha.60 boot; watcher DB-path guard makes re-dropped known files invisible to Pending).

## Logs/Debugging
- Migration outcome is logged on prod boots: `Corva userData migration (#268): migrated|use-old` (module `system`, `%APPDATA%\Corva\logs\app.log`). `noop` boots log nothing.
- Migration unit test: this session's scratchpad `test-user-data-migration.js` (6 cases, real temp dirs, injected-fs failure case). AUMID stamper: `stamp-aumid.ps1` (per-user lnk needs no elevation; ProgramData lnk does).
- To check a .lnk's identity tag: read bytes, UTF-16 search for `com.clipflow.app`. Exe identity: `(Get-Item ...\Corva.exe).VersionInfo` → ProductName "Corva".
- Publish verification: `curl -s https://engine.flowve.app/updates/alpha.yml | head -1` → `version: 0.3.0-alpha.60`.
