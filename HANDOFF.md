# ClipFlow — Session Handoff
_Last updated: 2026-04-17 (session 15) — "watcher ownership + chokidar v4"_

---

## TL;DR

Shipped [#53](https://github.com/Oghenefega/ClipFlow/issues/53) (H6 chokidar v3→v4) plus a watcher subsystem cleanup that the upgrade depended on. Two commits on master.

Before chokidar's upgrade, the top of the pipeline depended on chokidar's `awaitWriteFinish` internal polling. A regression in that subsystem on any future chokidar bump would fire `add` mid-write, ffprobe would run on a still-growing file, auto-split detection would report the wrong duration, and the user would see the bug three pipeline stages downstream. **Session 15a moved write-stability detection into our own `waitForStable` helper** so this class of silent regression is now impossible across future chokidar upgrades. **Session 15b** then did the actual v3.6.0 → v4.0.3 bump with confidence.

Also renamed `createOBSWatcher` → `createRecordingFolderWatcher` and `RAW_OBS_PATTERN` → `RAW_RECORDING_PATTERN`. The watcher watches the folder OBS writes into; it does not talk to OBS. Old name caused confusion with the (dead) OBS log parser.

Current HEAD: **68bc74d**. OBS real-record smoke test confirmed by Fega — file appears on Rename tab ~1-2s after Stop, never during recording.

## 🎯 Next session — pick one (no blocker forces it)

1. **[#52](https://github.com/Oghenefega/ClipFlow/issues/52) electron-store v8 → v11 (H5).** The remaining half of the Split-A pair. This one is **structurally bigger**: electron-store v9+ is ESM-only and is `require()`'d from 4 files (main.js, token-store.js, publish-log.js, transcription-provider.js), all doing top-of-module sync `new Store(...)`. The upgrade means every site becomes `await import("electron-store")`, which in turn forces init sequencing to change (store becomes async-available instead of synchronous-available). Electron main is plain CJS — feasible, but touches app startup path. Also: electron-store holds the creator profile, watch folders, naming presets, token store — a broken migration loses user configuration. Needs explicit backup-and-verify pass. Budget one focused session.
2. **[#57](https://github.com/Oghenefega/ClipFlow/issues/57) editor perf — proper fix direction.** Component extraction per [#57 comment 4267674430](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4267674430): extract `<TimelinePlayhead />` + `<SegmentRow />` memo'd child. Fega's actual friction on long sources. Do **NOT** retry the store-derivation approach.
3. **[#59](https://github.com/Oghenefega/ClipFlow/issues/59) editor render without queuing.** Dedicated session, smaller scope.

If unsure: **#52 / H5** finishes the structural-deps arc and closes out the Split-A pair. Makes sense to do while the watcher/dep-upgrade muscle memory is fresh.

## 🚫 DO NOT touch next session (preserved)

- **Do NOT retry the [#57](https://github.com/Oghenefega/ClipFlow/issues/57) store-derivation approach** in any form. That layer is rejected — session 11 broke it twice.
- **Do NOT skip the zoom-slider repro on any future infra hop.** Standing go/no-go for Electron and build-tool changes.
- Do NOT touch H4 ([#50](https://github.com/Oghenefega/ClipFlow/issues/50)), H9 ([#56](https://github.com/Oghenefega/ClipFlow/issues/56)), or [#51](https://github.com/Oghenefega/ClipFlow/issues/51). All deferred per pre-beta priority framing.
- **chokidar 5.x is off-limits** until Electron bumps its bundled Node to ≥ 20.19. v5 requires Node 20.19+ and Electron 40 ships with Node 20.18.

## 📋 Infrastructure board state after this session

| Item | Issue | Status |
|---|---|---|
| **C1 Electron upgrade arc** | [#45](https://github.com/Oghenefega/ClipFlow/issues/45) | ✅ closed session 12 |
| **C2 Vite migration** | [#46](https://github.com/Oghenefega/ClipFlow/issues/46) | ✅ closed session 13 |
| **#58 File.path migration** | [#58](https://github.com/Oghenefega/ClipFlow/issues/58) | ✅ closed session 12 |
| **H8 @types/node pin** | [#55](https://github.com/Oghenefega/ClipFlow/issues/55) | ✅ closed session 12 |
| **#35 renderer crash** | [#35](https://github.com/Oghenefega/ClipFlow/issues/35) | ✅ closed session 10 |
| **#60 test-mode toggle** | [#60](https://github.com/Oghenefega/ClipFlow/issues/60) | ✅ closed session 14 |
| **H6 chokidar 3→4** | [#53](https://github.com/Oghenefega/ClipFlow/issues/53) | ✅ **closed this session** — dual-package means `require()` still works, 29 transitive deps dropped, write-stability owned by us now |
| **#57 editor perf on long source** | [#57](https://github.com/Oghenefega/ClipFlow/issues/57) | 🔲 UNRESOLVED — proper fix direction documented, deferred |
| **#59 editor render without queuing** | [#59](https://github.com/Oghenefega/ClipFlow/issues/59) | 🔲 dedicated session |
| **H5 electron-store 8→11** | [#52](https://github.com/Oghenefega/ClipFlow/issues/52) | 🔲 ready — recommended next |
| H1 subtitle overlay hardening | [#47](https://github.com/Oghenefega/ClipFlow/issues/47) | 🔲 ready |
| H3 sandbox flip | [#49](https://github.com/Oghenefega/ClipFlow/issues/49) | 🔲 ready |
| H2 CSP | [#48](https://github.com/Oghenefega/ClipFlow/issues/48) | 🔲 unblocked — nonce-based policy still needed |

## ✅ What was built this session

### Commits

- **112f2c4** — Session 15a: `waitForStable` helper in [src/main/main.js](src/main/main.js) replaces `awaitWriteFinish`. Polls `fs.statSync` every 1s; resolves when two consecutive reads return the same non-zero size (30-min ceiling). In-flight `Set` dedupes repeat `add` events; `unlink` cancels any pending check. `handleWatcherFileAdded` is now `async` and awaits stability before sending the IPC that creates a Rename card. Rename `createOBSWatcher` → `createRecordingFolderWatcher` and `RAW_OBS_PATTERN` → `RAW_RECORDING_PATTERN`.
- **68bc74d** — Session 15b: `chokidar` dep bump `^3.6.0` → `^4.0.3`. Dual-package so `require()` keeps working. Drops 29 transitive deps.

### Files touched

- [src/main/main.js](src/main/main.js) — watcher block (~100 lines of the ~50 original)
- [tasks/todo.md](tasks/todo.md) — updated the one `RAW_OBS_PATTERN` reference in the paused OBS-log-parser-removal plan
- [package.json](package.json), `package-lock.json` — chokidar bump

## 🔑 Key decisions this session

1. **Owned stability detection instead of trusting chokidar.** 10-line `waitForStable` in our own code is easier to reason about, testable with `dd`-style scripts (no OBS required), and version-independent. Every future chokidar bump becomes "run smoke test, ship," no deep read of chokidar internals required.
2. **chokidar 4, not 5.** chokidar 5.0 requires Node ≥ 20.19; Electron 40 ships Node 20.18. Revisit when Electron bumps Node.
3. **One commit for rename + waitForStable** instead of two. They're coupled — rename alone doesn't improve anything, waitForStable assumes the clearer naming. Bisect granularity isn't useful here because a failure in either change would require reading the whole watcher block.
4. **No `npm run dev` HMR check this session.** Main-process-only changes; Vite HMR doesn't touch main.js. `node --check` + synthetic smoke test + Fega's OBS real-record run covers the verification surface.

## ⚠️ Watch out for

- **`waitForStable` default is `intervalMs: 1000, requiredStableChecks: 2`** → minimum ~2s delay between OBS Stop and Rename card appearing. Matches the prior `awaitWriteFinish: { stabilityThreshold: 2000 }` behavior. If Fega wants faster card-appearance, drop `intervalMs` to 500ms (tested — works). If OBS starts writing files in a way that produces a legitimate size pause mid-recording, bump `requiredStableChecks` to 3. Both are knobs on the helper call, no structural change required.
- **`stabilityChecksInFlight` Set is module-level.** If the watcher itself is torn down and re-created (e.g. via `watcher:start` being called twice), the Set persists across instances. That's fine — in-flight checks are keyed by full absolute path, so a stale entry after a rapid restart would just suppress a redundant check for the same file. `unlink` clears entries, so any long-pending check for a deleted file gets its entry removed on the delete event even if the check is still running.
- **chokidar 4 dropped glob support** — not used by us (we pass plain folder paths), but any future change that tries to pass `"watch/**/*.mp4"` or similar will silently no-op. Stick with plain folder paths + `RAW_RECORDING_PATTERN` filtering.
- **Test coverage:** verification was standalone-smoke-test + user-driven real-record. No automated integration test exists. If we start getting these recurringly, worth writing a small electron-side harness.

## 🪵 Logs / Debugging

- **Electron main logs:** `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\logs\` — one file per module + `main.log`. `waitForStable` does NOT log by default (kept quiet to avoid noise on every OBS recording). If debugging a "file never appeared" case, the first thing to add is a `logger.info` at start and end of `handleWatcherFileAdded` in [src/main/main.js:~580](src/main/main.js) with `stableSize` and elapsed-ms.
- **If a Rename card appears DURING recording** (mid-write bug): `waitForStable` would have returned early — likely because the growing file had a size plateau OBS held for >2s (rare for .mp4 growth, but possible on slow disks mid-flush). Fix by bumping `requiredStableChecks` to 3 in the call site.
- **If a Rename card NEVER appears after Stop:** (a) check `logs\main.log` for watcher startup; (b) confirm `watchFolder` is set in Settings; (c) confirm the filename matches `RAW_RECORDING_PATTERN` regex — OBS profile that produces `Clip Name 2026-04-17 18-23-40.mp4` won't match (has a prefix). (d) `stabilityChecksInFlight` may be stuck — but `unlink` clears it, so this would only trip for files that are still growing past 30 minutes (the `maxWaitMs` ceiling).
- **chokidar 4 doesn't emit `ready` on empty folders the same way v3 did** — if you need a readiness signal, use `await w.ready` instead. We don't currently use it.

## 🔄 Build & verify

```bash
npm install                  # one-time to pick up chokidar 4
npm run build:renderer       # Vite build (~11s, 2728 modules, 1.85MB minified)
npm start                    # Launch Electron
```

Main-process changes (main.js watcher) require a full Electron quit + relaunch. Vite HMR doesn't help here.

**Standing verification matrix for any future watcher/chokidar work:**
1. OBS real-record for 30s, Stop — card appears on Rename tab ~1-2s later, not during recording.
2. OBS real-record for 30min+ (for #35 zoom-slider standing check).
3. Drop-to-Rename: drag `.mp4` from Downloads onto Rename tab → file appears.
4. Drop-to-Upload: drag `.mp4` onto Recordings tab → import-progress + quick-import modal fire.
5. Test watcher: with a `testWatchFolder` configured, OBS record into it → card appears under the test group.
