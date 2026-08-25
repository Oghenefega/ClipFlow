# HANDOFF — Session 192 (2026-08-24)

## Current State

**Batch 3 is built, verified live, and pushed — `0fe55c7`.** #62, #300 and #178 are
closed as `status: untested`. Batches 1 + 2 remain review-clean from s188/s190.
Desktop and laptop are still on **0.4.0-alpha.4** — nothing from batches 1–3 has
reached a machine yet, by design. Batch 3 has **not** had its Fable review pass.

## Key Decisions

1. **MKV converts on rename (Fega's call, asked and answered this session).** The three
   options were refuse-at-the-door, tolerate-and-explain, and convert-on-rename; he
   picked convert. Clicking Rename on an MKV remuxes it to a real MP4 (video
   stream-copied, all audio tracks preserved in order) and deletes the source only after
   the output probes complete. A failed conversion refuses the rename rather than leaving
   a file whose name lies about its bytes.
2. **#300's recorded root cause was wrong, and the fix changed because of it.** Measured
   on Electron 40: Chromium **does** play Matroska — an MKV-bytes-in-`.mp4` fixture
   decoded video *and* audio and played normally. A container-based "MKV can't be
   previewed" warning was written, verified firing, then deleted; it would have nagged
   every tester whose MKV works. The editor now warns on **codecs only**. The correction
   is recorded as a comment on #300 and in `[[project_chromium_codec_facts]]`.
3. **#62 was widened past the crash fix, deliberately.** Its acceptance line asks for a
   clip suggestion from a silent recording; the crash fix alone yields zero, because
   detection correctly picks nothing when there is nothing to read. A run with
   effectively no speech AND no AI picks now offers up to six evenly-spaced 45s review
   windows (#200's never-empty principle). Fega was told and can scale it back.
4. **The "no speech" gate is words-per-minute, not an empty transcript.** The first
   version used `transcriptWordCount === 0`, ran the full pipeline, and never fired —
   Whisper hallucinates "you" / "Thank you." out of pure silence. Threshold is <10 wpm
   (the silent fixture measured 3.3; real commentary is 30+).

## Next Steps

1. **Fable reviews `0fe55c7`** in its own session, per the batch discipline.
2. **Batch 4 — the first ten minutes don't look broken:** #153, #74 (**needs Fega to
   approve replacement copy** — still the long pole), #152.
3. **Then cut ONE installer** covering batches 1–4 (~14 issues). Optional batch 5 if
   there is room: #157, #151, #158.

## Watch Out For

- **The 45s / max-6 fallback window is a guess.** It was verified working, not verified
  *good* — nobody has looked at those segments on a real silent gameplay recording.
- **The remux's AAC-retry branch is real but nearly unreachable.** Modern ffmpeg copies
  PCM and Vorbis into MP4 happily; the retry only fires when the mux genuinely refuses,
  and when that happens it is usually the *video* codec, so the retry fails too and the
  original copy error is what surfaces (verified with a Theora MKV).
- **`SUPPORTED_EXTENSIONS` / `normalizeExtension` in `naming-presets.js` has exactly one
  live caller** — the retroactive part-number rename, protecting `.mkv` files left on
  disk by older builds. It looks unused from the renderer because every fresh rename now
  targets `.mp4`. Don't delete it as dead code.
- **All s190 product watch-items still stand:** `gatewayAuthTokenPreMigration` has no
  reader (keep until the installer reaches the laptop); the prod profile has NOT run the
  #301 migration; "Corva Default" still never seen on screen (needs a fresh profile);
  `LEGACY_TIME_SLOTS` in App.js is load-bearing for Fega's old-format store.
- **The wrap-changelog hook** blocks any commit whose message contains "wrap" when
  CHANGELOG.md is untouched in the working tree AND absent from the last commit.
- **A stray `%APPDATA%\Electron\data\clipflow.db`** was created by a harness run that
  forgot `app.setPath("userData", …)`. Harmless, deletable, not the dev profile.

## Logs / Debugging

- **Dev-app E2E against fixtures (the technique this session leaned on):** back up
  `%APPDATA%\clipflow-dev\clipflow-settings.json`, repoint `watchFolder` +
  `projectsRoot` at a scratch tree, drop OBS-named fixtures in, launch
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`. Reconcile adopts
  anything matching the renamed-file pattern, so fixtures become real Recordings rows.
  Restore the backup and delete the fixture DB rows afterwards. Full trap list (including
  the two that cost passes here) is in `[[project_cdp_verification_gotchas]]` items 55–56.
- **Clip generation blocking on "Analyzing File / Starting…" with no pipeline log is not
  a hang** — it is the #169 audio-calibration gate waiting on a wizard, triggered when the
  file's audio-track count differs from the saved `audioSetup.trackCount` (currently 5).
  Build fixtures with a matching track count.
- **Pipeline logs** live at `%APPDATA%\clipflow-dev\processing\logs\<video>_<ts>.log` —
  that is where `#62 effectively no speech (N words/min)` and the per-stage timings print.
  App log is `%APPDATA%\clipflow-dev\logs\app.log`; `#300 converted … → …` lands there.
- **Reusable harnesses from this session** (scratchpad, `…\scratchpad\b3\`): `cdp.js`
  (minimal CDP evaluate driver), `remux-test.js` (remuxToMp4 cases incl. failure/refusal),
  `signals-silent-test.js` (real signal extraction over a flat energy timeline),
  `naming-and-cleanup.js` (formatFilename assertions + dev-library fixture cleanup).
