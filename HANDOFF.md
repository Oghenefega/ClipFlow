# HANDOFF — Session 243 (2026-09-07)

## Current State

**Session 243: Fega's five asks from one message all shipped on master (five commits), verified
on the dev build via CDP, NOT yet checked by Fega, NOT cut — installed copies are still alpha.27
(now eight changes since; cut alpha.28 on his ask).** Plan file: `~/.claude/plans/rosy-growing-papert.md`.

1. **#370 playhead** (7df2976) — `TimelinePlayhead.js` anchors `top:0/bottom:0` (the old summed
   height was 194 px vs a 264 px+ count-driven stack); 1 px bar, 8×5 marker,
   `PLAYHEAD_COLOR = "var(--accent)"`. Measured: spans the lane wrapper exactly (528→792).
2. **#371 resizable timeline** (5d5eb84) — `EditorLayout.js`: `timelineHeight =
   clamp(laneStackHeight, tlHeight, 55% of the measured body)`; 7 px handle on the timeline's top
   border (pointer drag, double-click → 0 = lane stack); `useLayoutStore.tlHeight` now read from /
   written to `localStorage["clipflow-editor-tlheight"]`; `TL_MIN/TL_MAX` removed,
   `TL_MAX_FRACTION` added. Measured: 312 → 394 (cap at 1280×860), floor refused, reset, 380
   survived reopening the editor.
3. **#368 casing** (e85d7d9) — new CJS `editor/utils/subtitleCasing.js`
   (`fixWordCasing / fixTextCasing / fixTranscriptionCasing`), applied in `whisper.transcribe()`
   (full pass + manual retranscribe), the batch JSON read in `ai-pipeline.js`, `resolveSubtitles`
   (replaces the inline fixer), and `ProjectsView.getClipTranscriptSegments`. 13 tests. Whisper
   prompt A/B run and NOT shipped (numbers on #368; scratchpad `prompt-ab.js`).
4. **#369 copy/paste layout** (86d2bee) — `useEditorStore`: module-level `_layoutClipboard`,
   `copyLayout(segId?) / pasteLayout(segId?) / _layoutTarget / clearLayoutNotice`, state
   `layoutClipboardTick` + `layoutNotice`; `TrackContextMenu` Copy/Paste items; registry
   `copyLayout` ctrl+shift+c / `pasteLayout` ctrl+shift+v; Layout panel `clipboardRow` under the
   scope switch in both non-draft branches. Verified all paths on the RL Day9 Pt2 fixture
   (menu paste, undo, key paste, cross-clip paste onto Clip 2, AR Day16 refused for source size).
5. **#367 Edit-game dialog** (7fe9afd) — `modals.js` `GameEditModal`: `min(960px, 92vw)`,
   header / scrolling body / pinned footer, 1fr 1fr columns, AI Context always open on the
   right, Active/Inactive in the header. 1280×860: body 562/562, no scroll. `AddGameModal`
   untouched (460 px) — ask Fega if it should follow.

6. **#372 stranded word + grouping units** (two commits after the five above, plus the Add-game
   dialog at 640 px, 876dbcb). `tools/word_timing.py` `rescue_stranded_words` (after the vote,
   all ladder rows; constants `STRANDED_*`); `segmentWords.js` phrasal verbs in `ATOMIC_PHRASES`,
   `QUANTIFIERS`/`OF_PRONOUNS`/`ATOMIC_TRIPLES` via `isQuantifierPhrase` (Rule 1d). Scored:
   `score_production median` 86.1 → 86.1% (first-moved 54.6 → 55.6%), per-word audit 4 better /
   1 worse / 16 deleted-by-Fega; `group_exp` exact pills 1271 → 1279, precision 89.9 → 91.0%.
   Live on Fega's rejected COPY of Clip 5 (dev, Re-transcribe): `'stranded': 1`, editor reads
   "They just | took out | three of us | in | Oh my word". Rendered Clip 5 itself untouched.
   Fega's "words land late" on that clip WAS this one word; the raw-vs-voters A/B on the clip
   showed the alpha.23 engine is not late (tens of ms, mostly earlier).

## Key Decisions (s243)

- **Timeline extra room stays empty; lane heights don't scale** — lane heights are constants
  used by every block layout. Fega can ask for scaling lanes as a follow-up.
- **Cap = 55% of the measured body**, not the window: a window resize re-clamps via
  ResizeObserver. At 1280×860 that squeezes the right rail (it scrolls) — pre-existing rail
  behaviour at short heights; Fega's window is 2000×1112 where it fits.
- **Casing fix at birth AND on read, no disk migration** — old `project.transcription` stays
  lowercase on disk; every reader corrects it. `hasEditorSavedSubs` gate untouched.
- **Whisper prompt left alone** — the cased prompt only helps the first ~40 s and shifts
  timing (9/102 words > 50 ms). Sentence-case/punctuation would be a deterministic true-casing
  pass, not a prompt change (noted on #368).
- **Paste target rule** — explicit segment (menu) > playhead section when the panel is in
  section scope and the clip has a cut > the clip. Single-section clips always paste onto the
  clip (a lone section override would be invisible to the panel). `layoutId` stripped on copy.
- **Status toggle moved into the dialog header** rather than shaving margins, so the left
  column fits at 1280×860 (Fit-verify rule: remove rows, don't shave).

## Next Steps

1. Fega checks all five on the dev copy (or cut alpha.28 and check installed): playhead colour /
   thickness, drag the timeline, open a lowercase-heavy project (100T Day4 Pt1) in the Projects
   tab and the editor, right-click a section → Copy/Paste layout, Settings → Games → edit.
   Close the `status: untested` labels on confirmation.
2. Decide: `AddGameModal` to the same width? Lanes should scale with timeline height?
3. Still open from s241/s242: Tracker Sunday/day toggles + Release history (#161 untested);
   #353 straddling subtitle.

## Watch Out For

- **The keyboard paste writes to the CLIP when the Layout panel is in clip scope** even if the
  clip has a cut — by design, but during verification it put a copy of the project layout onto
  RL Day9 Pt2 Clip 1; restored through the app ("Use project layout"), disk verified all three
  clips inherit again. Clip-level pastes are IPC writes, NOT undoable with Ctrl+Z.
- `RightPanelNew.js`, `ProjectsView.js`, `modals.js`, `EditorLayout.js`, `useLayoutStore.js`,
  `constants.js`, `timelineConstants.js`, `resolveSubtitles.js` are CRLF — Edit tool only.
- Synthetic `KeyboardEvent("u")` on window did not split (gotcha 64); the context menu's
  "Split at playhead" did. Ctrl+Z / Ctrl+Shift+V synthetic keydowns DO fire.
- The right-rail "Layout" button TOGGLES the drawer — a driver must check the panel is closed
  before clicking, or it closes it (cost one probe round).
- `Browser.getWindowForTarget` is unavailable on Electron's page target — the large-window
  check of the dialog was not run; at 1112 px tall the modal simply has more room (85vh cap).

## Logs / Debugging

- Dev boots this session were clean (`Main window revealed`); nothing new in app.log.
- Scratchpad (`9ed897d3…`): `cdp-run.js` (evaluate a file), `test-369.js` / `test-369b.js`
  (copy/paste drive), `restore-clip1.js`, `prompt-ab.js` (Whisper prompt A/B → `%TEMP%\corva-prompt-ab\`),
  `cdp-resize.js` (does not work on Electron, kept for the record). Screenshots in
  `%TEMP%\claude-s243\shot*.png`.
- Casing check on real data: the node one-liner in this session's transcript counts
  lowercase/uppercase i/god/jesus across the 25 newest `project.json` files under `projectsRoot`.

Session 242's state follows unchanged.

# HANDOFF — Session 242 (2026-09-06) (previous)

## Current State

**Session 242: three Fega asks shipped on master, all confirmed by him on the dev build. Not cut —
the installed copies are still alpha.27 (three changes since; hold unless asked).**

1. **#364 rejection notes** (ad48a64) — ProjectsView `ClipRow`: wrapping `<textarea>` while typing,
   green "Saved ✓" flash, saved note rendered in full on its own row (click to edit).
2. **#365 apply-to-unedited** (9c80c21) — `projects.applyReframeToAllClips` /
   `applyAudioMixToAllClips` take `{ keepOverrides, dropClipId }`; store + IPC + preload pass it.
   Layout panel: "Apply to clips without their own layout" + "Replace on every clip, including
   edited ones" link; Recording levels popover: "Apply to unedited clips" + "Replace on every clip".
   The source clip goes back to inheriting. 5 tests (`applyToUnedited.test.js`).
3. **#366 caption line styling** (4f7e8c2) — `segment.lineStyles` keyed by Enter-separated line
   index, same shape as `wordStyles`. ONE token walk, `buildCaptionTokens` in
   `subtitleStyleEngine.js` (block < line < word), used by `CaptionText` (editor + Projects
   preview) and `public/subtitle-overlay/overlay-renderer.js` (export; exposed via the overlay
   preload). "Line N" chips in the Captions tab (shown at ≥2 lines) open the existing
   `WordStyleCard` with `label="Line"`. Export verified on a real render
   (`scripts/dev/caption-line-probe.js`: line 2 red 50k px / control 90). 6 tests.

Fega's working mode this session: **review before build** — plan, wait for approval, build, he
checks on the dev copy, then commit. He asked for concise replies. Keep both.

## Key Decisions (s242)

- **"Line" = a typed (Enter) line, not a wrapped one.** Wrapped lines aren't stable across sizes;
  Fega confirmed. Line chips only appear with ≥2 lines (one line == the block).
- **Line styles resolve per word, not as a wrapping span.** Word > line > block merged into one
  override and fed through the existing `buildCaptionWordOverrideCss`, so nothing new to render and
  the export stays pixel-identical to the preview.
- **Apply-to-unedited is the default button; wipe-all is a text link under it.** "Edited" =
  `clip.reframe !== undefined` (own OR "no layout") or any section override; for levels a non-empty
  `clip.audioMix`. The source clip's own copy is dropped in the keep path so the scope chip stays
  truthful ("All clips").
- **A saved note is content, not a chip.** Full row, wraps, never truncated (lesson distilled to
  clipflow-ui-debug).

## Next Steps

1. Cut alpha.28 when there's a reason (Fega's ask or ~10 changes): #364/#365/#366 + nothing else
   since alpha.27.
2. Still open from s241: Fega to check Tracker Sunday/day toggles and Settings → About → Release
   history on the installed copy (#161 carries `status: untested`).
3. #353 straddling-subtitle case unchanged (see s241 below).

## Watch Out For

- Fega DENIED screen control this session (request_access → user_denied). Verification path that
  worked: build → `CLIPFLOW_PROFILE=dev npm start` (kill with `taskkill //F //IM electron.exe`
  first) → he checks on the dev window, which shares the real library (pick zero-approved fixture
  projects: "2026-01-23 AR Day16 Pt3", "2026-07-20 RL Day9 Pt2").
- `ProjectsView.js`, `RightPanelNew.js`, `useCaptionStore.js` are CRLF; the Bash-heredoc python
  patcher hit both a CRLF mismatch and a quoting break — write patch scripts with the Write tool,
  normalise to LF for matching, write back in the file's own ending.
- The changelog pre-commit hook checks CHANGELOG.md on disk BEFORE the command runs — edit the
  changelog in one Bash call, commit in the next.
- `wordStyles`/`lineStyles` remap on text edits is positional when the count is unchanged and
  text-matched otherwise (`_remapIndexedStyles`); blank lines count toward the line index in both
  the remap and `buildCaptionTokens`.

## Logs / Debugging

- `scripts/dev/caption-line-probe.js` renders two 5 s clips (line-2 red / control) from the
  100T Day3 Pt1 project read-only into `%TEMP%\corva-caption-line-probe\` and counts white/red
  pixels at t=1 s. Override the project with `RENDER_PROBE_PROJECT`.
- Nothing new in app.log this session; the dev boots were clean (`Main window revealed`).

Session 241's state follows unchanged.

# HANDOFF — Session 241 (2026-09-05) (previous)

## Current State

**Session 241: #363 fixed on master — title cards/captions were dropping out of exports.**

Fega's eight 100T posts today: four had no opening title card, one had it pop in at the first
spoken word. Cause: `subtitle-overlay-renderer.js` slept 20 ms after `__renderFrame__` and
`capturePage()`d — under load (FFmpeg starting) that photographed the previous, empty frame,
and the identical-frame cache replayed it for the whole card. Only bites when nothing animates
under the card; every earlier clip spoke from frame 0. Subtitles and audio were never wrong
(checked frame-by-frame and by cross-correlation against the source).

Fix (two files): `public/subtitle-overlay/overlay-renderer.js` `__renderFrame__` now resolves
after a double rAF with `{ state, empty, major, wordChanged }`; `src/main/subtitle-overlay-renderer.js`
`captureExpected` rejects a capture that is blank where content is expected, or byte-identical to
the previous frame across a line/caption/word change, and re-captures after one more paint
(bounded 6 / 3). Offscreen window paints at 60 Hz; a warm-up capture after init. `captureFrameAt`
(thumbnails) shares the path. **Measured:** the paint wait alone was NOT enough — the offscreen
window still returned a stale picture on ~1 changed frame in 20 under load and always on frame 0;
the content guards are the fix. Probes: `scripts/dev/overlay-first-frame-probe.js` (7/25 blank
under load before → 0/45 after) and `scripts/dev/render-e2e-probe.js` (real `renderClip`; 3/8
card-only renders lost the card before → 0/20 after; word-heavy 73lp 15.4 s → 14.5–17.6 s).

**Confirmed by Fega on alpha.27:** updated, re-rendered the five affected clips, cards present. #363 closed, untested label removed.

## Key Decisions (s241)

- **Content-verified capture, not a better timer.** Measured: the double-rAF paint handshake alone still returned a stale picture (~1/20 changed frames under load, always frame 0). The guards in `captureExpected` (blank-where-content-expected, identical-across-a-line/word-change) are the fix; the handshake and the warm-up capture only reduce how often they fire.
- **Bounded retries, never a hang:** major (line/caption) 6, word-level 3, 2 s handshake timeout with a warn. Render time unchanged within noise.
- **alpha.27 cut on Fega's implicit ask** (posts were going out wrong), carrying #161 tracker + What's New redesign too.

## Next Steps

1. Fega: Tracker → Edit slots → toggle Sun, check the week reads without holes; Settings → About → View release history (both shipped in alpha.27, untested — #161 carries `status: untested`).
2. #353 still projects a subtitle that straddles two sections once (the Bang clip's "Oh" at 744.93–745.73 shows only in section 1); editor and export agree, but neither shows it twice. Unchanged this session.
3. Optional hardening: switch the overlay capture to the OSR `paint` event as the primary photo source (would cut the retries to ~0); the guards stay either way.

## Watch Out For

- `git stash pop` under autocrlf flipped the two overlay files to CRLF mid-session; scripted patches must normalise line endings before matching (patch4 failed on that alone).
- The Bash tool eats one backslash level in heredocs (again): `"\r\n"` in an inline python became literal newlines. Write patch scripts with the Write tool; use `chr(13)`/`chr(10)` if it must be inline.
- `scripts/dev/render-e2e-probe.js` reads Fega's REAL 100T Day3 Pt1 project (read-only, output to %TEMP%\corva-render-probe); override with `RENDER_PROBE_PROJECT` for a fixture.

## Logs / Debugging

- Render logs (`[Render]`, `[OverlayRenderer]`) go to the main-process console only — NOT to `%APPDATA%\Corva\logs\app.log`. Today's field failure was diagnosed from the output files (ffmpeg contact sheets: `-vf fps=4,scale=200:-1,tile=8x4`) and the project JSON, not logs. `[OverlayRenderer] Frame capture complete: … N stale re-capture(s)` and `Stale capture at t=…` lines now name every rejected photo when the console is visible (dev / harness runs).
- Audio sync was ruled out by FFT cross-correlation of the export against the source at each section's offset (0 ms lag) — the recipe is in this session's transcript, worth a script if it comes up again.

Session 240's state follows unchanged.

# HANDOFF — Session 240 (2026-09-05) (previous)

## Current State

**Session 240: alpha.26 (pause fix) is on the feed; tracker holes/Sunday/day toggles and the
What's New redesign are on master, NOT yet cut.**

1. **Pause regression (alpha.25 → alpha.26, af6f8d5).** The stems' stop call ran in an effect
   declared before the one that calls `video.pause()`, so it read a still-playing element
   (`PreviewPanelNew.js`, fix eed2031: the call now sits right after `pause()`). Verified by
   patching `AudioBufferSourceNode.prototype.start/stop` over CDP: 4 starts on play, 4 stops in the
   pause frame, for Space and the transport button. Fega has NOT yet confirmed on the daily driver.
2. **Tracker (#161 closed `status: untested`, fbbaf69).** Pure modules `utils/trackerDayRows.js`
   (claiming: an item within 30 min takes its nearest slot; elapsed unclaimed slots on the current
   week draw nothing; future weeks keep every open slot; past weeks none) and `utils/trackerTemplate.js`
   (`activeDays` on the template, lenient reads, `normalizeTemplate` fixed key order for the preset
   compare, `paceForTemplate`); 116 jest tests. TrackerView: 7 columns, off day = 28px strip unless it
   holds posts (then a dim column), day chips in Edit slots (`toggleDay`, last day refused with a
   toast), "+ Log a post" row per started day → popover with `<input type="time">`. App.js
   `migrateTemplate` normalises; main.js `runStoreMigrations` adds `grid.Sunday` + `activeDays`
   (ran on dev: "3 template(s) upgraded"). QueueView `getUpcomingDates(isActive)` skips off days —
   traced, not exercised (the schedule dropdown needs a clip selected).
3. **What's New / Release history (WhatsNewModal.js).** One wide card (1040 max, 85vh): header
   band + count chips, change cards (category → `splitItem` first sentence bold → rest; long single
   sentences split at a clause break outside parentheses, else paragraph weight 500), rail when >1
   entry (click / ↑↓, Escape closes). Notes may be `{ title, body }` objects. Mockup Fega chose:
   scratchpad `whatsnew-mockup.html` Variant 2. Verified on dev with `lastSeenVersion` forced to
   alpha.23 (3-entry rail, Got it acks) and Settings → About → history (18 releases). Single-entry
   (no rail, hero card) path not exercised live — same component, `showRail=false` branch.

Session 239's state follows unchanged.

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

## Key Decisions (s240)

- **Slot claiming window = 30 min, nearest slot, many-to-one.** Wide enough for "posted at 2:31 for
  the 2:30 slot", narrow enough that hourly slots never share a post. A scheduled clip claiming a
  slot removes that drop target — accepted, same class as the old exact-match case.
- **Elapsed empty slots vanish live** (the `now` tick); retro logging moved to one "+ Log a post"
  row per started day with an editable time — Fega chose this over keeping the holes.
- **Off days = slim strip, expanding to a dim column only when they hold posts.** "Off means off":
  no logging onto an off day from the strip; toggle it on first.
- **Sunday off by default, `activeDays` on the template**, lenient reads (missing = Mon–Sat), so
  every stored template behaves exactly as before the change.
- **What's New = Variant 2 (rail)**, picked from two HTML mockups; titles derived from the first
  sentence rather than changing the notes' data shape (objects `{title, body}` are accepted too).

## Next Steps

0. Next installer cut carries fbbaf69 + the What's New redesign; the `"unreleased"` entry in
   `release-notes.js` already describes both. Then Fega: Tracker → Edit slots → toggle Sun, check the
   week reads without holes; Settings → About → View release history for the new screen.
1. Fega updates the desktop to alpha.26 (banner on relaunch → Install; Settings bottom reads
   v0.4.0-alpha.26) and confirms pause stops the sound with levels on. The laptop is still on alpha.23 or earlier — same banner path.
2. Fega, on alpha.26: open a 100T Day3 clip → sliders icon on the Audio lane → drag *Other* up
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

- Tracker week grid from CDP: the day grid is the `div` with `style.display==="grid"` and
  `style.padding==="5px 12px 6px"`; its `gridTemplateColumns` has 7 tracks (`28px` = off strip).
  Slot tiles are `+` spans (current week) / `○` (future week); retro row text "Log a post".
- Store migration line: `Weekly templates gained Sunday + activeDays (#161): N template(s) upgraded`
  in `app.log` (system). The dev store's `weeklyTemplate` is the LEGACY day-array shape (no
  `timeSlots`), so only its 3 overrides were upgraded by main; App.js normalises the rest on read.
- What's New forcing: with the app closed set `lastSeenVersion` in the profile's
  `clipflow-settings.json` to an older version; `whatsnew:get` then returns every newer entry.
  "Got it" writes the current version back.
- Scratchpad helpers this session: `drv.js` (Runtime.evaluate), `shot.js` (Page.captureScreenshot),
  `repoint.js` (dev projectsRoot ↔ fixture), `seed-tracker.js` (this-week entries, restores from
  `clipflow-settings.backup-s240-seed.json`).
- Render: `[Render] Recording levels: track 2 ×0.063, …` (main stdout / the launch log) and the
  `FFmpeg args` line show `[0:a:1]volume=…` stems + `amix`; `Recording levels are set but …` warns
  when the mix track was kept and why.
- Stems: `[stems] 4 track(s) × 54.0s from 355.0s in 1010ms` in `app.log` (videoProcessing).
- Editor state from CDP: `button[aria-label="Recording levels"]` className carries `text-sky-400`
  when levels are on; `[role=slider][aria-valuemin="-24"]` are the mixer rows; both `<video>`
  elements read `muted: true` while stems are active.
- Fixture copy used this session: `<scratchpad>\levels-fixture\.clipflow\projects\proj_1788551120819_9oyrwh`
  (its `project.json` now carries `audioMix {"1":-24}` and a rendered Clip 1) — disposable.
