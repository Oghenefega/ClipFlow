# HANDOFF — Session 239 (2026-09-05)

## Current State

**Recording levels (#272) built and verified; alpha.25 is the delivery.** Fega's 2026-09-04
100T recording has the mic ~21 dB over the browser tab (Valorant + commentator) — measured on
Pt1 1267–1294 s: mix −21.8 LUFS, mic −21.8, game silent, "other" (the browser) −42.8, empty
silent. The mix track IS the mic. Instead of a DaVinci re-export of four 3 GB files, Corva now
balances the recording's own OBS tracks:

- **Model** `src/renderer/editor/models/audioMix.js` (CJS, shared by editor / render.js /
  projects.js): `{ "<trackIndex>": dB }`, clip override > `project.audioMix` default, `isFlat`,
  `buildSourceMix(audioSetup, mix, fileTrackCount)` → `[{index, gain}]` or null when the setup
  doesn't describe the file.
- **Render** `render.js` `buildNleFilterComplex` `opts.sourceMix`: `[i:a:N]volume=g` per track
  summed with `amix … normalize=0` in place of `[i:a]`, for all three graph branches; flat →
  byte-identical graph. `renderClip` resolves the mix, probes the track count, warns and keeps the
  mix track on mismatch / legacy path. `main.js` `doRenderClip` passes `audioSetup` (covers
  render:clip AND render:batch).
- **Preview** `components/preview/useSourceStems.js` + `utils/stemPlayer.js`: IPC
  `audio:extractStems` (one FFmpeg pass, 48 kHz stereo WAV per track, bytes over IPC, temp files
  deleted, `peak` per stem for "silent here"), decoded into Web Audio, one GainNode per track;
  the video element is muted while stems are active. Stems wanted when the popover is open OR the
  effective mix isn't flat; range = sections' union ± 5 s, re-extracted when a trim/extend leaves
  it. Sync = one drift check per rAF tick (restart > 60 ms), stems scheduled a 10 ms lead ahead
  AND that much further into the buffer so they land on the picture.
- **Store** `useEditorStore`: `audioMix` (clip's own, null = inherit), `audioMixPanelOpen`,
  `audioMixInfo` (UI only), `setAudioMixLevel`, `resetAudioMix`, `applyAudioMixToRecording`
  (IPC `project:applyAudioMixAllClips` → `projects.applyAudioMixToAllClips`). `audioMix` rides
  the autosave payload and `buildRenderPayload`.
- **UI** `timeline/RecordingLevelsPopover.js`, opened from a `SlidersHorizontal` icon on the
  Audio lane header (tinted sky when levels are on; hidden for single-track files). Rows named via
  `trackLabelText` ("Other…" → "Other"), −24…+24 dB, per-row reset, footer "Use the recording's"
  / "Reset" + "Apply to every clip", status "This clip" / "Recording". No/mismatched setup → one
  line pointing at Settings.

**Verified:** jest 267 green (14 suites; new `audioMix.test.js`, `stemPlayer.test.js`, 7 render
graph tests). Graph run directly on the Pt1 recording: mic −60 / browser +18 → −24.8 LUFS,
all flat → −21.8 (identical to the mix track). Dev profile against a scratch copy of the
0-approved **Pt2** project (`proj_1788551120819_9oyrwh`): popover rows/readouts, sliders driven by
keyboard, autosave wrote `{"1":-3,"3":18}` on the clip, reset-to-flat + close unmuted both video
elements, Mic −24 + Apply wrote `project.audioMix {"1":-24}` and stripped the clip's, a 3.5 s
playback probe (CDP WebAudio domain) created exactly 4 AudioBufferSource nodes and nothing else
(no drift restarts), and a real in-app render with Mic −24 measured **−37.2 LUFS** where the
flat mix is −20.3 (mic stem −20.3, browser −37.6 → arithmetic predicts −36.8).

**Closed out the same session:** feature committed as f6afdc7 and pushed; #272 closed with
`status: untested` (shipped-in note on the issue, #273 got a note on reusing the stems + sourceMix
mechanism); **0.4.0-alpha.25 cut and published to the feed** (exe + blockmap + `alpha.yml`,
packaged version verified from the asar); dev profile restored from the s239 backup
(projectsRoot/watchFolder/outputFolder back on W:, tokens `{}`), no electron left running.
The project-list summary (`listProjects`) is a field whitelist — `audioMix` was added to it in
the same commit so a Projects batch render sees the recording default (traced, not run).

## Key Decisions

- **Per clip, plus a recording default** (the #348 layout shape), not per-clip only as #272's
  "done means" said: today's case is 20 clips from one recording. `clip.audioMix` absent/null =
  inherit; `{}` = explicitly flat.
- **Sum of all non-mix tracks at unity reproduces OBS's mix track exactly** (measured: −21.8 LUFS
  both, same peak), so "all sliders at 0" and "no mixer" are the same sound, and untouched clips
  keep the old graph.
- **Preview stems are AudioBuffers from IPC bytes, not `<audio>` elements**: gains above 1.0 are
  needed (+18 dB on the browser), which `<audio>.volume` can't do, and `createMediaElementSource`
  on a file:// media in a file:// page risks the CORS taint (silence). Decoding costs ~23 MB/min
  per stem; the extraction window is capped at 5 min.
- **No limiter/normaliser** on the rebuilt mix: what the preview plays is what exports.
- **Refuse rather than guess**: no audio setup, or a setup for a different track count, keeps the
  mix track (render log says why; popover says "run the audio setup"). The OBS mix track is never
  a slider.
- #273 (volume keyframes) should reuse `StemPlayer` + the `sourceMix` graph; a static level is a
  keyframe-less track.

## Next Steps

1. Fega updates the desktop to alpha.25 (banner on relaunch → Install; Settings bottom reads
   v0.4.0-alpha.25). The laptop is still on alpha.23 or earlier — same banner path.
2. Fega, on alpha.25: open a 100T Day3 clip → sliders icon on the Audio lane → drag *Other* up
   (~+18) and *Mic* down a touch, hear it live, **Apply to every clip**, render one, listen.
3. Watch for: stems taking long on very long clips (extraction is one FFmpeg pass over the
   sections' range; 44 s took ~1 s); memory if a clip is minutes long (23 MB/min/stem in the
   renderer); any audible click on seeks (buffer sources restart without a crossfade — add a
   5 ms gain ramp if it shows).
4. Laptop still not on alpha.24/25 — the #288 migration line and the #287 backfill are pending
   there.

## Watch Out For

- **Bash tool eats backslashes in paths**: writing dev settings with `"\\levels-fixture"` produced
  `scratchpadlevels-fixture`; use `path.win32.normalize(scr + "/x")` in node instead.
- `taskkill //F //IM electron.exe` (double slash) kills only source runs; the installed daily
  driver is `Corva.exe` and was running the whole session — never kill it by image name.
- The CDP WebAudio domain (`WebAudio.enable` → `contextCreated` / `audioNodeCreated`) is the way
  to see the stems from outside without exposing the player: node counts per type over a play
  window are the restart-storm detector. Script: session scratchpad `cdp-play-probe.js`,
  `cdp-webaudio.js`.
- Radix sliders take synthetic `keydown` (`ArrowLeft/Right`, `Home/End`) on the `[role=slider]`
  thumb from a `Runtime.evaluate`; popover close = `pointerdown` on the `div.fixed.inset-0.z-40`
  backdrop.
- A dev render writes to the dev `outputFolder` — pointed at the scratchpad this session; if the
  settings backup isn't restored, the next dev render lands there too.

## Logs / Debugging

- Render: `[Render] Recording levels: track 2 ×0.063, …` (main stdout / the launch log) and the
  `FFmpeg args` line show `[0:a:1]volume=…` stems + `amix`; `Recording levels are set but …` warns
  when the mix track was kept and why.
- Stems: `[stems] 4 track(s) × 54.0s from 355.0s in 1010ms` in `app.log` (videoProcessing).
- Editor state from CDP: `button[aria-label="Recording levels"]` className carries `text-sky-400`
  when levels are on; `[role=slider][aria-valuemin="-24"]` are the mixer rows; both `<video>`
  elements read `muted: true` while stems are active.
- Fixture copy used this session: `<scratchpad>\levels-fixture\.clipflow\projects\proj_1788551120819_9oyrwh`
  (its `project.json` now carries `audioMix {"1":-24}` and a rendered Clip 1) — disposable.
