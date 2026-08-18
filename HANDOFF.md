# HANDOFF — Session 172 (2026-08-18)

## Current State
App is **0.3.0-alpha.56** everywhere via the auto-update loop, and **the laptop clean-machine install (#146 arc) is DONE**: Fega uninstalled the old copy, fresh-installed alpha.56 with the new directory-choice wizard, and pointed both the app and the AI engine at D: — the machine that was hard-blocked at "11 GB needed · 8.6 GB free" now installs cleanly. #260 and #261 closed **verified by Fega on the laptop**.

## What Was Built
- **Installer directory choice (#260, 579d71f):** `package.json` build config gained an `nsis` block (`oneClick: false`, `allowToChangeInstallationDirectory: true`) — the assisted wizard replaces the silent one-click install. Auto-updates still apply silently in place (electron-updater passes `/S`; NSIS honors it for assisted installers).
- **Engine install-location picker (#261, 579d71f):** new `engineRoot` setting (`""` = `userData\runtime`, in `STORE_DEFAULTS`); `setup-runtime.js` got `runtimeRoot(store)`, `setLocation()` (appends a "ClipFlow AI" subfolder, refuses mid-job, cleans a stranded old root only when no valid engine exists), and `freeDiskBytes(dir)` that walks up to the nearest existing ancestor so a not-yet-created custom root still measures the right drive. The speech model follows the engine drive (`hfHome` set to `<engineRoot>\hf_cache` after verify, only when hfHome was never set). New IPC `setup:chooseLocation` (dialog in main.js) → preload `setupChooseLocation` → "Install to" row + Change button in `EngineSetupView`.
- **Disk preflight corrected (#261):** `requiredFreeBytes()` = `max(download + unpacked, unpacked − zipOnDisk + modelReserve) + margin` — the old sum stacked the model on a zip that's deleted before the model phase, over-asking ~1.8 GB. Headline number is now **9.0 GB** (cuda), was 11.
- **Release alpha.56 (bf9d23e):** built, published to the feed (alpha.yml verified serving 0.3.0-alpha.56, alpha.55 pruned), pushed.

## Key Decisions
- **Engine location lives in the setup screen, not Settings** — it only matters before the engine exists; `whisperPythonPath` is stored absolute so nothing downstream ever resolves `engineRoot` again.
- **Picked folder gets a "ClipFlow AI" subfolder** (idempotent if the picked folder is already named that) so choosing a drive root stays tidy.
- **Existing model caches are never migrated** — `hfHome` is only set when previously unset; established caches (Fega's desktop D:\whisper) stay put.
- Issues filed with full root-cause bodies before implementation: [#260](https://github.com/Oghenefega/ClipFlow/issues/260), [#261](https://github.com/Oghenefega/ClipFlow/issues/261) (both now closed verified).

## Next Steps
1. **Confirm the laptop's engine download completed on D: and a transcription runs** — install-time UI is verified; the 2.9 GB download + model + first transcription on that machine is the remaining #146 proof.
2. #146 itself can likely close after that laptop pipeline run — it was the "packaged app has no engine on customer machines" epic.
3. Backlog per start-session ritual (#256/#257/#258 engine-setup polish items remain open).

## Watch Out For
- **The setup screen defaults "Install to" to C: even on machines that want D:** — deliberate (userData default); the user must hit Change. If Fega reports testers missing it, consider defaulting to the largest-free-space drive later.
- **Preflight assumes the model lands on the engine's drive.** True unless `hfHome` was already set to a different drive (only legacy machines) — edge accepted, documented in #261.
- **Assisted-installer updates:** electron-updater still installs silently, but a MANUAL run of any future installer now shows the wizard — that's the intended UX, don't "fix" it.
- **`Roaming*`-prefixed junk in `AppData\`**: if any flat files like `Roamingclipflow-dev…` ever appear, that's the bash backslash-mangling trap (gotcha 44 in the CDP memory) — inline `node -e` scripts must never carry Windows paths.

## Logs/Debugging
- **Verification artifacts (session scratchpad `bd9db023…`):** `engine-harness.js` (15 checks, real setup-runtime under `npx electron` + stub store — preflight math, D: measurement, setLocation edge cases), `cdp-check.js` (7 checks live on dev profile), `prep-dev-store.js`/`restore-dev-store.js` (dev-store swap done via script FILES, not inline bash).
- Dev profile was restored byte-for-byte after UI verification (real `whisperPythonPath` + tokens back; junk artifacts deleted).
- First `npm run build` failed with `EPERM rename win-unpacked.tmp` — transient Windows lock (likely Defender); fix is delete the `.tmp` and rerun. No code cause.
- The engine manifest at `engine.flowve.app/engine/manifest.json` is the source of truth for sizes: cuda 2.93 GB zip / 5.59 GB unpacked, cpu 0.43/1.86.
