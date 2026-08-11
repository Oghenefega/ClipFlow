# ClipFlow — Session Handoff

_Last updated: 2026-08-11 — Session 159 (#251 built: hardcoded Fega-machine paths removed, FFmpeg bundled, first-run dependency check; awaits alpha.44 cut on Fega's go)._

---

## One-line TL;DR

The #1 beta blocker (#251) is built and verified: `energy_scorer.py` rescued off the D: drive into the repo (data-loss fix, landed first as `7f4f1f7`), FFmpeg + ffprobe now ship in the installer and every call site resolves bundled-first, all six hardcoded `D:\whisper` paths are gone, the model cache defaults to per-user app data, and a first-run dependency banner + pipeline gate name plainly what's missing on a tester machine. Four boot migrations pin the legacy locations on Fega's machines so his install needs zero re-entry and zero re-downloads — proven live on the dev profile across three CDP-verified boots.

## Current State

Master at session-159 head (post-`7f4f1f7` + main batch). **Fega is still on alpha.43** — the #251 work is committed and the packaged build in `dist/win-unpacked` carries it, but **alpha.44 is NOT cut yet** (batch rule: cut on Fega's go). The Arc Raiders scheduled fire (2026-08-11) confirming the alpha.43 queue fix may have happened — check `clipflow-publish-log.json`.

## What Was Just Built (session 159 — #251)

- **Step 0 rescue (`7f4f1f7`, committed alone):** `D:\whisper\energy_scorer.py` → `tools/energy_scorer.py`. It was on one physical drive, no history, not shipped. Audit found nothing else out-of-repo (`check_ebur128.py` on D: is unreferenced; left).
- **`src/main/app-paths.js` (new):** dependency-free (guarded electron require, no logger — safe under the replay-score plain-node stub). Exports `FFMPEG_BIN`/`FFPROBE_BIN` (packaged → `resources/ffmpeg/`, source → `vendor/ffmpeg/`, else bare name → PATH), `envWithBundledFfmpeg()` (prepends bundled dir to a child's PATH, reusing the existing `Path` key), `defaultHfHome()` (`<userData>\hf_cache`, lazy).
- **23 bare-name call sites switched** to the resolved bins: ffmpeg.js (16), ai-pipeline.js:365ish, gemini-watch.js:118ish, render.js (3), subtitle-overlay-renderer.js (2). Python children (energy scorer spawn, both stable-ts exec paths, signals runPythonSignal) get `envWithBundledFfmpeg()` because energy_scorer.py and WhisperX's audio loader shell out to ffmpeg by bare name themselves.
- **energy_scorer resolution** mirrors transcribe.py/#143: `ENERGY_SCRIPT` in ai-pipeline.js, packaged → `resources/tools/`, source → repo `tools/`.
- **whisperPythonPath: no fallback.** Unset/missing → plain error naming Settings → Tools & Credentials → BetterWhisperX Configuration → "Python Path (venv)" (ai-pipeline stage-4 check + shared `PYTHON_SETUP_ERROR` in stable-ts for both transcribe paths).
- **Four boot migrations in `runStoreMigrations`** (all condition-guarded, idempotent, fire only where the legacy path exists): watchFolder ← legacy W:\ default (STORE_DEFAULTS.watchFolder now ""), hfHome ← `D:\whisper\hf_cache`, whisperPythonPath ← `D:\whisper\betterwhisperx-venv\Scripts\python.exe`. The python one was added mid-session after discovering the DEV profile had `whisperPythonPath: ""` and relied on the deleted code fallback (prod store peeked read-only: explicitly set, safe either way).
- **First-run dependency check:** `src/main/deps-check.js` (ffmpeg/ffprobe run-check, python set+exists, 4 required tool scripts present) → IPC `system:checkDependencies` → preload `checkDependencies` → `DependencyBanner.js` under UpdateBanner in App.js (amber, lists title+fix per issue, Check again, dismissible). Same check gates `pipeline:generateClips` and refuses early with the same message.
- **Packaging:** extraResources — tools now filtered (`!**/__pycache__/**`), new `vendor/ffmpeg → ffmpeg` entry (ffmpeg.exe, ffprobe.exe, LICENSE*). `vendor/ffmpeg/` is git-ignored (exes ~138MB each, GitHub cap is 100MB); `scripts/fetch-ffmpeg.ps1` / `npm run fetch:ffmpeg` populates it (BtbN FFmpeg n7.1 GPL zip — NVENC + libx264 confirmed present). Script is pure ASCII on purpose (PS 5.1 reads ANSI; em-dashes broke the parser on first run).
- **SettingsView copy:** "Not found in PATH" → "Not found"; missing-ffmpeg hint now says reinstall ClipFlow or install to PATH.

## Verification record

- All runnable test suites green: ai-prompt 62, game-profiles 15, gemini-watch 14, signals weights, segmentWords 29, trackerCalendarModel 19. (renderAudioMix + nleModel + audioPlacements are jest-style with no jest installed — pre-existing, skipped in #249's baseline too.)
- Packaged build inspected: `resources/ffmpeg/{ffmpeg,ffprobe}.exe` + LICENSE, `resources/tools/energy_scorer.py`, ZERO `__pycache__`/`.pyc`; asar lists app-paths.js + deps-check.js.
- Three dev-profile boots (CDP on 9222/9223, `scratchpad/cdp-check.js`): (1) as-was store → banner with Whisper line only + `Pinned hfHome` log line; (2) clean-machine sim (PATH stripped to System32, vendor renamed away, watchFolder+hfHome keys removed) → banner with BOTH lines + `Pinned watchFolder` fires + screenshot; (3) post-python-migration healthy boot → NO banner, `Pinned whisperPythonPath` fires, and in-app `window.clipflow.ffmpegCheck()` returns **n7.1.5** = the bundled build, not chocolatey's PATH one. Store + vendor fully restored after.
- Known accepted deviation: `grep 'D:\\' src/` = exactly 1 hit, the hfHome migration's legacy-path constant (main.js ~:327). Mandated by the migrate-at-boot trap; noted on #251 so the mechanical check gets refined, NOT obfuscated.

## Key Decisions

- **Q1 (Fega, 2026-08-11): watchFolder default is now ""** — renderer's #167 guard means no watcher starts until a folder is picked. His installs rescued by migration.
- **Q2 (Fega): UPDATE_DIST_DIR** (`C:\Users\IAmAbsolute\...\dist` in main.js ~:4165) stays — it's #250's territory; noted on #250.
- **Bundled-first, PATH-fallback** — Fega's render path now uses the bundled n7.1.5 (NVENC confirmed in it), not his chocolatey install. First full pipeline run on alpha.44 is the watch item.
- **Whisper/Python bundling stays OUT** (per issue): documented setup step + the dependency check is the 3-tester answer; commercial-launch gate filed separately (see below).

## Next Steps

1. **Fega's go → cut alpha.44** (clipflow-update-launcher skill), he installs, runs one full pipeline: expect no settings re-entry, no model re-download, bundled ffmpeg does the whole run. That's #251's real-machine half; tester #1 is the true clean-machine proof.
2. **Check the 2026-08-11 scheduled fire result** (alpha.43 queue fix confirmation) — `clipflow-publish-log.json`.
3. #249 gaps 4+2 (tester gateway token posture) — Wick recommendation pending Fega's call.
4. #248 beta feedback reporter (spec ready), #244 loud scheduled-publish failures, #219 Add Game crash.

## Watch Out For

- **`vendor/ffmpeg/` must exist before `npm run build`** on any machine cutting installers — electron-builder errors on the missing extraResources dir. `npm run fetch:ffmpeg` once fixes it. It's git-ignored; a fresh clone doesn't have it.
- **The banner is dismissible by design** — the hard stop is the pipeline gate (`pipeline:generateClips` re-checks in main). Don't "fix" the banner into a blocking modal.
- **Retranscribe/editor paths don't have their own deps gate** — they surface the plain PYTHON_SETUP_ERROR from stable-ts instead. Acceptable; revisit if testers hit it.
- **Keep `scripts/fetch-ffmpeg.ps1` pure ASCII** — PS 5.1 parses it as ANSI; smart punctuation breaks it at parse time.
- The pre-existing jest-style test files (renderAudioMix, nleModel, audioPlacements) still can't run — not a session-159 regression.

## Logs/Debugging

- **Migration lines** (system module, app.log, first boot of new code): `Pinned watchFolder to legacy default W:\...`, `Pinned hfHome to existing legacy cache D:\whisper\hf_cache`, `Pinned whisperPythonPath to existing legacy venv D:\...python.exe`.
- **Dependency check:** renderer calls `window.clipflow.checkDependencies()` → `{ok, issues:[{id,title,detail,fix}]}`; ids are `ffmpeg`, `whisper-python`, `tool-scripts`. Pipeline refusal returns the same text joined as `{error}` from `pipeline:generateClips`.
- **Which ffmpeg ran?** Settings → Local Tools shows the resolved version — bundled = `n7.1.5-...`; chocolatey PATH fallback reports its own string. `ffmpegCheck` IPC returns the same.
- **CDP boot-verification harness:** session scratchpad `cdp-check.js` (launch dev electron with `--remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`, script prints BANNER_PRESENT/WHISPER_LINE/FFMPEG_LINE + screenshot). Kill dev electron with `taskkill //IM electron.exe //F` (daily driver is ClipFlow.exe, unaffected).
- Dev-profile logs: `%APPDATA%\clipflow-dev\logs\app.log`; dev store: `%APPDATA%\clipflow-dev\clipflow-settings.json`.
