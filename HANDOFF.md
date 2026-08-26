# HANDOFF — Session 205 (2026-08-26)

## Current State

**`5bd9873` (#311) reviewed at Fable@xhigh and its fixes shipped** (`4eaa36c`) — 15 findings,
11 fixed, review summary on #311. The two big ones were measured export-overrun bugs: a video
overlay window past the clip's end (the DEFAULT drop of a long reaction clip) exported 30s from
an 8s timeline, and a looping GIF at tlStart>0 overran by exactly tlStart. Both re-measured at
exactly 8.000000 after the fix; the s203 still-overlay hang case stays fixed. `npm test`: 145
passing; renderer builds.

Epic #308: **#312 is the last build** (Opus@high, fresh session), then #313/#314, then the one
big installer. Nothing in the media track has been verified by Fega yet — still one pass at the
end, installer still the gate.

## Key Decisions

1. **The export is bounded at the OUTPUT: `-t timelineDuration` on the render args** (useNle
   only). `overlay` (shortest=0) does NOT stop at the main input's end — it repeats the main's
   last frame while any secondary stream runs — so export length is enforced, not inferred from
   input behaviour. Per-input caps kept as belt: still = timeline length, GIF =
   `timelineDuration - tlStart` (its setpts shift), video = `-ss trimStart -t window` with the
   graph handed a 0-rebased window (also kills the decode-the-lead-in cost; content parity
   proven pixel-per-second).
2. **probeHasAudio is a wrapper over ffmpeg.js `probeAudioTracks`** — inherits its 30s timeout
   (a stuck probe can't hang the render), returns true/false/null so a failed probe logs as a
   failure instead of "has no audio track". Both non-true states still drop the file from the mix.
3. **Review deferrals are tracked, not patched**: #318 (unprobed `durationSec` escapes every
   trim clamp), #319 (preview blind spots: mount-at-start latency, no onError), and the
   sync-loop dedupe is noted ON #312 because that batch rebuilds the same code.

## Next Steps

**Fega's standing call: NO installer until the media track is done — then one big one.**

1. **#312 (dynamic extra SFX/Music tracks)** — Opus@high, its own session. It WILL add FFmpeg
   inputs: append them with the audio assets (order: segments → subtitle PNG pipe → audio
   assets → media assets), re-run `npm test`, and read the s205 comment on #312 first (sync-loop
   merge belongs there; input-cap rules its new inputs must not disturb).
2. **#314** (kind-blind watched-folder lists) and **#313** (stale ffmpeg-skill ASS burn-in doc —
   the skill gained lines in s203/s204/s205, don't clobber them).
3. **THEN the one big installer** (`clipflow-update-launcher`): #309/#310/#311/#312 + review
   commits (d30fd39, 62ee3ee, 4eaa36c) + #313/#314/#317. Issues stay open (`status: untested`
   on anything closed early) until Fega's one pass.

Rhythm stands: Opus@high builds, Fable@xhigh reviews commit-by-hash right after it lands.
`4eaa36c` is itself unreviewed — it's a review-fix commit; the next Fable session can fold a
quick pass over it into the #312 review rather than a dedicated session.

## Watch Out For

- **Fega's verification pass gains one check**: besides "still/looping GIF render must finish"
  (s203 hang), drop a video LONGER than the clip, leave it untrimmed, render — **the export
  must be exactly the clip's length** (s205 overrun).
- **The output `-t` cap and the per-input caps live in `renderClip`'s args, not the filter
  graph — no test covers them.** Protection is the comments there, the ffmpeg skill lines, and
  the s205 comment on #312. Don't "tidy" either layer away; each covers shapes the other doesn't.
- The graph's video trim window is now ALWAYS 0-rebased by renderClip (`-ss`/`-t` on the
  input). `buildNleFilterComplex` still accepts arbitrary windows (tests feed `trim=1:5`
  directly) — that asymmetry is intentional; don't "fix" one to match the other.
- **jest passing proves render.js's whole require chain loads** (the test file requires it), so
  a broken cross-tree require would fail the suite, not just boot.
- The sacrificial test clip remains **"Clip 4 (copy)"** in *2026-08-06 RL Day14 Pt2* (dev
  profile); the first clip there ("He DOMINATED me…") is approved AND published — don't touch.
- Preview-vs-output percent mismatch on un-reframed clips is still an accepted v1 limit; GIF
  frames still aren't scrub-synced in the preview (video overlays ARE).

## Logs/Debugging

- **FFmpeg overrun/parity harness** (scratchpad `drain/`, this session): `main8.mp4` (8s),
  `overlay120.mp4` (120s), `anim.gif` (2s loop), `colors5.mp4` (colour-per-second + tone).
  Technique: run the exact renderClip arg shape, then `ffprobe -show_entries format=duration`
  — **duration is the assertion; "exit 0" passed both bugs.** Pixel read-back:
  `-ss <t> -vf "crop=4:4:<x>:<y>,scale=1:1,format=rgb24" -frames:v 1 -f rawvideo - | xxd -p`.
- Overlay-mix presence via volumedetect delta: in-window vs out-of-window mean_volume differed
  ~1.4 dB with a 0.6-gain tone over an existing tone — small but reliable.
- Left-resize verified through the REAL model in node (resolveMediaPlacements + the handler
  maths inline) — no app boot needed for placement-model regressions; pattern in the s205
  transcript, cheap to rebuild.
- The StrictMode dev-only blank-overlay class: any "works installed, broken under npm run dev"
  report on media elements → check effect cleanups that strip attributes React set (React
  won't re-apply an unchanged prop).
