# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

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

Next: build slice (detection module in editor + "Detect" button pre-filling
calibration draft + dims-mismatch trigger), then auto-offer slice consumes it.

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
