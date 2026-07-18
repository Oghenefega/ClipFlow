# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## ✅ BUILT (session 112, awaiting Fega verification) — Audio track calibration wizard (#169)

Shipped per the plan below. CDP-verified in the dev app (sealed sandbox watch
folder, real 4-track recording): gate fires → wizard renders → per-track
samples extract & play → labels + auto-advance + skip-after-voice → save
writes audioSetup + transcriptionAudioTrack=1 → pipeline proceeded and
whisper transcribed the isolated mic track (7 segments; run then stopped at
the dev profile's missing Anthropic key — unrelated, pre-existing). Cancel
blocks generation with a clear message; 60s decline cooldown stops per-file
re-prompts; 2-track file vs saved 4-track setup re-prompts with the
"setup changed" copy; Settings shows learned labels + Recalibrate + date.

Two bugs found & fixed during verification:
1. `_migrated_audioTrack_v2` migration only set its flag when it flipped
   1→0, so it stayed armed on 0-value stores and silently reverted any
   deliberate track-2 choice on next launch. Now disarms on first run.
2. Settings' mount-time load went stale after a wizard save (all panes mount
   at launch) — now re-reads audio settings on tab activation (isActive prop).

Not live-verified (by construction): sparse-transcript warning UI (threshold
logic only; note: doesn't surface on strict-abort runs since the result never
returns), Recalibrate's native file dialog (undriveable via CDP; post-pick
path identical to verified wizard flow). NOT yet in an installer — Fega tests
on the daily driver, cut one on request.

## Original plan (approved) — Audio track calibration wizard (session 112)

**Problem:** ClipFlow guesses which audio track is the mic. One global setting
`transcriptionAudioTrack` (default 0) drives transcription (ai-pipeline.js:493,
:817), retranscription (main.js:1291), and waveforms (main.js:807, :863). The
Settings picker (SettingsView.js:991-1012) shows hardcoded guessed labels
("Track 1 (Mic)", "Track 2 (Game)").

**Fega's three setups (session 112, verified via probes + OBS screenshots):**
1. *Vertical-canvas era* (months of processed footage): T1 mix, **T2 mic**,
   T4 empty — whisper-verified on 2 files. ClipFlow read T1 = the mix; on
   sessions with vocal music playing, lyrics transcribe into T1 (demonstrated
   on processed project source RL 2026-07-15).
2. *Yesterday's interim setup* (OBS screenshot): T1 mix, T2 Mic, T3 Desktop,
   T4 Chrome, T5 Comms+Music, T6 Music — file only contains T1-T4 (OBS output
   records 4 tracks). Matches probe of 2026-07-17 recording (RL gameplay,
   despite Arc Raiders folder name).
3. *NEW going-forward setup* (OBS screenshot, no recordings yet): **no mix
   track**. T1 **Mic**, T2 Desktop, T3 Chrome, T4 Comms, T5 Music. Current
   setting (0) is CORRECT for this setup — earlier "switch to Track 2" advice
   retracted.

**Trigger-design hole this exposes:** track-COUNT mismatch cannot catch a
setup change that keeps the same count (old era = 4 tracks; new era likely
also 4-5). Count check stays (cheap, catches some cases) but is insufficient
alone → sanity-check trigger added below.

**Design (Fega-approved shape):** listen-and-identify wizard. Full labelling,
with "skip the rest" once voice is labeled — voice is the only required answer.

1. **Probe helper** (ffmpeg.js): `probeAudioTracks(videoPath)` → ffprobe count
   + per-stream info. Cheap, run at calibration/trigger time.
2. **Data model** (electron-store): new `audioSetup` = `{ trackCount,
   tracks: [{index, label}], calibratedAt }`. Labels: voice / game / music /
   mix / other / empty. Wizard ALSO writes `transcriptionAudioTrack` = the
   voice track index — all existing consumers stay untouched (zero pipeline
   changes).
3. **Wizard UI** (renderer, modal): per track — extract short sample via
   existing `extractAudioRange`, play it (muted video preview + `<audio>`;
   MUST have unmount cleanup), user picks label from dropdown. "Skip
   remaining tracks" appears once a track is labeled voice.
4. **Triggers:** (a) first multi-track video entering clip generation with no
   `audioSetup` → wizard before transcription; (b) new video's audio track
   count ≠ `audioSetup.trackCount` → re-prompt (catches some OBS setup
   changes); (c) single-track video → never prompt, use track 0;
   (d) Settings "Recalibrate" button → wizard on a picked recording;
   (e) **voice-track sanity check** — after transcription completes, if the
   transcript is near-empty for a long source (voice track probably moved),
   surface "your voice track may have changed — recalibrate?". Uses the
   transcription that already ran; zero extra compute. NOTE: (e) still misses
   the worst case — a swap where another track ALSO contains speech (e.g. old
   era's T2-mic → new era's T2-Desktop with mix-like content). The full fix is
   the stretch auto-detect (whisper sample per track), which also makes
   mixed-era reprocessing seamless; v1 relies on (b)+(e)+manual recalibrate.
5. **Settings UI:** replace hardcoded 4-button labels with learned labels
   from `audioSetup` + Recalibrate button. Manual override stays.

**Render-path dependency (discovered session 112):** final clip audio = the
source's FIRST audio stream — NLE filter graph uses `[0:a]` labels
(render.js:128, :134); legacy path maps `0:a?` (render.js:460), players
default to the first stream. So Track 1 is the audio bed of every published
clip. A no-mix OBS layout (mic on T1) ships voice-only clips with silent
gameplay. Recommended OBS shape: mix on T1 (render bed) + isolated stems
after (mic T2 → transcription). Future slice: render-audio selection by
wizard label ("mix" labeled track as bed, or amix stems); v1 renders
unchanged.

**Stretch (separate slice, not v1):** auto-suggest voice track by running
whisper on a 30-60s sample per track (proven manually this session).

**Verify:** wizard on the 4-track recording labels all tracks & sets
transcription to T2; subtitles + waveform read T2; track-count change
re-prompts; single-track video never prompts; skip-the-rest works.

---

## GATE PASSED (2026-07-16, session 106) — #164 Phase B: auto-detect proposes the boxes

**Gate results (prototype harness, zero src/ changes):**
- Recall 100%: face found in 8/8 sampled frames on all 6 sources (3 real
  videos + 3 manufactured mini-cam composites, faces down to ~51px). All
  small-face hits came from the tile passes — tiling is load-bearing.
- World classification 6/6 correct (stacked vs overlay).
- Rect accuracy: v1 cam 0/0/0/2px vs Fega's saved layout; v2 band boundary
  702 (visually exact); v3 borderless rounded cam worst-edge ~54px (~2% of
  width; L2/T7/B19); m240 2/3/2/4px; m320 2/2/2/2px.
- m480 (cam corner-abutting RL boost HUD over a dark corner): clean REFUSAL
  (world:none), never a wrong box — the designed failure posture; manual
  calibration remains the path.
- Detector settled: MediaPipe blaze_face_short_range + full-frame pass +
  overlapping tile grids (2/4, +6 below ~1080p-scale cams), consensus =
  cluster present in ≥75% of frames with <2%-diag position spread. NO YuNet
  fallback needed. Runtime = pure WASM (+~11.3MB assets), zero native modules.
- Algorithm: stacked worlds via temporal-variance band step (quiet/loud
  ratio ≥2.5); overlay cam rect via flood over (sharp-in-mean OR V<qTheta
  [abs 6-10]) mask from face seeds, dilate r1, occupancy trim ≥0.12.
- Build-slice refinements noted: native-res edge refine (±60px search at
  full res, fixes v3's right-edge shave), asar/file:// WASM serving (harness
  used localhost http; app loads via loadFile — needs protocol route or
  asarUnpack), HUD-adjacency hardening for m480-class layouts.

Harness + scorecard + annotated overlays: session scratchpad `gate/`
(main.js, index.html, snap.js, postprocess.js, proposal-*.json, annot-*.jpg).

Next: build slices B1-B4 below.

---

## BUILD PLAN (awaiting Fega's go) — #164 Phase B implementation (session 106+)

Ship order: B1 engine → B2 Detect button (face path) → B3 game-only layouts
+ two presets → B4 first-recording auto-offer. One installer at the end
(version sized at wrap). Each slice: build + `npm start` + CDP verify before
moving on.

### B1 — Detection engine in the app (hidden window, zero UI) — ✅ SHIPPED (session 107)

**Built exactly per spec below, verified end-to-end. Deltas + results:**
- Bridge is `window.clipflow.reframeDetect(projectId)` (flat method — matches
  preload.js conventions; the plan's dotted `clipflow.reframe.detect` shape
  didn't fit the file's idiom). Returns `{ success, proposal }` / `{ error }`.
- Verified in dev source AND the packaged exe (win-unpacked; asar list shows
  detect.html + detect-page.js + mediapipe/* + both main files; devDep pruned
  from packaged node_modules as intended). Zero network by construction
  (page CSP allows only blob:; all assets vendored + preload-fs-read).
- Gate reproduction: v1 cam {0,0,2560,1442} IDENTICAL to gate (0/0/0/2px vs
  saved layout); v2 band 704 vs gate 702 (same boundary, video-seek sampling
  vs ffmpeg frames); v3 coarse {28,428,630,356} ≈ gate {28,428,628,356}.
- NEW native-res edge refinement: v3 refined to {30,430,625,353} — all four
  edges within 0-1px of the OBJECTIVE temporal boundary (8-frame native-res
  std profiles: L≈29-30, T≈431, R≈655, B≈783). Two design iterations landed
  on: long-window (12px) quiet/loud qualification + winner = sharpest 3-line
  gradient, floor 6 (hard edges step ~17-32/line; feather ramps ~1-2 and must
  not win). Stacked worlds skip refinement (band boundaries gated 0-2px).
- **Gate's "v3 right edge shaved ~54px" reinterpreted:** the objective
  temporal step sits at x≈655 (exactly where B1 lands). The eyeballed truth
  ~712 is the tail of a feathered/semi-transparent fade on that borderless
  overlay — pixels 656-712 carry damped game motion (std 18-33 vs quiet ≤3 /
  full-game 43-49). A content crop at the hard step is the defensible choice;
  feather taste = user nudge in calibration. Fega eyeballs this in B2 anyway.
- Perf: ~6s total for the 15GB 2560×1440 overlay source (8 seeks + ~470
  detector passes + refinement), similar order for 2560×2880. B2's progress
  state will be short-lived.
- Dev-profile test projects proj_b1v1/v2/v3 (in spike164-watch) point at the
  three gate videos — reusable for B2 CDP verification.

Original B1 spec (implemented 1:1 unless noted above):
Mirror the subtitle-overlay offscreen pattern (subtitle-overlay-renderer.js:189
— hidden BrowserWindow, dedicated preload, loadFile of a static html).
- `public/detect.html` (→ build/detect.html): own CSP meta (`script-src
  'self' blob: 'wasm-unsafe-eval'; connect-src blob:; media-src file: blob:`)
  — the MAIN window's CSP (index.html:7) is UNTOUCHED. Main-window security
  posture unchanged; new single-purpose window noted on the infra dashboard
  when B1 lands (CSP rule in project CLAUDE.md).
- `public/mediapipe/`: vision_bundle.mjs + wasm pair + blaze_face_short_range
  .tflite (~11.5MB, copied from @mediapipe/tasks-vision — pinned 0.10.35 as a
  devDependency; assets vendored into public/ so the packaged app never
  touches node_modules). Loading: dedicated preload reads bytes via fs
  (asar-aware) → blob URLs (+ modelAssetBuffer for the model); page does
  dynamic import(blobUrl). FALLBACK if blob-import misbehaves under file://:
  protocol.handle('clipflow-detect') route in main.js (named, not default).
- `src/main/reframe-detect.js`: `detect:run(sourcePath)` IPC — spawns/reuses
  the hidden window, passes the source path, 240s timeout, returns proposal
  JSON; window torn down after each run.
- Detect page renderer: hidden `<video src=file://source>` seek-sampler (8
  frames 10-90%, WITH teardown — every <video> gets cleanup, crash memory),
  canvas tiles → FaceDetector (grids 2/4, +6 when min(dim)<1200), then
  consensus + world classify + band/region snap ported 1:1 from the gate's
  snap.js (proven constants: quiet/loud ≥2.5, qTheta abs 6-10, theta
  max(10,6·med), dilate r1, trim 0.12, refusal caps).
- NEW vs gate: native-res edge refinement — after the coarse rect, re-search
  each edge ±60px at full res on 2 sampled frames (fixes v3's 54px shave).
- Output: `{world: 'stacked'|'overlay'|'nocam'|'none', camRect, gameRect,
  confidence, faceBox}` — 'nocam' = detector confident no static face
  (≤1 frame hits after consensus), 'none' = refusal (face found, region
  failed). Preload bridge: `clipflow.reframe.detect(projectId)`.
- Verify (B1): dev app console/IPC call on the three real videos reproduces
  the gate proposals (v1 0-2px vs saved layout); packaged exe (`npm run
  build` + install) runs detection with network disabled; `npx asar list`
  shows detect.html + mediapipe assets.

### B2 — "Detect layout" in the Layout panel (face path) — ✅ SHIPPED (session 108)

**Built per spec, CDP-verified end-to-end on the dev sandbox. Results:**
- [Detect layout] button above the boxes in the calibrating view →
  "Analyzing 8 frames…" disabled progress state → stacked/overlay proposals
  prefill the draft via updateReframeDraft (both rects); green status row
  "Found your webcam — adjust or Apply". world 'none'/'nocam' → existing red
  error row: "Couldn't detect this layout — place the boxes manually."
  ('nocam' gets its preset path in B3.) IPC-level errors surface raw in the
  same red row (panel idiom, same as Apply errors).
- Post-await staleness guards: result dropped if calibration closed or the
  project switched mid-run (project-id + draft-null checks via getState());
  stale status line cleared when calibration closes.
- Verified (CDP UI drive, dev profile, proj_polish_real RL Main 2560×2880):
  Detect → cam {0,0,2560,1442} — identical to B1/gate, Δy11/Δh13 vs Fega's
  taste-nudged saved entry — game = complement band {0,1442,2560,1438};
  Apply → "RL Main" entry updated IN PLACE (library stayed 2 entries, no
  duplicate), project.json persisted, panel returned to active view. Error
  path: killed the detect window mid-run → red row "Detection window closed",
  button recovered, follow-up run completed clean. Engine log: stacked,
  confidence 0.943, 8/8 frames.
- NOT footage-tested: the world='none'/'nocam' message branch (no face-free
  source on hand) — 3-line reviewed branch; the red-row mechanism itself is
  proven by the kill test.

Original B2 spec (implemented 1:1 — "updateReframeRect" in the spec text is
updateReframeDraft in shipped code):
- RightPanelNew.js calibrating view: [Detect layout] button above the boxes
  block → "Analyzing 8 frames…" progress state → outcome A (stacked/overlay):
  prefill draft camRect/gameRect, status line
  "Found your webcam — adjust or Apply"; outcome 'none': red-box message
  "Couldn't detect this layout — place the boxes manually" (existing error
  row). 'nocam' handled in B3 (until then: same manual message).
- No store schema changes: detection writes into the existing reframeDraft.

### B3 — Game-only layouts + the two no-cam presets — ✅ SHIPPED (session 109)

**Built per spec, verified end-to-end (parity harness + CDP UI drive + two real
renders). Results:**
- camRect null end-to-end: projects.js whitelist copies null (104 trap),
  render.js/PreviewPanelNew center the game band (y=(1920-band)/2) or go
  full-fill when band ≥1916 (≤1924 → scale absorbs slop; taller → centered
  1920 crop, no distortion), store copy sites null-guarded ({...null} === {}
  trap in commit/entry/apply/ai-pipeline — all four fixed), calibration
  overlay skips the cam box, panel hides the Webcam row.
- Presets in reframeStyle.js (CJS like the rest): presetFullyZoomed = largest
  centered even-rounded 9:16 crop (2560×2880 → {470,0,1620,2880} — matches
  the session-105 cover framing; 1920×1080 → {657,2,606,1076} band 1918);
  presetFitToScreen = full frame. Chips row ("No webcam?") in the calibrating
  view when draft is fresh OR detection returned 'nocam' OR draft already
  game-only (spec-completing addition so saved game-only layouts can switch).
- handleDetect: 'nocam' split from 'none' — nocam sets a green status
  ("No webcam found — pick a game-only layout below") + forces chips;
  'none' keeps the red manual-fallback row.
- Parity: 8/8 pre-existing filter cases byte-identical (no-reframe, stacked
  default + styled seam-0, overlay, corrupt/undefined shapes). Cam layouts
  render through the exact pre-B3 filter text (gameY === camBand).
- Verified (CDP, dev build): chips fresh/hidden-on-cam-draft/shown-on-null-cam;
  both presets prefill exact rects; game box drag after preset (470→708 on a
  40px drag — presets stay starting points); Apply → project.json + library
  entry persist camRect null; edit-existing routes to null-cam draft with
  seeded name; RL Main cam layout re-applied cleanly after (regression);
  composite paints full-bleed / letterbox correctly (pixel probes + shots).
- Real renders (proj_spike164_reframe, 1920×1080@60): Fit to screen →
  1080×1920@60, sharp band centered at y=656 over blurred+darkened bg,
  feathered bottom edge, subtitles composited. Fully zoomed → 1080×1920@60
  edge-to-edge, no bg/feather stages. Both via the app's Render button.
- Live-fired the 'none' refusal E2E by accident of footage: the synthetic
  test pattern triggers ~30 spurious MediaPipe faces/frame → segmentation
  fails → clean world:'none' → manual message (designed posture). world
  ='nocam' (zero face hits) remains footage-untested — 3-line reviewed
  branch; the chips mechanism it triggers is proven via the other two paths.
- Found + filed #166 while verifying (pre-existing, NOT B3): preview fitSize
  stays null until the first resize on the Open-in-Editor path — calibration
  boxes invisible until any panel/window resize. Diff-disjoint from B3.
- Dev sandbox state after: proj_polish_real back on RL Main; SPIKE project on
  "Old HD Canvas"; library gained two game-only test entries ("Game Only
  8x9", "Fit Test HD") — useful for B4 testing.

Original B3 spec (implemented 1:1):
camRect becomes nullable end-to-end ("game-only" layout):
- `src/main/projects.js:265` updateReframe: accept camRect === null
  (whitelist copies null; gameRect still required) — the 104 whitelist trap,
  handled deliberately.
- `src/main/render.js:58,87-93,154-177` isReframeActive drops the camRect
  requirement; camBand=0 when null; game band overlays CENTERED
  (y=(1920-gameBand)/2) instead of below the cam; feather/bg skip when
  gameBand ≥ 1916 (fully-zoomed fills the frame). Null-reframe parity guard
  re-run (existing projects byte-identical).
- `PreviewPanelNew.js:917,1244-1329` compositor mirrors the same math;
  calibration overlay renders only present boxes (skip cam when null).
- `reframeStyle.js`: `presetFullyZoomed(srcW,srcH)` (gameRect = centered
  even-rounded 9:16 crop, camRect null) + `presetFitToScreen(srcW,srcH)`
  (gameRect = full frame, camRect null). CJS exports like the rest (main +
  renderer both consume).
- Panel: preset chips row in the calibrating view when draft is fresh OR
  detection returned 'nocam' — [Fully zoomed] [Fit to screen] chips (existing
  chip idiom, no new aesthetic) prefill the draft; everything stays draggable
  /tunable/saveable (presets are starting points, not modes). Fully-zoomed
  game box: horizontal pan = drag (box keeps 9:16 W:H lock? NO — keep
  free-form per editor conventions; preset just places it).
- Library/store: entries with camRect null save/apply/star normally
  (dims guard unchanged); useEditorStore draft tolerates null cam.
- Verify (B3): real renders of both presets from a horizontal source (mode 1
  fills 1080×1920 edge to edge; mode 2 letterboxed with blurred bg matching
  preview); CDP: chip → draft → Apply → persists → reload; null-reframe
  parity; existing cam layouts regress nothing (render v1 project again).

### B4 — First-recording auto-offer — ✅ SHIPPED (session 110). PHASE B COMPLETE.

**Built per spec below, verified end-to-end. Deltas + results:**
- Decision rule extracted as pure CJS `shouldOfferReframe({sourceWidth,
  sourceHeight, reframe, layouts, dismissed})` in `reframeStyle.js` —
  17-case node matrix passes (8:9-must-offer, 9:16 ±1% skips, entry-match,
  dismissed, undecidable/garbage dims → false, non-array tolerance).
- Banner lives in `PreviewPanelNew.js`: floats top-right over the preview
  (spec's "over the preview/right rail"), Crop icon + spec copy + [Set up]
  [Not for this format]. Evaluated once per project open; latch absorbs
  later condition flips (removing a layout mid-session does NOT resurface
  it). Extra suppressions beyond spec: source-preview shells
  (`__source_preview__`) and Media Offline. Dims resolve probe-fields-first
  then the live `<video>` (readyState-guarded — a src swap reports 0×0, so
  stale element dims can never latch a wrong decision; pre-#164 projects
  with null probe fields re-evaluate when metadata lands).
- [Set up] = `beginReframeDraft()` + one-shot `reframeAutoDetectPending`
  store flag + open Layout drawer; LayoutPanel consumes the flag on mount
  and fires the SAME `handleDetect` as the B2 button (cleared before the
  call; `detecting` guard is the second belt; flag also cleared on cancel
  and clip load). Zero duplicated detection logic.
- "Not for this format" appends `"WxH"` to `reframeOfferDismissed` —
  main.js defaults + migration (the spec's "settings whitelist" doesn't
  exist; `store:set` is generic, so defaults + migration is the whole job).
- Verified (CDP drive, dev build, real footage): banner on proj_polish_real
  with reframe detached + 2560×2880 entries stashed → [Set up] opened the
  drawer mid-"Analyzing 8 frames…" → auto-detect returned the EXACT gate
  rect (cam {0,0,2560,1442}, world stacked, conf 0.943, log-confirmed) with
  green status + chips; Cancel → banner stays away (once-per-open); fresh
  reopen → banner → [Not for this format] → gone + store `["2560x2880"]`;
  reopen → suppressed; app relaunch → still suppressed; dismissed cleared +
  entries restored → entry-match suppresses; RL Main reframe restored →
  reframe-attached suppresses + composite paints (regression clean); LIVE
  9:16 skip on proj_spike164_916 (banner absent). Zero renderer exceptions
  both runs. Dev sandbox fully restored (RL Main re-applied, 4 library
  entries, dismissed []).

Original B4 spec (implemented 1:1 modulo deltas above):
- Trigger: editor opens a project whose source is non-9:16 AND
  project.reframe == null AND no dims-matching library entry AND dims not in
  the dismissed list.
- UX: banner over the preview/right rail: "New recording format — set up a
  vertical layout?" [Set up] [Not for this format] — Set up switches to the
  Layout tab, auto-runs detection, lands in calibration prefilled (boxes or
  preset chips per outcome). "Not for this format" persists the dims to
  `reframeOfferDismissed` (electron-store, main.js defaults + settings
  whitelist — new key, migration-safe default []).
- Verify (B4): CDP: fresh-dims project shows banner once → Set up →
  prefilled calibration; dismiss persists across relaunch; 9:16 project and
  dims-matched projects never see it.

### Cross-cutting
- Renderer detection module is page-scoped (detect.html) — no editor imports
  of mediapipe, so no build.files additions beyond build/ (already shipped).
- Version/installer: one cut after B4 + CHANGELOG; sizing decided at wrap
  (epic-completion candidate for the 0.2.0 line once Fega verifies on his
  real workflow).
- Risks watched: CSP scoped to detect.html only; hidden <video> teardown;
  Vite ESM-only rule untouched (detect page bypasses Vite bundling); dev-mode
  URL vs loadFile dual-path for detect.html (mirror main-window logic).

### Original approved plan (for reference)

Order flip APPROVED (auto-offer = final Phase B slice). Gate footage supplied
by Fega (real, replaces most of the manufactured set):
1. Stacked 2560×2880 (current): `W:\YouTube Gaming Recordings Onward\Recordings\Arc Raiders\2026-07\2026-07-15 13-30-36.mp4`
2. Old vertical canvas: `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\2026-03\2026-03-02 RL Day6 Pt2.mp4` (robustness only — true 9:16 skips reframe in-product)
3. Old horizontal + overlay cam (THE target-customer case, 15GB — frame-extract in place, never copy): `W:\YouTube Gaming Recordings Onward\Recordings\Arc Raiders\2025-12\2025-12-16 AR Day 3.mp4`
Manufactured small-cam variants still get built from these for the 120–300px sweep.

Revised 2026-07-16 against shipped Phase A reality (named layout library,
apply-and-save, style system, aspect-agnostic sources). The Phase B text in
#164 predates all of that. Core unchanged: detect ONCE per layout, static
boxes only, fully local, manual stays the guaranteed path.

**Reality checks that reshaped the plan**
- Fega's real layout (prod library = ground truth): source 2560×2880,
  camRect = full top half (0,0,2560,1440), gameRect = bottom band with taste
  insets (144,1433,2273,1447). STACKED canvas, giant cam — trivially
  detectable. The hard case (100–300px overlay cam on 1920×1080) is the
  target customer, and we own NO such footage — it must be manufactured.
- No vision deps in package.json yet; renderer is Vite/ESM-only (no
  require()); MediaPipe WASM + model must bundle locally (no CDN) and load
  from inside the packaged exe — verify with asar list, not build.files.

**Plan updates vs the original #164 Phase B section**
1. Two-world proposal rule after cam detection: cam = floating island →
   game = full frame (overlay world); cam spans a full-width/height band →
   game = complement band (stacked world, Fega). Geometry only, no game-box
   ML. Taste insets are the user's nudge, not detection's job.
2. Integration = the shipped library flow: trigger when source dims match no
   library entry, plus a manual "Detect" button in the layout editor
   (calibrating view). Proposal lands as a normal draft; the existing
   apply-and-save upsert names it ("WxH — Detected"). Detection proposes
   RECTS ONLY — style (blur/darken/zoom/pan) untouched, comes from
   defaults/library as today.
3. Sequencing flip [NEEDS FEGA OK]: detection core ships first; the parked
   first-recording auto-offer slice (approved session 103) becomes Phase B's
   FINAL slice and consumes detection (offer opens calibration pre-filled).
4. Gate ground truth: score proposed rects against Fega's saved rects —
   cam box scored strictly (edge distance), game box scored on correct
   world-classification only (his insets are taste). Manufactured 1080p set
   from his own footage: cam band scaled to ~120/200/300px, composited over
   the game band at corners; bordered / borderless / rounded variants.
   Answer keys exact by construction.
5. Fallback corrected: MediaPipe full-range model + tiled 2× scan for small
   faces first; if recall still fails → YuNet via onnxruntime-WEB (WASM in
   renderer). onnxruntime-node (native module = packaging risk) is OFF the
   table — the original plan named it in error.
6. Packaging checkpoint moves INTO the gate: the harness is a headless
   Electron page (session-104/105 pattern, window-all-closed guard) loading
   @mediapipe/tasks-vision WASM from local files — proves in-app + packaged
   loading on day one.

**Gate — step 1, zero src/ changes**
- FFmpeg-extract ~8 frames (spread 10–90% of duration, skipping stream-start
  scenes) from 2–3 real recordings + the manufactured 1080p set.
- Harness runs detector → consensus-cluster face hits → snap outward to the
  cam border via a pixels-that-never-change (temporal variance) edge map →
  proposed camRect/gameRect per source.
- Report: found/missed per cam size, mean nudge px, proposal-overlay
  screenshots. Go/no-go on the fallback detector.
- Pass criteria: Fega's cam found in ≥7/8 frames with proposed cam edges
  within ~2% of frame dims vs saved rects; manufactured 200px+ cams found
  reliably; failures are clean no-proposals, never confident wrong boxes.
- Outputs live in the session scratchpad; nothing ships until the gate
  passes and Fega approves the build slice.

---

## DONE (FEGA-CONFIRMED on installed alpha.5) — #164 polish round 3 (session 105b)

Two items from Fega's alpha.4 pass, implemented by Fable directly (no
subagents — policy reversed this session). CDP v4 pass: 19/19, zero
exceptions — active view names the layout, Save button gone, pencil rename
persists, Name prefills from the linked entry, 6 panel sliders load persisted
values, pan sliders drive + persist (H=100/V=0), Apply renames + updates the
entry with no duplicates and without touching the default.

**1. Naming folds into Apply — the "Save layout" button dies.**
- The layout editor (calibrating view) gets a **Name** field, prefilled with the
  layout's current name (or "Layout N" for a fresh one), sitting right above
  Apply/Cancel.
- **Apply layout** now does everything in one click: applies to the clip AND
  saves/updates the named layout in the library (first-ever still becomes the
  default; after that ★ controls it). Draft carries `name`; commit runs the
  existing upsert+link logic (kills the separate save flow).
- Active view: shows the layout's name in the status line ("'RL Dual Band' is
  active…"); buttons reduce to [Edit layout] + Remove. Save-row states deleted.
- Saved layouts list: **pencil icon per row → rename inline** (Enter/blur
  saves) — rename without touching boxes. Apply-on-click/★/dimmed rows stay.
- Consequence (intended): re-applying after a tweak keeps the linked library
  entry current — the layout stays maintained, no duplicates.

**2. Pan gets real controls.**
- Two sliders under Zoom in "Background & edge": **Horizontal** (left↔right)
  and **Vertical** (top↔bottom) — they drive the same bgPosX/bgPosY the render
  reads. Live preview like every other slider.
- The drag-the-Result gesture stays as a bonus, but sliders are the primary,
  visible path (drag-only failed the discoverability test on Fega's pass).

Files: RightPanelNew.js (panel UI), useEditorStore.js (draft name +
commit-with-save merge), reframeStyle.js untouched (bgPosX/Y already exist).
Verify: build + CDP pass (apply-saves-with-name, sliders persist, rename row)
→ cut **0.1.9-alpha.5**.

---

## DONE (FEGA-CONFIRMED via alpha.5) — #164 polish round 2 (session 105)

Fega's four items from his alpha.3 pass, all shipped in **0.1.9-alpha.4**:
1. ✅ Shadow edge option removed (Fade is the only edge treatment; stored
   "shadow" values resolve to fade; migration cleans library entries).
2. ✅ Background no longer stuck on the floor: new default = 2× zoom centered
   on the game box (`bgZoom 50 → 2.0×`, `bgPosX/bgPosY 50/50`).
3. ✅ New controls: Zoom slider (0–100 → 1×–3×) + drag the Result preview to
   reposition the background (content-follows-pointer, clamped, live).
4. ✅ Named layouts: "Save layout" opens a name field (prefilled); "Saved
   layouts" list in the panel (apply on click, ★ default toggle, dimmed rows
   on dimension mismatch, "In use" tag); re-save updates in place (duplicate
   bug fixed by writing layoutId back onto the project after first save).

### Implementation (delegated to 2 Sonnet subagents, reviewed line-by-line)
- All window math in `reframeStyle.js` (`bgSourceWindow`) — parity by
  construction; engines just consume the integer window.
- `render.js` bg chain: `crop=<win>,scale=270:480,…` replaces the
  cover+center-crop pair; shadow branch deleted.
- `PreviewPanelNew.js`: scratch draws the same window; shadow branch deleted.
- `RightPanelNew.js`: chips out, Zoom slider in, Result drag (pointer capture,
  buttons-guard, pointercancel), save row, `SavedLayoutsList`.
- `useEditorStore.js`: `saveReframeLayout(name)` (upsert + link-back +
  default-only-if-none), `applyReframeLayout(entry)` (dims guard).
- `main.js`: layout-library migration re-resolves style (adds bg fields,
  drops seam) — idempotent, fresh-install no-op.

### Verification evidence (session 105)
- `bgSourceWindow` node checks: zoom 0 == old cover framing EXACTLY
  ({470,0,1620,2880} on the 2560×2880 canvas); default = centered half;
  clamps + even-rounding hold on degenerate rects.
- Filter args: no-reframe path has zero `rf_` tokens (byte-identical);
  default style → `crop=810:1440:875:720`; blur=0/darken=0 stages drop;
  zero shadow tokens.
- CDP drive (dev app, proj_polish_real): 22/22 v3 + drag proven in v2
  (pointer counts, pos 36/29 in drag direction, fling clamps safe), zero
  renderer exceptions across all runs. Library migration verified live
  (dev entry gained bg fields, lost seam, kept blur/darken).
- Real render (`RL 2026-07-15.mp4` clone): FFmpeg args contained the
  hand-computed `crop=272:482:838:1713`; frame grab shows correct composite
  (bands + feather + chosen bg region + subtitles).
- Driver gotchas for the record: editor top bar has its own "Save" button —
  scope clicks to the inline row; the Result box needs `scrollIntoView`
  before CDP pointer events land; the timeline zoom slider is a 5th
  `[role=slider]` — scope slider asserts to the panel.

### Fega's verification pass (0.1.9-alpha.4)
- Background sits on the action by default; Zoom slider + dragging the small
  Result preview reposition it.
- Shadow chip gone.
- Saving asks for a name; list picks/applies; ★ moves the default.

### Deferred / parked (carried)
- First-recording auto-offer slice (approved, session 103), Projects-tab
  preview consistency, Phase B (MediaPipe pre-fill), #165 zoom tuning,
  #163 YouTube reconnect messaging, old waveform cache cleanup, session-102
  waveform regression check.
