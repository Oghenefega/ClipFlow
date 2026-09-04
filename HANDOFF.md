# HANDOFF — Session 237 (2026-09-04)

## Current State

Fega handed the session over ("you're in charge, fix what doesn't need my input"). The whole open
backlog was read issue by issue. Most of it is shipped-awaiting-verification (#315/#318/#320/#321,
#301/#302/#284, #256–258, #319/#333/#334, the alpha.23 set) and was left alone. **Seven still-live
bugs were fixed, one per commit, all on master, not yet in an installer:**

| # | What | Verified how |
|---|---|---|
| #288 | Corva userData migration latched in `use-old` — a data-less `%APPDATA%\Corva` shell is now parked as `Corva.stray-<ts>` (never deleted) so the rename lands | 9 jest tests on real temp dirs |
| #289 | Re-tagging a clip re-stamps its feedback rows | dev profile: RL→JC→RL moved the row both ways, log lines, real project untouched |
| #303 | Recordings drop accepts `.mkv`, converts to real MP4 inside `import:externalFile`, refuses with a message | dev profile: h264+FLAC MKV → MP4, `.mkv` copy gone, nothing leaked into Rename; bogus file fails cleanly |
| #323 | Retry Failed also attempts platforms enabled after the failed run | logic only — first real partial failure is the proof |
| #307 | Timeline right-click Split hint reads the live binding (`U`, follows rebinds) | build + code (mirrors `disableKeyLabel`) |
| #304 | Dead `STAGE_LABELS` + orphaned `onSignalProgress` preload pair deleted | grep + build |
| #361 | `publish-runtime.ps1` Range verify retries then warns instead of throwing | next publish run |

#358 closed (done since 6469a22, proven by s236's desktop logs). jest 235 green (226 + 9), renderer
builds, dev-profile boot clean. Dev profile restored (watchFolder/projectsRoot back on W:, tokens `{}`).

## Key Decisions

- **#288 will fire on the desktop's first boot of the next installer**: `%APPDATA%\clipflow` →
  `%APPDATA%\Corva` in one atomic rename; the harness-written `Corva\logs\main.log` gets parked as
  `Corva.stray-…`. Settings hold no absolute path into the old folder (checked). After that boot,
  measure DB/logs/settings under `%APPDATA%\Corva`, not `clipflow`. Laptop: same.
- **#289 does NOT rewind `dayCount`** — that counter belongs to the recording (`file_metadata.tag`),
  and re-tagging a clip doesn't move the recording. Said so on the issue.
- **#303 converts inside the import (main), not on rename (renderer)** — the Rename tab keeps its
  #300 convert-on-rename flow untouched; only the Recordings drop passes `convertToMp4=true`.
  Suppression from the watcher is by name with `sizeBytes: null` until the remux ends.
- **#323 took option (a)** from the issue (retry attempts untried enabled platforms); the card
  derivation (b) was left alone since (a) closes the door.
- Not touched on purpose: #362 (needs the laptop's real full-pass time first), #360 (untested),
  everything already "left open pending verification".

## Next Steps

1. Batch is 7 fixes — cut alpha.24 when Fega says so (`clipflow-update-launcher`); the What's New
   entry in `release-notes.js` still needs these added under `unreleased`.
2. After the desktop boots alpha.24: `app.log` must show `Corva userData migration (#268): migrated
   {parked: ...Corva.stray-...}` and data under `%APPDATA%\Corva`. Then update the two memory files
   (`project_corva_rename`, `project_db_locations_verification`) and `scripts/seed-dev-profile.js`
   already prefers Corva.
3. Laptop check from s236 still pending (engine 1.1.0 upgrade + models + `median4`, full-pass time
   for #362).
4. Old backlog after that: #353 Batch B, #350, #287 (CaptionsView Add-description path).

## Watch Out For

- `git apply --cached` with a hunk-filtered patch (`scratchpad/hunks.js`) is how shared files were
  split into per-issue commits — the working tree keeps the rest; check `git status` after.
- Killing the dev electron from the Bash tool: single-slash `taskkill /F …` FAILS (Git Bash rewrites
  `/F` into the path `F:/`; memory trap 45). Use `taskkill //F //IM electron.exe` or
  `powershell -NoProfile -Command "Get-Process electron | Stop-Process -Force"`, then gate on
  `tasklist | grep -ci electron.exe` = 0.
- The dev DB is a prod copy; the #289 check moved a row and moved it back (byte-equivalent).
- `%APPDATA%\Corva\logs\main.log` on the desktop is a headless harness's electron-log output
  (Aug 30–31) — that is what #288's "stray shell" is on this machine.

## Logs/Debugging

- #289: `app.log` `(system) #289 taste rows re-tagged with the clip {"clipId","from","to","moved"}`
  — only logged when `moved > 0`; same-tag updates and clips without rows are silent.
- #303: `(video-processing) #303 converted import <raw>.mkv → <raw>.mp4[ (audio re-encoded to AAC)]`
  or `#303 import convert failed for <name>: <reason>`; renderer toast "Import failed: couldn't
  convert MKV to MP4 — …".
- #288: `(system) Corva userData migration (#268): migrated|use-old {"userData", "parked"?,
  "reason"?, "error"?}`.
- Dev boot with CDP: `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-features=CalculateNativeWinOcclusion`; `node scratchpad/cdp.js "<expr>"` evaluates in the
  renderer (Node 24 global WebSocket, no deps). Repoint dev `watchFolder`/`projectsRoot` at scratch
  fixtures BEFORE boot and restore from the backup AFTER the kill.
- jest: `npx jest` (235). Migration tests: `src/main/__tests__/userDataMigration.test.js`.
