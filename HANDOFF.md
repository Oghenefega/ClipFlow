# HANDOFF — Session 171 (2026-08-18)

## Current State
App is **0.3.0-alpha.55** on the desktop daily driver, which got there **through the new auto-updater** — the real, network-based update loop shipped this session and was verified live (Fega installed alpha.54 by hand, the banner offered .55 from the feed, one click downloaded + silently reinstalled + relaunched). #250/#259/#54/#50 all closed verified. **The laptop clean-machine test (#146 arc) remains the open thread** — it now starts from alpha.54 on Google Drive and its first act doubles as the updater's second-machine proof.

## What Was Built
- **Auto-updater on R2 (9c02bb4):** `update:check`/`update:install` rewritten onto `electron-updater` 6.8.9 against a generic feed at `engine.flowve.app/updates/` (same `clipflow-engine` bucket as the AI engine, ratified R1 infrastructure). IPC names kept, so preload + `UpdateBanner` needed only additions: download-progress events (`update:progress`), a "Downloading X%" button state, an error state. Silent NSIS install + relaunch on update (`quitAndInstall(true, true)`); banner suppressed on dev profile and unpackaged runs.
- **electron-builder 24.13.3 → 26.15.3 (#54)** with a `publish` block — builds now emit the channel manifest. **Key discovery: prerelease versions derive an `alpha` channel, so the feed manifest is `alpha.yml`, NOT `latest.yml`** (packaged app agrees via its `app-update.yml`). v26 also keeps real filenames (spaces) in the manifest, unlike v24's dashed style.
- **`scripts/publish-update.ps1`:** uploads exe + blockmap + manifest (manifest LAST — a torn upload can't advertise a missing installer), then **prunes superseded versions from the feed** (1415fbc) so `updates/` stays ~200 MB forever instead of eating the 10 GB R2 free tier at ~200 MB/alpha. Bucket total: 3.3 GB (engines 3.1 + feed 0.2).
- **Two installers cut:** alpha.54 (first updater-capable build — manual-install starting point) and alpha.55 (identical twin on the feed — the update target). alpha.53 could never network-update: its handler scanned a hardcoded desktop path (#259, filed + fixed + closed this session).
- **`clipflow-update-launcher` skill rewritten:** "cut the installer" now = bump → changelog → build → publish feed → commit; Fega's only step is clicking Install in the banner. Stale "do NOT propose electron-updater" guidance removed.
- **dist/ cleaned:** 175 old version files deleted, 12 GB → 1.3 GB (~11 GB back on C:). Rollback stock kept: .53/.54/.55.

## Key Decisions
- **Code signing (#51) deliberately decoupled from the updater.** H4's "never ship unsigned" reasoning was about paying customers' install conversion — for Fega's own machines it's one SmartScreen click at manual install. #51 is now the **sole distribution gate before any non-Fega tester**. Dashboard H4/H7 entries updated in place (Section 9) — including the correction that hosting is R2/flowve.app, NOT clipflow.app (third-party domain, #255).
- **Feed reuses `engine.flowve.app`** rather than a new subdomain — proven infra, zero new setup; splitting later is a one-line URL change in `package.json` + rebuild.
- **Feed pruning keeps ONLY the current version.** Old feed files serve no one (manifest names only the newest; differential diffs against the CLIENT's cached installer, not the feed). Rollback = local dist/ or re-publishing from an older checkout.
- **First update on any machine is full-size (~190 MB); differential starts from its second update** (updater needs a cached installer to diff against — manual installs don't populate the cache).
- **#19** left open with a note: only its code-signing half (#51) remains; can close as consolidated whenever Fega agrees.

## Next Steps
1. **Laptop (Fega):** install alpha.54 from Drive (file `ClipFlow Setup 0.3.0-alpha.54.exe`, the stale .53 was trashed) → banner should offer .55 (updater proof on machine 2) → then the #146 checklist from session 170's handoff: onboarding, engine setup, first transcription, airplane-mode mid-download (#258's real confirmation), patience on "Checking everything works" (≤3 min normal).
2. On laptop success: close #256/#257/#258 and #146 (arc complete).
3. Backlog re-entry unchanged from s170: #254 (rejected-orb showcase) newest UI thread; rename-tab cluster (#173/#174/#175/#176) biggest untouched pile.

## Watch Out For
- **Every future release MUST run `scripts/publish-update.ps1` after `npm run build`** — a built-but-unpublished version leaves installed apps stale forever (no more local-dist fallback). The rewritten `clipflow-update-launcher` skill carries this; "cut the installer" triggers it.
- **If the `-alpha` suffix ever comes off the version**, the channel flips `alpha.yml` → `latest.yml` and already-installed alpha builds watch the OLD channel file — plan that transition deliberately (skill has a gotcha note).
- The updater cache lives in `%LOCALAPPDATA%\clipflow-updater` — wipe it if a machine ever needs a forced full re-download.
- `update:check` failures are silent by design (offline = no banner, warn-level log only). Don't mistake quiet for broken: `curl -s https://engine.flowve.app/updates/alpha.yml | head -1` is the 5-second feed sanity check.
- Old `#80 Stage 2` references in code comments/issues now describe a dead mechanism — the notifier's UI survived, its discovery source didn't.

## Logs/Debugging
- Updater activity logs to the standard app log (`%APPDATA%\clipflow\logs\app.log`): `update:check failed: <msg>` (warn) and `update:install failed: <msg>` (error) via the system module. electron-updater's own verbose log rides electron-log's main.log in the same folder.
- Headless verification pattern (reusable): launch `dist/win-unpacked/ClipFlow.exe` with `CLIPFLOW_PROFILE=dev --remote-debugging-port=9222`, then evaluate `window.clipflow.checkForUpdate()` over CDP — script at session-171 scratchpad `cdp-update-check.js`. Proved both feed directions live (available:false on current, available:true against a temporarily doctored manifest, restored + re-proven).
- Feed integrity checks used: manifest `curl`, exe `HEAD` (200, Content-Length matches manifest `size`, `Accept-Ranges: bytes`).
