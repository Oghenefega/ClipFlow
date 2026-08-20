# HANDOFF — Session 176 (2026-08-20)

## Current State
**#263 game auto-detection is built, E2E-verified, and on master (b725e37)** alongside the #269 taskbar-identity guard (2839dda). Neither is in an installer yet — they ride the next cut (batch rule; #266/#265 could join). Both issues closed with `status: untested` pending Fega's in-app pass. The Corva rename (#268) is fully wrapped: laptop confirmed alpha.60 with data intact, so the last migration gate is cleared. Fega declined deleting the desktop backup at `%APPDATA%\clipflow-backup-2026-08-19` (149 MB) for now — his call, leave it until he says otherwise.

## What Was Just Built
- **#263 tier 1 (foreground-majority process watch)**: new `src/main/game-detect.js`. While OBS writes a recording, the foreground process is sampled every 30s (PowerShell GetForegroundWindow via -EncodedCommand); a game claims the file only if its linked exe held >50% of samples. **Fega's requirement: background-running games must NOT win** (video-watching scenario). Only files observed *growing* during the stability watch count as live recordings — finished files (boot rescan, moved-in) discard samples and go cache → AI.
- **#263 tier 2 (Gemini frame sniff)**: game-only prompt (mirrors the §5 "THE GAME" contract), 3 stills at 640px via `extractClipStills`, gated on `geminiProvider.isConfigured()`, serialized one-at-a-time, cost-logged via PipelineLogger. Only high-confidence matches to tracked games pre-fill. Every result (incl. unknown) is cached in the new `detectedGames` store map — one AI call per file ever. A late result never overwrites a manual pick (`gameManual` flag set by setGameForRows).
- **Renderer routing**: detected > lastRenamedGame > mainGame in BOTH watcher handlers; drag-drop imports now get lastRenamedGame defaulting too (pre-existing #267 gap). New `gameDetect:result` push event (unsubscribe-fn preload variant) retags rows via detectForGame accounting.
- **Settings → Edit Game → "Linked Program"**: running-apps picker (`processes:list` IPC — first real consumer of `ignoredProcesses`). Fega's machines already carry exe data from the pre-#262 seeds, so detection works there out of the box; only fresh installs need the picker.
- **Eviction**: stamps cleared on rename commit (metadata:create), watcher unlink, and a boot sweep for paths gone from disk.
- **#269**: `setAppUserModelId` now packaged-only (two-line guard) — dev boot-verifies can't poison the installed app's taskbar identity again.
- **Filed #274**: record-time "was this <exe>?" teach flow (deferred from #263; AddGameModal's dormant exe branch is the ready-made UI).

## Key Decisions
- **Foreground-majority, not process-existence** — Fega explicitly rejected "game running in background wins" (session 176 chat). The >50% rule + grew-during-watch gate are the two halves of that decision; don't weaken either.
- **AI pre-fills on high confidence only**; low/unknown stays cached but untouched — a wrong default blindly confirmed poisons day counters.
- **detectedGames is main-process-owned** (renderer never loads/persists it) — safe for main-side writes, no gamesDb-style two-writer hazard.
- v1 teaching = the Settings picker; the record-time chip is #274, not scope creep on #263.

## Next Steps
1. Next code batch candidate: **#266** (silence-aware split boundaries) — fresh session. #265 (onboarding) after.
2. Cut alpha.61 when the batch feels full (#269 + #263 + whatever lands next session), then Fega's in-app passes: #263 (record with linked game in front → pre-filled row), #269 (taskbar still says Corva), plus the standing #264/#267 checks from session 174.
3. #274 whenever the new-user path matters (pre-launch, not urgent for Fega's own use).
4. Obsidian technical summary still says ClipFlow throughout — docs pass still pending (carried from s175).
5. Rename brief Step 4 (external names) still gated on the trademark opinion.

## Watch Out For
- **First boot of the updated app will frame-sniff any raw unrenamed recordings sitting in the watch tree** (no process context, no cache yet) — one Gemini call each (~<1¢, one-time, then cached). Expected behavior, not a bug; approved as decision (c).
- The sniff currently sends `gameDetect:result` only for high-confidence matches; the stamp keeps `aiGuess` for everything — #274 can surface those.
- `detectedGames` keys are exact-case absolute paths from the watcher — don't hand-edit with different casing.
- Content-type entries (Just Chatting) CAN be exe-linked via the modal and matched by tier 1 (deliberate — e.g. linking a browser to JC); tier 2's candidate list excludes them.
- Dev-profile settings were heavily edited during E2E and **fully restored** (watchFolder, gamesDb, stamps verified against the pre-test backup). Scratch test files remain only in the session scratchpad (rm -rf is permission-blocked; they're isolated temp).

## Logs/Debugging
- Detection logs under module `system` in app.log: `#263 process watch detected game {file, game, samples}` and `#263 frame sniff result {file, game, confidence, prefill}`. Sniff spend appears in Settings monthly cost (PipelineLogger label `game sniff <file>`).
- Stamps: `clipflow-settings.json` → `detectedGames` (dev: `%APPDATA%\clipflow-dev\`, prod: `%APPDATA%\Corva\`).
- Unit harness (9 checks: sampler race, majority rules, app-list filter): session scratchpad `test-game-detect.js`, run `npx electron <path>` from repo root. E2E pattern that works: chunked-append a probe mp4 into a scratch watch folder (simulates OBS growth — an instant `cp` fails the grew-gate by design); the dev app itself is the foreground during automated tests, so `electron.exe` in a probe game's exe net is the deterministic tier-1 trigger. Programmatic focus-stealing (AppActivate/TopMost forms) is blocked by Windows — don't retry it.
- CDP row check: `cdp-eval.js` in scratchpad (node ≥22 WebSocket, port 9222, climb ancestors from filename leaf).
