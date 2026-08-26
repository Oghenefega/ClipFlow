# HANDOFF — Session 204 (2026-08-26)

## Current State

**#317 done and closed** (`8188f9d`) — `npm test` exists and runs 145 tests across 4 files that
were sitting in the repo unrunnable. **#311 built and pushed** (`5bd9873`), left OPEN for Fega's
one-pass verification on the daily driver.

**A render-hanging bug shipped in s203's own review fix was found and fixed here** (see Key
Decision 1). It never reached an installer.

Epic #308 status: #309, #310, #311 built; **#312 is the last build**, then #313/#314, then the
single installer. Nothing in the media track has been verified by Fega yet — that is still one
pass at the end, and the installer is still the gate.

## Key Decisions

1. **Every looping overlay input is capped with `-t <timelineDuration>`** (`5bd9873`). s203's
   `eof_action=repeat` (correct, kept) also changes what happens when an overlay input NEVER
   ends — and a still (`-loop 1`) and a forever-looping GIF (`-ignore_loop 0`) are exactly that.
   Measured: 10s clip + one still overlay was still encoding at 60s / 3.6 MB; with the cap,
   exit 0 at 0.29s, duration exactly 10.000000. Play-once GIFs still freeze on their last frame
   (re-proved frame by frame). Commented on #310; rule added to the ffmpeg skill.
2. **A video overlay's sound is composed INSIDE `buildNleFilterComplex`**, not in `renderClip`.
   It reuses the SFX amix chain verbatim, off the media input already handed out — so a video
   overlay adds **no new FFmpeg input** and no index shifts, and the whole thing sits inside the
   one seam the tests can reach. Video mixins land after the SFX mixins.
3. **A video block's edges trim the FILE, a still's don't.** `trimStart`/`trimEnd` are a real
   window into a video (clamped to `durationSec`, left-drag starts further in — standard NLE);
   images and GIFs keep `trimStart: 0` and stay stretchable forever. One expression covers both.
4. **No thumbnail on a video timeline block — icon only.** A live `<video>` per block is the
   Chromium-crash shape. The Media panel's grid thumbnails (`VideoThumb`, with teardown) stay.
5. **Silent video files are handled at render time, not at add time** (`probeHasAudio`). The file
   on disk is the authority and can be replaced. Load-bearing, not defensive: without it FFmpeg
   refuses the entire render (`Stream specifier ':a' ... matches no streams`) — verified both ways.
6. **jest's `testMatch` is narrowed to `src/**/__tests__/**/*.test.js`.** The default glob would
   also sweep the six self-running scripts (`ai-prompt`, `game-profiles`, `gemini-watch`,
   `signals`, `segmentWords`, `trackerCalendarModel`), which end in `process.exit()` and would
   kill the runner. They keep their `node <file>` contract.

## Next Steps

**Fega's standing call: NO installer until the whole media track is done — then one big one.**

1. **#312 (dynamic extra SFX/Music tracks)** — batch 4, closes out epic #308's build work.
   Input-index order in `render.js` is still load-bearing: segments → subtitle PNG pipe → audio
   assets → media assets. #311 kept it intact by adding no input at all; #312 WILL add inputs —
   append them with the audio assets and re-run `npm test` (the byte-identical guards now run).
2. **#314** (kind-blind watched-folder lists) and **#313** (stale ffmpeg-skill doc: ASS burn-in
   description — note the skill gained two new lines this session and last, don't clobber them).
3. **THEN cut the one big installer** (`clipflow-update-launcher`): #309/#310/#311/#312 + the
   review commits (d30fd39, 62ee3ee) + #313/#314/#317. Fega verifies in one pass on the daily
   driver; issues stay open (`status: untested` on anything closed early) until then.

Build/review rhythm stays: Opus@high builds each batch in its own session, Fable@xhigh reviews
it commit-by-hash right after it lands. **`5bd9873` has not been reviewed yet.**

## Watch Out For

- **First thing in Fega's verification pass: open a clip with a still or a normal looping GIF
  and hit Render — it must finish.** That is the s203 hang; it is fixed, but it is the one
  regression that would waste his whole session if it came back.
- The **"Clip 4 (copy)"** test clip in *2026-08-06 RL Day14 Pt2* (dev profile) is the sacrificial
  clip — it carries 2 test overlays and was restored to exactly that state at the end of this
  session (verified against the on-disk JSON). The first clip in that project
  ("He DOMINATED me after my trashtalk") is **approved AND published** — a card-matching heuristic
  opened it by mistake this session; back out without touching it.
- `-t` on the overlay inputs is invisible in the filter graph, so **no test covers it** — the
  seam is `buildNleFilterComplex` and the cap lives in `renderClip`'s args. It is protected only
  by the comment there and the two skill lines. Don't "tidy" it away.
- Preview-vs-output percent mismatch on un-reframed clips is still an accepted v1 limit; GIF
  frames still aren't scrub-synced in the preview (video overlays ARE — they seek while paused).
- `npm i -D jest` reserialized `package-lock.json` wholesale (+11k lines). Diffed package by
  package: the only pre-existing version change is `@babel/helper-plugin-utils 7.28.6 → 7.29.7`
  plus two dedupes. No runtime dependency moved.

## Logs/Debugging

- **`npm test` now works** — the throwaway jest shim from s202/s203 is dead, delete any copy.
- **Real-FFmpeg overlay harness** (scratchpad `311/`): a source clip plus an overlay built as one
  solid colour per second (red/green/blue/yellow/magenta) with a 1 kHz tone over a SILENT source.
  Reading a pixel back tells you exactly which second of the FILE is on screen, and any sound at
  all can only have come from the overlay. This is what proved the trim window, the timeline
  placement and the mix in one run. `run.js` / `run2.js` (multi-input + silent-file guard).
- Sample a pixel: `-ss <t> -vf "crop=4:4:<x>:<y>,scale=1:1,format=rgb24" -frames:v 1 -f rawvideo -`.
  Measure a window's level: `-ss <t> -t <d> -af volumedetect -f null -` → `mean_volume`.
- **Audio level maths:** `volume=0.6` is −4.4 dB and that is exactly what lands. A further −3 dB
  appears on MONO sources — that is the pre-existing `aformat=channel_layouts=stereo` upmix every
  SFX already goes through, not an overlay bug. Check a stereo file before chasing it.
- **A render harness that times out is a result, not a flake** — that timeout is what exposed the
  s203 hang. Kill stray `ffmpeg.exe` after one (`taskkill //F //IM ffmpeg.exe`).
- **CDP driving** (scratchpad `311/`): `cdp.js` (Runtime.evaluate), `shot.js` (screenshot),
  `click.js` / `rclick.js` (real Input mouse events — needed for the bottom nav, which ignores
  synthetic `.click()`). `ws` resolves from `C:/Users/IAmAbsolute/node_modules/ws`, not the repo.
  Launch: `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-features=CalculateNativeWinOcclusion`.
- **Card-matching gotcha:** walking up from a button until an ancestor's text contains a title
  matches a container holding EVERY card. Walk up until the ancestor contains the button's own
  label exactly once, then read its first line — and re-check that line before clicking.
