# ClipFlow — Session Handoff
_Last updated: 2026-07-18 — Session 112 CLOSED — **Audio track calibration wizard (#169) built, verified, and shipped in the 0.2.1-alpha.1 installer (cut, NOT yet installed by Fega). He has unspecified "issues that need dealing with" — next session opens by asking what they are.**_

---

## One-line TL;DR
Investigated Fega's OBS audio-setup change (three distinct track layouts probed and whisper-verified), filed #169, built the full listen-and-identify calibration wizard behind a generation gate, CDP-verified it end-to-end in a sealed dev sandbox, found+fixed three latent bugs along the way (armed track migration, stale Settings pane, track-blind waveform cache), and cut 0.2.1-alpha.1.

## Current State
- **0.2.1-alpha.1 installer is in `dist/`, Fega has NOT installed it yet.** The in-app "Install update" banner will surface it. His installed daily driver is still 0.2.0-alpha.1 (no wizard, transcription reads track 1).
- **Fega reported "some issues that need dealing with" at wrap without saying what they are** — first order of business next session: ask. (Also: what he saw could be pre-existing 0.2.0 behavior, since he hasn't installed the new build.)
- **His plan:** edit a bunch of clips from yesterday's recordings — 4-track files, screenshot-2 layout (T1 = full mix, T2 = mic, T3 = Desktop, T4 = Chrome). Once he installs and generates, the wizard fires on the first file; labeling T2 "My voice" fixes transcription + waveforms for everything.
- **#169 OPEN, awaiting his hands-on pass.** All context (three setups, render-path dependency, build + verification details) lives in the #169 comment thread — read it before touching this area.
- **His OBS is now "fixed" per the session's recommendation** (mix restored on Track 1 as the render bed, isolated mic on Track 2) — because rendered clips take their audio from the source's FIRST audio stream (render.js:128/:134/:460). A no-mix layout would ship voice-only clips.
- Prod settings checked read-only: `transcriptionAudioTrack=0`, `_migrated_audioTrack_v2=true` (his install is NOT exposed to the armed-migration revert bug; it's fixed in code regardless).
- Dev profile (`clipflow-dev`) restored to exactly its pre-session state (real watchFolder — the #167 leftover hazard stands, `whisperPythonPath` empty, track 0, no audioSetup). #167 proper fix (neutral STORE_DEFAULTS) remains the standing top candidate from session 111.

## What Was Just Built (#169, commits e027705 + 9346523 + 956e0aa)
- **Wizard** (`src/renderer/components/AudioCalibrationModal.js`): per-track isolated playback (muted `file://` video + 20s extracted sample; 3 sample windows via "Try another part"), label pills (voice/game/music/comms/mix/other/empty), one-voice enforcement, auto-advance, "Skip the rest" once voice is labeled, unmount media cleanup + temp-sample cleanup.
- **Generation gate** (main.js `ensureAudioCalibrated`, inside `pipeline:generateClips`): prompts when multi-track + no saved `audioSetup`, or track-count mismatch; single-flight across concurrent batch/split calls (askDegrade pattern: `audio:calibrationNeeded` event + `audio:calibrationAnswer`); cancel blocks the run with a plain message; 60s decline cooldown stops per-file batch nagging.
- **FFmpeg helpers** (`ffmpeg.js`): `probeAudioTracks` (audio-only ffprobe) and `extractTrackSample` (deliberately NO track-0 fallback — wrong-track playback would cause mislabeling).
- **Store**: `audioSetup` default + migration. Saving calibration writes `transcriptionAudioTrack` = voice index, so transcription/retranscribe/waveform consumers needed **zero changes**.
- **Settings**: learned labels ("Track 2 — My voice"), calibrated-date line, "Recalibrate…" button (file picker → wizard); audio state re-read on tab activation (`isActive` prop from App).
- **Sparse-transcript sanity check** (ai-pipeline.js): 5+ min source with <20 words → `transcriptSparse` in the result → Recordings shows a recalibrate offer (catches same-count OBS changes the count check can't see).
- **Three bug fixes:** (1) `_migrated_audioTrack_v2` migration stayed armed on 0-value stores and silently reverted any deliberate track-2 choice at next launch — now disarms unconditionally; (2) Settings' mount-time load never saw post-launch wizard saves (all panes mount at boot) — now refetches on activation; (3) waveform disk cache was track-blind — track index now in the cache key (old cache files orphaned, harmless).

## Key Decisions
- **Wizard sets the existing `transcriptionAudioTrack` setting** rather than making consumers read `audioSetup` — zero pipeline churn, calibration is additive.
- **v1 change-detection = count mismatch + sparse check + manual recalibrate.** Count alone can't catch same-count layout swaps (his old and new setups are both 4-track); the full fix (whisper auto-suggest per track, proven manually this session) is the stretch slice on #169.
- **Sample extraction fails visibly** instead of falling back to track 0 (no-fake-fallbacks rule; a fallback would mislabel).
- **Version sized 0.2.0-alpha.1 → 0.2.1-alpha.1** (substantial new subsystem = minor bump + counter reset, per delegated sizing judgment).
- Rendered-clip audio bed stays "first audio stream" in v1; wizard labels are exactly the data a future render-audio-selection slice needs (noted on #169).

## Next Steps (priority order)
1. **Ask Fega what the "issues that need dealing with" are** — unspecified at wrap.
2. Fega installs 0.2.1-alpha.1 (banner or `dist\ClipFlow Setup 0.2.1-alpha.1.exe`; Settings bottom must read v0.2.1-alpha.1), generates a recording from yesterday, completes the wizard (voice = Track 2). Subtitles/waveforms should be clean mic. Then update #169 (verify → close with labels per ritual).
3. Any project generated BEFORE the update from yesterday's footage has mix-track subtitles — delete + regenerate if polluted.
4. #167 proper fix (neutral STORE_DEFAULTS + wizard-owned folder/games setup) — standing top candidate since session 111; unblocks safe first-run testing.
5. Stretch (#169): per-track whisper auto-suggest; also the sparse warning doesn't surface on strict-abort runs (result never returns) — decide if it should ride the progress event instead.

## Watch Out For
- **The armed-migration class:** any "one-time" store migration that only sets its done-flag inside the flip branch stays armed forever on stores that didn't need the flip — and later legitimate writes get silently reverted at boot. Audit new migrations for this shape (flag must be set unconditionally).
- The wizard's gate promise resolves via `audio:calibrationAnswer`; if `mainWindow` were ever null at ask time the generation call would hang (same characteristic as askDegrade — accepted parity).
- `extractAudio`/`extractAudioRange` still HAVE the track-0 fallback (pre-existing, for clips with fewer tracks) — only the wizard's `extractTrackSample` refuses to fall back. Don't "unify" them.
- Old waveform caches under `<watchFolder>\.clipflow\projects\<id>\.waveforms\*.v2.json` without `.tN.` in the name are orphaned, not stale-served. Don't prune unless asked.
- Wizard sample WAVs go to `%TEMP%\clipflow-audiocal\` — the modal's unmount cleanup deletes the dir; a crashed session may leave a few small WAVs (harmless).
- Dev profile still points at the REAL vertical recordings folder (#167 leftover) — generation in dev writes projects into the real tree. Session 112 avoided this with a sealed scratchpad sandbox (preseed watchFolder via JSON write + read-back validation; see clipflow-electron-ipc skill).

## Logs / Debugging
- **Calibration log line:** `[audiocal] calibration saved: N tracks, voice=track M` (system module) on every save. Gate decisions aren't logged individually — the wizard appearing IS the signal.
- **Waveform track evidence:** `[waveform] extracting peakCount=... track=N` (videoProcessing module) — after calibration this must show the voice index; a cache hit line means no extraction happened (check the cache filename's `.tN.`).
- **Pipeline logs:** `<userData>\processing\logs\<video>_<ts>.log` — "Extract Audio" + "Transcription (…) — N segments"; sparse check logs `SPARSE TRANSCRIPT: X words in Ys` when it trips.
- **Session verification evidence** (screenshots, CDP scripts) lived in the session scratchpad (temp — gone next session); the durable record is the #169 comment thread + tasks/todo.md session-112 block.
- **CDP driving recipe that worked:** launch `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`, then a tiny node script using Node 24's global WebSocket against `/json/list` → `Runtime.evaluate` (awaitPromise+returnByValue) and `Page.captureScreenshot`. Settings group headers are CSS-uppercased — match textContent case-insensitively; expand groups by clicking their "Show" span. Kill with `taskkill //F //IM electron.exe` (never TaskStop — memory project_cdp_verification_gotchas).
