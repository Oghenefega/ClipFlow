# ClipFlow — Session Handoff
_Last updated: 2026-04-28 — Session 33 — Dead-code audit complete (3 passes). Tech summary refreshed. Codebase cleaner; no behavior change._

---

## One-line TL;DR

**Three-pass dead-code audit shipped.** ~2.5k lines deleted, ~190 added. 27 orphan IPC handlers + preload bridges, 8 orphan Zustand state fields/setters, 4 stale planning docs, 1 dead constant. Every deletion was statically verified (zero external references) AND validated by an automated Electron startup probe that watches `app.log` for `No handler registered`/`is not a function`/`TypeError`/etc. The investigation also rescued `audioSegments` from being wrongfully deleted (HANDOFF flagged it but `LeftPanelNew.js` still uses `rippleDeleteAudioSegment`). External technical summary at `Obsidian Vault\...\technical-summary.md` rewritten end-to-end to reflect 10 days of un-summarized changes (lazy-cut, NVENC, batched retranscribe, YAMNet, "Clip N" titles, subtitle timing rebuild, toolchain modernization).

---

## What just shipped (session 33)

### Pass 1 — Orphaned IPC handlers + preload bridges (commit `d7dbe8f`)

**Methodology that found them:** cross-referenced every `ipcMain.handle("...")` in [main.js](src/main/main.js) against every `ipcRenderer.invoke("...")` in [preload.js](src/main/preload.js) against every `window.clipflow.<method>` callsite — **324 callsites across 18 renderer files**, including [src/index.js](src/index.js) (entrypoint outside `src/renderer/`). Verified no destructuring (`const { foo } = window.clipflow`) or aliasing patterns exist anywhere. For ffmpeg/whisper/projects helpers, confirmed the underlying module functions are still called internally so dropping the IPC layer doesn't orphan the helpers.

**Removed (31 entries → 27 with handlers + 4 listener-only bridges):**
- **fs surface:** `readDir`, `readFile`, `writeFile`
- **Watcher events:** `onFileRemoved`, `onTestFileRemoved`, `stopTestWatching`
- **Shell + dialog:** `openFolder`, `saveFileDialog`
- **Legacy ffmpeg IPC:** `extractAudio`, `thumbnail`, `analyzeLoudness` (module functions kept)
- **Whisper renderer-call surface:** `whisper:transcribe` + progress listeners (whisper now main-only)
- **Project mutation:** `projectCreate`, `projectSave`, `projectAddClip`, `projectDeleteClip` (renderer keeps `updateClip`/`delete`/`updateTestMode`)
- **Misc:** `import:cancel`, `metadata:getById`, `preset:getAll`/`calculateDayNumber`/`extractDate`, `feedback:getApproved`/`getCounts`, `gameProfiles:getAll`, `publishLog:getForClip`, `folder:reorder`, `logs:getModules`/`getSessionLogs`/`getDir`
- **Dead `readFileBuffer` fallback** in `waveformUtils.js` — referenced but never exposed; the catch branch was unreachable

**274 deletions, 3 insertions.** Build passed clean (2728 modules, 11s). Startup probe clean.

### Pass 2 — Orphaned Zustand state fields + setters (commit `15faea9`)

**Methodology:** enumerated state + actions across all 6 editor stores; cross-referenced each against the rest of the editor codebase. For `audioSegments` specifically, verified the `_pushUndo`/`_restoreStyling` snapshot path captures via `CAP_KEYS` array — anything not in that list isn't restored on undo.

**Removed (3 fields + 5 setters + cleanup):**
- `useCaptionStore.captionStartSec` / `captionEndSec` + `setCaptionStartSec` / `setCaptionEndSec`. Header comment claimed these were "kept for undo snapshot compat" but they're NOT in `CAP_KEYS` and have zero external readers.
- `usePlaybackStore.trimIn` / `trimOut` + setters. Pre-NLE-segment surface, replaced by `nleSegments` after lazy-cut.
- `useLayoutStore.tlOverlay` + `setTlOverlay`. No consumer anywhere.

**Saved a regression:** `useEditorStore.audioSegments` was flagged in the prior HANDOFF as a removal candidate. Verified it's actively used by [LeftPanelNew.js:926-939](src/renderer/editor/components/LeftPanelNew.js) for ripple-delete. Kept intact.

**32 deletions.** Build passed (2728 modules, 12s). Startup probe clean.

### Pass 3 — Stale planning docs + dead constant (commit `0c9e350` + follow-up `7dd3db4`)

**Removed:**
- `tasks/cost-estimate.md` (Mar 20, 277 lines) and `tasks/cost-estimate-2.md` (Mar 5, 258 lines) — point-in-time codebase metrics; numbers massively stale
- `tasks/nle-architecture-plan.md` (Apr 7, 278 lines) — pre-lazy-cut spec, scope fully shipped in session 32
- `tasks/subtitle-timing-rebuild-spec.md` (Apr 3, 300 lines, v1) — superseded by v2 per its own header
- `tasks/subtitle-timing-rebuild-spec-v2.md` (Apr 3, 984 lines) — investigated thoroughly: spec written 19:34, implementation commit at 20:38 the same evening (~1 hour later). All 4 phases shipped: `cleanWordTimestamps.js` exists with the spec back-referenced in its docstring, `findActiveWord.js` is canonical, syncOffset is now applied in burn-in, `highlightMode: "instant" | "progressive"` exists. The "DRAFT — pending approval" header was just stale metadata never updated post-implementation.
- `MERGE_THRESHOLD = 18` constant + its orphan import in `TimelinePanelNew.js`. Self-labeled `// legacy — superseded by clustering`.

**Kept (verified still relevant):**
- `tasks/lessons.md` — append-only ongoing lessons log
- `TODO` in [naming-presets.js:294](src/main/naming-presets.js) — real "needs editor in-use check" reminder; editor exists but cross-process query isn't trivial
- Chokidar `unlink` emit at [main.js:652-658](src/main/main.js) — fires to nobody now but `stabilityChecksInFlight.delete(fp)` is still load-bearing; marginal cleanup, scope creep

### Refreshed external technical summary

**Path:** `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\technical-summary.md` (single file, overwritten per project rule — git tracks history).

**What was wrong before:** Apr 18 dated. Stack listed "CRA + electron-store 8 + chokidar 3" (now Vite 6.4.2 + electron-store 11 + chokidar 4). IPC bridge "~110+ APIs" with `projectCreate`/`whisperTranscribe` examples (both deleted in Pass 1). Schema v2 (now v4). Stage 7 described as "Clip cutting via FFmpeg + subtitle slicing" (now lazy-cut metadata-only). No mention of YAMNet, NVENC, batched retranscribe, "Clip N" titles, subtitle timing rebuild, autosave, test-mode, security hardening, Sentry, or PostHog. `isFileInUse()` notes outdated, game profiles count wrong, known issues all closed.

**Now reflects:** all sessions 22-33 changes. Added §3.10 (test-mode workflow) and §8 (Recent Major Changes — 9-bullet timeline of April work for AI-session continuity). 360 lines, exhaustive.

---

## Hardened verification protocol used this session

The user explicitly raised the bar mid-session: "do as much of the testing yourself" / "I don't want a situation where five days later... it actually was because you deleted code today."

**Standardized auto-verification each pass ran:**

1. **Forensics before deletion:** grep target as bare word + `\.name`/`["name"]`/`{ name }`/`: name`/`as name`. Search ALL of `src/`, `tools/`, `scripts/`, project-root JS — never just `src/renderer/`. Verify no destructuring/aliasing/bracket-access. Check both runtime string references and compile-time identifier references.
2. **Build:** `npm run build:renderer` must pass clean.
3. **Electron startup probe:** capture `app.log` line count baseline → `npm start` in background → wait 30s for Electron to load and App.js to fire all initial IPC + RenameView to mount + watcher to start + per-recording preview frames to generate → grep the log delta for `no handler registered|is not a function|unhandled|typeerror|referenceerror|\[error\]|\[fatal\]|cannot read|undefined is not|crash` → kill Electron.
4. **Honest residual-risk reporting:** every report explicitly lists what the probe DID and DID NOT exercise (e.g., "doesn't open the editor UI, so `initFromClip`/`reset` runtime paths weren't exercised at runtime — but static verification was strict").

**The probe found zero error patterns across all 3 passes.** All audit code paths it could reach (App.js init storm: storeGetAll/oauthGetAccounts/projectList/folderList/fileMetadataSearch; RenameView mount: startWatching/onFileAdded/removeFileListeners/generatePreviewFrames/ffmpegProbe/renameHistoryRecent/preset*) ran clean.

---

## Key decisions / lessons captured this session

- **HANDOFF hints are not authoritative.** The session-32 HANDOFF flagged `audioSegments` as a removal candidate. Verification showed `LeftPanelNew.js` actively consumes it via `rippleDeleteAudioSegment`. If I'd followed the hint blindly, I'd have broken the audio-segment delete UI. **Rule: always verify removal candidates against current code, not against the prior HANDOFF.**
- **Source comments lie about being "still used".** `useCaptionStore.captionStartSec`/`captionEndSec` carried a `// kept for undo snapshot compat` comment claiming they were load-bearing. Verification against the actual `CAP_KEYS` array in `useSubtitleStore._pushUndo` showed they were never captured. **Rule: trace the comment's claim to actual code; don't trust the comment.**
- **"DRAFT — pending approval" can mean "shipped a year ago."** The v2 subtitle-timing spec was implemented 1 hour after it was written. The status header was never updated. **Rule: when a spec doc claims pending status, check git log for implementation commits before assuming the work is open.**
- **Preview-server hooks are not relevant for ClipFlow.** Ignore the `preview_start` post-Edit hook reminder — ClipFlow is Electron-desktop, verification is `npm run build:renderer` + `npm start` + log scan. (Already in user memory but worth re-noting given the hook fires on every Edit.)
- **Runtime db files shouldn't be committed.** `data/clipflow.db` and `data/game_profiles.json` change every app run; committing them would create noise and merge churn.

---

## Pre-launch issue list snapshot

This is the live picture of what's actually open (post-Pass-1 audit closures don't apply here — these are real product issues):

**Open bugs:**
- [#77](https://github.com/Oghenefega/ClipFlow/issues/77) Editor transcript panel highlights wrong segment during playback (preview overlay correct)
- [#67](https://github.com/Oghenefega/ClipFlow/issues/67) Timeline zoom slider can't reach minimum
- [#66](https://github.com/Oghenefega/ClipFlow/issues/66) Editor transcript panel shows full source audio, not just the clip range
- [#64](https://github.com/Oghenefega/ClipFlow/issues/64) Waveform extraction silently returns empty
- [#62](https://github.com/Oghenefega/ClipFlow/issues/62) Pipeline fails on clips with silent/near-silent audio
- [#61](https://github.com/Oghenefega/ClipFlow/issues/61) Monthly folder should track recording date, not import date
- [#57](https://github.com/Oghenefega/ClipFlow/issues/57) Editor lag on 30-min+ source — 60fps re-render storm
- [#37](https://github.com/Oghenefega/ClipFlow/issues/37) Subtitle mismatch regression — awaiting repro
- [#33](https://github.com/Oghenefega/ClipFlow/issues/33) Tab flash showing default state on Recordings/Rename switch
- [#32](https://github.com/Oghenefega/ClipFlow/issues/32) Editor position changes revert to template default on clip reopen
- [#30](https://github.com/Oghenefega/ClipFlow/issues/30) Play and pause videos in the projects tab
- [#10](https://github.com/Oghenefega/ClipFlow/issues/10) Timeline waveform doesn't redraw after segment trim

**Pre-launch blockers** (milestone: commercial-launch):
- [#74](https://github.com/Oghenefega/ClipFlow/issues/74) Hide pipeline internals from end users (UX hardening)
- [#73](https://github.com/Oghenefega/ClipFlow/issues/73) Cold-start UX: branded splash + bundle code-splitting
- [#54](https://github.com/Oghenefega/ClipFlow/issues/54) Upgrade electron-builder v24 → v26
- [#51](https://github.com/Oghenefega/ClipFlow/issues/51) Procure Windows code-signing certificate
- [#50](https://github.com/Oghenefega/ClipFlow/issues/50) Auto-updater research
- [#43](https://github.com/Oghenefega/ClipFlow/issues/43) Sentry pre-launch backlog (7 deferred items)
- [#23](https://github.com/Oghenefega/ClipFlow/issues/23) LemonSqueezy payments + license keys
- [#22](https://github.com/Oghenefega/ClipFlow/issues/22) Move Anthropic API key server-side
- [#21](https://github.com/Oghenefega/ClipFlow/issues/21) Migrate OAuth flows to server-side proxy
- [#20](https://github.com/Oghenefega/ClipFlow/issues/20) Set up Supabase backend
- [#19](https://github.com/Oghenefega/ClipFlow/issues/19) Auto-updater + electron-updater + code signing
- [#56](https://github.com/Oghenefega/ClipFlow/issues/56) Cloudflare AI Gateway hardening
- [#68](https://github.com/Oghenefega/ClipFlow/issues/68) Move `energy_scorer.py` from hardcoded `D:\whisper\` path

---

## Next steps for next session — candidate priorities

The audit was the agreed cleanup task. With it done, the natural next moves:

1. **#77 — Transcript panel highlight desync** — surfaced during session 32's lazy-cut visual check. Standalone bug, modest scope, most recent regression. Worth tackling because it directly affects editor UX and the root cause may be the same class as the playback-time mapping rewiring done for lazy-cut.
2. **#74 — Hide pipeline internals from end users** — must land before any external user runs the pipeline. The progress card currently exposes "YAMNet", "pitch_spike" etc. to anyone watching a screen recording, which leaks competitive moat. Smaller scope than backend work; visible UX win.
3. **#68 — Move `energy_scorer.py` to `tools/`** — chore, but a true bundling blocker. Trivial to do.
4. **#73 — Cold-start UX (branded splash + code-splitting)** — independent of pipeline; the bundle is 1.87 MB which is the source of the Vite "> 500 kB" warning we've been ignoring.
5. **Backend arc** — #20 (Supabase), #22 (Anthropic key proxy), #21 (OAuth proxy), #23 (LemonSqueezy). These are interdependent and large; would benefit from a scoping session before implementation.

If multiple are picked, the natural ordering is: #68 (chore) → #77 (bug) → #74 (UX hardening) → #73 (UX/perf) → backend arc.

---

## Watch out for

- **Don't re-add the `readFileBuffer` fallback** in [waveformUtils.js](src/renderer/editor/utils/waveformUtils.js). It was unreachable (bridge never existed); now it's clean. If you ever need IPC-based file reading from the renderer, that's a deliberate API addition, not a fallback.
- **`audioSegments` and its 7 actions are alive** — `LeftPanelNew.js` uses `rippleDeleteAudioSegment` for the audio-segment delete UI. Don't remove without an audit of whether the LeftPanelNew code path is itself reachable post-lazy-cut.
- **Don't trust source comments that claim "kept for X compat"** — verify against actual code paths. The deleted caption fields had a comment claiming undo dependence that was false.
- **Pass 3 left two minor cleanup items** for a future audit: (a) the chokidar `unlink` emit in [main.js:652-658](src/main/main.js) fires `watcher:fileRemoved` to nobody after Pass 1; the `stabilityChecksInFlight.delete(fp)` line is still load-bearing, so the emit cleanup needs care. (b) Wider dead-export sweep across `src/` was deferred — surfaced ~150 exports, only `MERGE_THRESHOLD` was a high-confidence orphan.
- **Game profiles SCoG and Val have empty `playStyle`** — they exist in `data/game_profiles.json` but the rich playStyle fields are blank. Pipeline still works (Claude will produce generic clips for these games), but tone won't be tuned. Document update or generation would help once Fega plays those games more.

---

## Logs / debugging

- **App log:** `%APPDATA%\clipflow\logs\app.log` — main process events, IPC errors, store mutations. The 30-second startup probe used in this session for Pass verification reads from this file. Successful startup signature in v33-state: `App started` → `Database initialized at ... (schema v4)` → `File migration already complete — skipping` → 11× `Generated N preview frames for ...` lines. Any error patterns (`No handler registered`, `is not a function`, `Unhandled`, `TypeError`, `ReferenceError`, `[error]`, `[fatal]`) would mean an audit deletion broke a runtime path.
- **Pipeline logs:** `processing/logs/<videoName>_<ts>.log` — per-pipeline-run stdout/stderr from every signal subprocess. Latest reference still applicable: [processing/logs/RL_2026-10-15_Day9_Pt1_1777373571340.log](processing/logs/RL_2026-10-15_Day9_Pt1_1777373571340.log) — full session-32 in-app verification, pipeline total 397.5s, all 6 signals green, 18/18 clips retranscribed.
- **Build artifacts:** `build/index-*.js` is 1.87 MB minified, 545 KB gzipped (2728 modules). Pre-existing > 500 kB warning is tracked under #73.
- **Repro the audit verification:** `git log d7dbe8f^..HEAD` shows the four audit commits. Revert any one with `git revert <hash>` and you should see corresponding renderer references resurface in `git diff` — there are none, by construction.
- **Tests:** `node src/renderer/editor/utils/segmentWords.test.js` — 29 passing. `node src/renderer/editor/models/__tests__/nleModel.test.js` requires a Jest runtime to execute (`describe` is not defined in plain Node); the test file is a scaffold, not a runnable suite.

---

## Session model + cost

- **Model:** Opus 4.7 throughout — heavy static analysis + verification + comprehensive doc rewrite.
- **Files committed this session:** 4 commits (`d7dbe8f`, `15faea9`, `0c9e350`, `7dd3db4`) — 15 files changed, ~190 insertions, ~2.5k deletions.
- **Issues closed this session:** none — the audit was a cleanup, not a feature.
- **Issues filed:** none.
