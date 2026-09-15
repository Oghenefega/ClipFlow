# HANDOFF — Session 258 (2026-09-15)

## Current State

Master is clean at this wrap's commit. **No installer was cut** — alpha.4 is still on the feed
and on Fega's daily driver. Unshipped on master: #417 + the CUSTOM-badge fix (s257) and this
session's four render/transcription hardening changes. One commit of product code this session.

The session started as a question ("is anything in this FFmpeg-skill post useful?"), became a
five-point comparison of the skill's engineering rules against the live code, and shipped the
four that were fixes:

1. **Render output verification** (`verifyRenderOutput`, `src/main/main.js` just above
   `doRenderClip`) — probe the file, require video + expected audio + length within 0.5 s of the
   timeline, delete and fail otherwise.
2. **Idle watchdog on the main render spawn** (`RENDER_IDLE_TIMEOUT_MS` in `src/main/render.js`,
   5 min of ffmpeg silence → kill, unlink partial, reject "ffmpeg render hung").
3. **`-pix_fmt yuv420p`** on the render's output args, so a 10-bit source can't reach NVENC.
4. **stable-ts spawns python.exe with an argv array** (all three sites), no more `cmd /c` string.

The fifth (per-platform pre-flight compliance) is **#418**, filed, not started.

## Key Decisions

- **Tolerance is 0.5 s, measured.** 195 real renders: file − timeline = min −0.001, p50 0,
  p99 0.02, max 2.351. The 2.35 s outlier is a *rejected* clip re-trimmed after its render
  (file exactly 16.000 = the old 106–122 range) — a stale render, not a render defect, so it
  did not move the threshold. Nothing marks a render stale when its timeline changes; not filed,
  mention it if it bites.
- **Watchdog is idle-based, not a fixed budget.** Renders vary 100× in length; a healthy encode
  prints stats every ~0.5 s. Five minutes of silence is a hang by construction. The env override
  is a probe seam only.
- **Verification failure deletes the file.** A re-render overwrites its own prior `renderPath`
  in place, so on a failed re-render the previous good file is already gone anyway; leaving a
  truncated file under the clip's name would be worse than none.
- **`audioExpected` comes from `renderClip`** (`useNle`): the NLE graph always maps audio (a
  muted lane is `volume=0`, not dropped); the legacy no-NLE path maps `0:a?` and may
  legitimately produce a silent file.
- **checkSetup's shell string was fixed in the same commit** as the twin it sat beside (s210
  rule), verified by running it.
- **Not adopted from the skill, on purpose:** loudness normalization (conflicts with #272's
  no-limiter decision), stream-copy cuts (every render composites), silence/filler removal,
  multicam sync, the contract/MCP layer.

## Next Steps

1. **Cut an installer, or wait.** Six unshipped changes on master now (s257 + s258). Batch rule
   says ~10 or an explicit ask.
2. **Clear `status: untested`** on #406, #407, #409–#415, #417 once Fega confirms them.
3. **#418** when the pre-launch list comes up; **#416** (Captions panel reads as per-game);
   **#265** first-run checklist.
4. Still open from s255: is the Google OAuth consent screen verified or only published?

## Watch Out For

- **`verifyRenderOutput` runs for `render:batch` too** — both handlers enqueue through
  `doRenderClip`. A batch with one bad file now reports that one as failed instead of rendered.
- **The watchdog fires on the main render only.** The three ffprobe spawns in `render.js`
  (`probeFps`/`probeDims`/duration) and `transcodeCopy` / `cutTitlePreview` / `remuxToMp4` in
  `ffmpeg.js` still have no timeout. Left alone: none of them sit in the publish path.
- **A probe timeout is a verification failure.** `ffmpeg.probe` has a 15 s timeout; on a
  pathologically slow disk a good render could be refused and deleted. Never observed; the
  message would say "output unreadable".
- **Scratch fixture library still exists** under the session scratchpad (`lib/`, `out/`), with
  a *copy* of the all-rejected project `2026-07-17 RL Day8 Pt5` and a rendered "Clip 1.mp4" that
  belongs to nobody. Disposable. The dev profile's `projectsRoot`/`outputFolder` were pointed at
  it for the in-app test and **restored from `dev-settings.backup.json`** — confirmed by
  re-reading the store.
- **`git status` was clean apart from the three source files** after the dev-profile source
  run — the s257 `data/clipflow.db` trap is a *prod*-profile source run only.

## Logs / Debugging

- **Render probes:** `scratchpad/render-hardening-probe.js <good|bad|hang>` runs the real
  `renderClip` on the fixture (`npx electron …`; `hang` with `CORVA_RENDER_IDLE_TIMEOUT_MS=1`).
  `scratchpad/measure-drift.js` is the read-only 195-render timeline-vs-file survey; rerun it
  before ever moving `RENDER_DURATION_TOLERANCE_SEC`.
- **10-bit fixture:** `scratchpad/fixture-10bit.mp4` (8 s of the newest recording, x265
  `yuv420p10le`, 2560×2880 60 fps). Recreate with `ffmpeg -ss 60 -t 8 -i <rec> -c:v libx265
  -pix_fmt yuv420p10le -crf 28 -r 60 -c:a aac`. NVENC on it without `-pix_fmt`: "10 bit encode
  not supported".
- **In-app path:** dev profile with `projectsRoot`/`outputFolder` repointed at the scratch lib,
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`, then
  `scripts/dev/cdp.js "window.clipflow.renderClip(clip, project, null, {})"` — the same IPC the
  Projects tab's Render button hits. Dev tokens were `{accounts:{}}` before boot.
- **Transcription A/B:** `scratchpad/transcribe-ab-probe.js <old|new>` (old = `git show HEAD~1`
  copy with absolute requires) on `speech.wav` (26 s, AR Day16 Pt4 at 258 s); `transcribe-batch-probe.js`
  covers `checkSetup` + `transcribeBatch`. Model-cache warm-up explains old 87 s vs new 25 s.
- **`console.log` from render.js does not reach `%APPDATA%\Corva\logs\app.log`** — only the
  scoped electron-log lines (`(tiktok)`, `(video-processing)`, …) land there. Render timings
  have to come from a source run's stdout or the render pill, not the log file.
