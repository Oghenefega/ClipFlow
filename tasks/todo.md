# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## 🔄 ACTIVE (session 134) — Media assets: SFX, music & pictures on clips → **epic #201**

**Decisions (Fega, via question UI, 2026-07-27):**
1. Build order after Phase 1: **sounds first** (pictures after).
2. "Sound Effects Folder" setting: **auto-scan it** — files in that folder
   appear in the SFX tab automatically (linked in place, not copied).
3. Music v1: **manual volume slider + fades**; auto-duck parked.

**Phase 1 (asset library) BUILT + verified (session 134).** New
`src/main/assets.js` + `assets:list/import/delete/favorite` IPC + preload
bridge; Audio panel wired to real data (tabs, search, All/Favorites pills,
upload, click-to-preview, two-click delete); Upload drawer drop zone + button
import for real, images listed with thumbnails; SFX-folder auto-scan live
(folder files linked in place, absorbed into the index so favorites persist,
pruned when removed); `dialog:openFile` learned `properties` passthrough
(multi-select; existing single-select callers unchanged).

**Verified via CDP on the dev-profile app (built renderer):** import inference
(2s wav → sfx, 95s mp3 → music, png → image, .txt refused with reason),
folder scan absorption, favorite persistence, folder-item delete refused with
friendly message, library delete removes index entry + copied file, editor
clip-open clean (no crash), both panels render real data, play/pause preview
works, image thumbnail loads. Test assets cleaned off the real W:\ tree
afterward (dev projectsRoot points at it!) and dev sfxFolder reset.

**Not yet exercised:** real drag-and-drop onto the Upload drawer (CDP can't
synthesize OS file drags — getPathForFile path is shared with the verified
dialog flow); Fega's first real look (no installer cut — batching per policy;
"Add to timeline" + is visibly disabled with a "coming with the sounds
update" tooltip until #202).

**Next: #202 (sounds on clips), then #203 (pictures).** Both filed with full
scope + risks (render.js input-index arithmetic; overlay frame-skip
signature).

Original plan below.

## 📋 PLAN (session 134, approved) — Media assets: SFX, music & pictures on clips

**Ask:** add sound effects, music, and pictures to clips in the editor so they
help sell the clip more, and have them baked into the final rendered video.

### What's already there (surprise finding)

The editor UI already ships shells for exactly this feature — none wired:

- **Audio panel** (rail icon lives) with Music/SFX tabs, search, 9 filter
  pills, favourite + "Add to timeline" hover buttons — permanently empty:
  `DEMO_TRACKS = []` with a self-documenting comment (`RightPanelNew.js:835`).
- **Three inert drop zones**: Brand Kit Logos/Images/Outros
  (`RightPanelNew.js:1146/1154/1162`) and the Upload drawer's "Drop images,
  videos or audio here" (`:1707`). All share a decorative `DropZone`
  (`:673-691`) whose onDrop reads nothing — files dropped today vanish
  silently with no error.
- **Dead "Audio 2" timeline row** — "Drop audio or click to add" button with
  no onClick and no drop handlers (`TimelinePanelNew.js:1191-1207`).
- **"Sound Effects Folder" Settings picker** persisted but read by nothing
  (`SettingsView.js:448-460`, `main.js:223`).
- Every clip is created with `sfx: []` and `media: []` fields no code reads
  (`projects.js:441-442`, `ai-pipeline.js:848-849`) — pre-allocated slots.

So the browse-UI skeleton is ~half built; the data layer, import plumbing,
preview playback, and render compositing are all missing.

### Expanding the brief ("sfx, music, pictures, e.t.c")

**In scope (three phases):**

1. **SFX** — short one-shot sounds (airhorn, vine boom, whoosh) dropped at a
   moment, with per-placement volume.
2. **Music** — a background track under the whole clip, volume slider +
   fade-in/out, trimmable start offset.
3. **Pictures** — static images (reaction memes, emoji, arrows, logo) shown
   for a time range, dragged to position/size on the preview.

**Deliberately parked (named so they aren't forgotten):**

- Animated GIFs/stickers — the burn-in renderer rebuilds its DOM every frame,
  so animation must be a pure function of time and join the frame-skip
  signature (`overlay-renderer.js:328-369`); same trap #148 hit. Static first.
- Video overlays / outro cards (the Brand Kit "Outros" stub).
- Auto-ducking music under voice — v1 is a manual volume slider.
- A bundled royalty-free SFX/music pack — licensing question for a commercial
  product; v1 is bring-your-own-files.
- TikTok trending-audio browsing.

### Key design decisions

1. **Anchoring.** SFX and pictures anchor to **source time** (like subtitles):
   trim or reorder sections and they stay glued to their moment. Music anchors
   to **timeline time** (like captions): it spans the clip regardless of cuts.
   This mirrors the split that already exists in the codebase
   (`useEditorStore.deleteSpanWithClip:443` branches on exactly this).
2. **Storage.** Imported files are **copied** into a ClipFlow-managed assets
   library (`{libraryRoot}/.clipflow/assets/` + a JSON index) so clips never
   break when the original file moves. Per-clip placements live on the clip
   record — reviving the dead `clip.sfx` / `clip.media` fields, saved by
   `_doSilentSave` alongside `nleSegments`.
3. **Pictures ride the existing subtitle burn-in path.** The offscreen overlay
   page already streams transparent PNGs composited over the full frame
   (`render.js:230-238`) — an image layer there needs **zero FFmpeg changes**
   and inherits WYSIWYG for free (same JS renders preview and burn-in).
   `DraggableOverlay` (`PreviewPanelNew.js:355`) already provides
   drag-to-position + resize with percent coords.
4. **Audio is genuinely new plumbing on both sides.** Preview: the single
   `<video>` is today the only clock and audio source; SFX/music need `<audio>`
   elements synced to the playback loop across NLE cut-seeks (with unmount
   cleanup — standing rule). Render: extra FFmpeg inputs with per-placement
   delay/volume mixed into the base track (`adelay`/`volume`/`amix`) — none of
   which exist in any filtergraph today.

### Phases

**Phase 1 — Asset library (the shared foundation)** ~1 session
- New `src/main/assets.js`: import (copy + index), list, delete; IPC + preload
  bridge. Audio duration probed on import (existing ffprobe helpers).
- Wire the Audio panel to the real library (Music/SFX tabs, search, filters,
  favourites). Wire the Upload drawer drop zone + upload buttons to import.
  Wrong-type drops get visible feedback instead of silence.
- Settings "Sound Effects Folder": auto-scan into the SFX tab (open Q below).

**Phase 2 — Sounds on clips** ~1-2 sessions (the big one)
- Placement model + store state (undo via the shared undo stack).
- "Add to timeline" from the Audio panel drops at the playhead; the dead
  "Audio 2" row becomes a real lane showing SFX/music blocks (drag to move,
  trim, delete, right-click menu; volume + fades in a small popover).
- Preview playback: synced `<audio>` elements following the rAF clock.
- Render: per-placement inputs + delay/volume + mix into `[base_a]`.
  **Risk:** input-index arithmetic — the overlay PNG pipe is currently "index
  N after N segments" (`render.js:120,233`); new inputs shift it. Also
  `renderThumbnail` reuses the graph with `{audio:false}` — must stay working.
- Persist to `clip.sfx`, restore on load.

**Phase 3 — Pictures on clips** ~1 session
- Place an image from the panel at the playhead (default a few seconds,
  adjustable range), drag/resize on the preview via `DraggableOverlay`.
- Render: add image layer to the offscreen overlay page
  (`__OVERLAY_CONFIG__` → `overlay-renderer.js`) + matching React layer in
  `PreviewOverlays.js` + frame-skip signature term. **Risk:** the overlay
  page must be able to load asset files via `file://` (check its CSP).
- Persist to `clip.media`, restore on load.

### File impact

- **Phase 1:** new `src/main/assets.js`; `main.js` (IPC); `preload.js`;
  `RightPanelNew.js` (AudioPanel/UploadPanel/DropZone wiring).
- **Phase 2:** `useEditorStore.js` or new `useAssetStore.js`;
  `TimelinePanelNew.js`; `PreviewPanelNew.js`; `render.js`;
  `utils/renderPayload.js`; `projects.js`; `preload.js`.
- **Phase 3:** `PreviewOverlays.js`; `public/subtitle-overlay/overlay-renderer.js`;
  `src/main/subtitle-overlay-preload.js`; `src/main/subtitle-overlay-renderer.js`;
  `projects.js`.
- Cross-tree/bundling: no new cross-tree requires planned; if any appear they
  must respect `build.files` (project CLAUDE.md rule).

### Verification

**What I do (per phase, before handover):**
- Unit tests for placement↔timeline mapping (trim before an SFX → it stays on
  its moment; reorder sections → same).
- `npm run build:renderer` + `npm start`: import files, place an SFX + music +
  image, confirm preview plays/shows them at the right times; reopen the clip
  → everything persisted; render the clip → extract the output's audio/frames
  and confirm the SFX lands at the right second, music sits under it, image is
  visible in the right spot; render a clip with NO assets → byte-path
  unchanged (no regression to plain renders or thumbnails).

**What Fega does (on the next installer):**
- Import a few of his own sounds + a meme image. Drop an airhorn on a goal,
  music under a clip, the image over a moment. Check: preview matches the
  final render, placing things feels quick, and a trimmed clip keeps the
  sound on the right moment.

### Open questions for Fega

1. **Build order after Phase 1:** sounds first (what you named first; the big
   gap) or pictures first (quicker win, ~1 session to something usable)?
2. **The dead "Sound Effects Folder" setting:** repurpose it — anything you
   drop in that folder auto-appears in the SFX tab (recommended) — or remove
   it and import only through the app?
3. **Music v1:** manual volume slider + fades (recommended, simple), or is
   auto-duck-under-voice worth doing now?

---

## ✅ BUILT, AWAITING A LIVE POST (session 130) — automatic 720p fallback → **#189**

Plan in [#189](https://github.com/Oghenefega/ClipFlow/issues/189). **Supersedes the manual
button scope of [#187](https://github.com/Oghenefega/ClipFlow/issues/187)** — Fega reversed
that call: the switch to 720p happens automatically now, with a durable record each time it
fires. Trigger: on clips over ~55s, one full-quality attempt instead of three, then fall
back. Short clips untouched.

**Verified:** 22 assertions green (13 stubbed-network classification + 9 against the live
Graph API). Badge and both Publish Log lines confirmed rendering in the running app via
CDP against an isolated sandbox project. Renderer builds; app boots clean.

**Not yet exercised:** the success path end-to-end — a real long clip actually failing at
1080p and landing at 720p — needs a live Instagram post. Same gap #185 had at ship time.
The live-progress line is in the same bucket (it only renders mid-publish).

Blocked on nothing. The real fix is [#186](https://github.com/Oghenefega/ClipFlow/issues/186)
(hosted delivery), still an open decision.

### Shipped, superseded (session 129) — 720p copy button → **#187**

The click-only button shipped in 0.3.0-alpha.17. #189 makes it automatic; recommend
keeping the button as the escape hatch for when the automatic fallback itself fails.

## ✅ DONE (session 128) — Reorder sections on the timeline (#184)

All five phases built and verified in the running app (dev profile, built renderer
— the daily driver was open, so the single-instance lock ruled out `npm start`).

**Verified:** 91 unit tests green (74 pre-existing unchanged); dragged the third
of three sections to the front → subtitles followed, duration unchanged; one
Ctrl+Z reverted it; playback crossed both seams monotonically (10.9 → 12.0 →
14.0); order survived an app reload; "Move section later" from the right-click
menu reordered correctly and greyed out at the ends; a subtitle deliberately
split across a cut clipped cleanly instead of glitching; click-to-seek on the
waveform still works. Rendered the reordered clip: 30.03s out, frame at 1s
matches source 19s, frame at 13s matches source ~2s with the right burned-in
subtitle.

**Found during verification:** the subtitle mapping returned segments in
recording order, so the karaoke word index and Transcript panel tracked the
wrong word once sections were reordered. Fixed by sorting the mapped output by
timeline position (no-op on an unreordered list).

Original plan below.

---

## 📋 PLAN (session 128) — Reorder sections on the timeline

**Ask:** move a section of a clip in front of another (10s–14s plays before 0s–9s).
Subtitles must follow the section.

**Scope decisions (Fega, session 128):**
1. Drop behaviour = **insert / gapless ripple**. No free placement, no gaps.
2. On-screen captions stay pinned to timeline time — they do **not** follow a moved
   section. Revisit only if it turns out to be annoying in practice.
3. **Duplicating sections is cut** — not worth the ambiguity it creates on the
   timeline. Alt+drag duplicate is out of scope; the whole per-occurrence subtitle
   mapping rewrite (old Phase 3) is dropped with it.

### Where this lands

The video/audio blocks on the **Audio track** (the orange waveform lane) are the
"sections" — one block per NLE segment. Today they can only be trimmed at the
edges, split, and deleted. They can't be picked up and moved, and they can't be
duplicated. Everything below is about that lane. The Subtitle lane already has
free drag + Alt+drag duplicate (SegmentBlock), so it needs no new gestures.

### What already works in our favour

`nleSegments` is an **ordered list**; timeline position is derived by summing
durations in array order (`timeMapping.sourceToTimeline`). So:

- **Reordering is a pure array move.** No coordinate math changes.
- **Subtitles follow a reorder for free.** Subtitle times are source-absolute and
  projected through the ordered segment list on every read, so moving a segment
  moves its subtitles with it — no subtitle data is touched.
- **Render is already order-agnostic.** `render.js` emits one `-ss/-t` input per
  segment in array order and concats them (`buildNleFilterComplex`). A reordered
  or duplicated list needs zero render changes.

### What genuinely breaks, and why

Three places assume the segment list is in **recording order**. Reordering makes
that false. None of them are large, but all three are silent failures if missed.

1. **Extend clamps against index-neighbours.** `extendSegmentLeft/Right`
   (`segmentOps.js:139,169`) treat segment i-1 / i+1 as the source-time
   neighbour to clamp against. After a reorder that's the wrong segment, so
   dragging a section's edge outward would stop early or overlap another
   section's footage. Must clamp against the nearest segment in *source* order.

2. **The playback gap-recovery searches in source order.** Normal segment-to-
   segment advance is index-based and already correct
   (`usePlaybackStore.mapSourceTime:159`). But when the video drifts into a
   deleted span, the fallback picks the segment with the next later *source*
   time (`usePlaybackStore.js:179`, mirrored in `ProjectsView.js:193`) — which
   after a reorder can be somewhere else entirely, so playback jumps. Must
   recover in *timeline* order.

3. **A subtitle straddling a cut point maps to an inverted range.** Today a
   subtitle whose start is in section A and end in section B renders as one
   continuous block, because A and B are adjacent on both the timeline and the
   recording. Reorder them and the start maps late while the end maps early —
   `timelineEnd < timelineStart` — producing a negative-width block
   (`visibleSubtitleSegments:264`). Fega's 1–3 word chunks are short, but a cut
   lands inside one often enough to matter. Fix: when the mapped range inverts
   (i.e. the two segments are no longer contiguous), clamp the subtitle to the
   section containing its **start** and clip the tail. Behaviour on an in-order
   list is byte-identical, so trimmed clips are unaffected. Same guard for
   `visibleWords`.

### Phases

**Phase 1 — Model op + order-safety fixes** (`models/segmentOps.js`, `models/__tests__/nleModel.test.js`)
- `moveSegment(segments, segmentId, toIndex)` — pure array reorder.
- Fix `extendSegmentLeft/Right` to clamp against the nearest segment in *source*
  order rather than array-index neighbours.
- Unit tests: reorder repositions subtitles correctly; total duration unchanged;
  extend clamps correctly on a reordered list.

**Phase 2 — Straddle guard** (`models/timeMapping.js`)
- In `visibleSubtitleSegments` and `visibleWords`: if the mapped end lands before
  the mapped start, clamp to the segment holding the start. Assert in tests that
  an in-order list produces identical output to today.

**Phase 3 — Playback recovers in timeline order** (`stores/usePlaybackStore.js`, `views/ProjectsView.js`)
- Replace the source-order gap search with timeline-order recovery in both the
  editor store and the Projects preview's own copy of the logic.

**Phase 4 — The gesture** (`components/timeline/WaveformTrack.js`, `TimelinePanelNew.js`, `TrackContextMenu.js`, `stores/useEditorStore.js`)
- Body-drag on a waveform block, mirroring `SegmentBlock.onDragStart` (3px
  threshold before the drag engages).
- While dragging: dim the block and draw an insertion indicator at the drop slot.
- Drop commits a new `moveNleSegment(id, toIndex)` store action wrapped in the
  existing `_pushNleUndo()` so one Ctrl+Z reverts the whole gesture.
- Add **Move left / Move right** to the Audio track right-click menu — a drag
  gesture must never be the only path to a requested capability.

**Phase 5 — Verify**
- `npx jest src/renderer/editor/models` green (existing cases unchanged).
- `npm run build:renderer && npm start`, then on a real multi-section clip:
  1. Split into 3 sections, drag the third to the front → preview plays in the
     new order, subtitles land on the right footage, total duration unchanged.
  2. A subtitle that straddled the cut renders as one clean block, not a glitch.
  3. Ctrl+Z once → fully reverted.
  4. Queue + render the reordered clip → the exported MP4 matches the editor
     preview (order, duration, burned-in subtitles).
  5. Existing trim / split / delete / extend still behave on a reordered list.
  6. Reopen the clip after save → order persisted.

### Risks

- **`clip:concatRecut` (main.js:1473) sorts segments by start time** before
  writing `nleSegments` — it would silently undo a reorder. It is reached only
  from the legacy `rippleDeleteAudioSegment` path, which the current timeline
  doesn't call. Confirm it's genuinely unreachable; if not, drop the sort.
- **Straddle guard touches shared mapping code** (`timeMapping.js`) used by every
  subtitle surface — editor preview, timeline, left panel, Projects preview,
  burn-in render. The existing `nleModel.test.js` coverage must stay green with
  no expectation edits; any test that needs changing means the guard is too broad.

---

## ✅ DONE (session 127) — Fix AI titles & captions (#183)

All four phases built and verified. Issue: https://github.com/Oghenefega/ClipFlow/issues/183
Outstanding: in-app confirmation on the next installer (the single-instance lock
blocked a source launch while the daily driver was open), and Fega's read on
whether the new suggestions are actually usable.

Original plan below, kept for the reasoning.

---


Fega's report: the titles/captions are unusable. He hasn't accepted a single
suggestion in days. Evidence from his own data confirms it, and shows why.

### The evidence

Pulled from `%APPDATA%\clipflow\clipflow-publish-log.json` and
`clipflow-settings.json` (`titleCaptionHistory`, 100 entries):

- 31 distinct titles published. **28 of them he wrote himself.** Only 3
  matched an accepted AI suggestion.
- When he *did* accept one, he then edited it down before publishing:
  - AI: "The sideways jump giveth and the sideways jump taketh" →
    shipped: "The sideways jump giveth and taketh"
  - AI: "A 1-0 lead has never felt less safe" →
    shipped: "1-0 leads never feel safe in Rocket League"
  - AI: "The pass was PERFECT and I still blew it" →
    shipped: "The pass was PERFECT"
  He cuts the second clause every time.
- Length: his published titles average **5.5 words** (range 3-8). AI-accepted
  ones average 7.5 (range 6-9). The prompt spec asks for **5-10 words** — the
  spec itself is calibrated wrong.
- His voice, from what he actually ships: "He STOLE my Goal", "I went
  speechless", "How do I miss that", "I chickened out literally", "The fear in
  my eyes", "All part of the plan", "POV: Your brain turns off mid game".
  Short fragments, plain words, zero constructed wit, one ALL-CAPS word for
  emphasis, sometimes a typo. The AI writes complete two-clause sentences with
  a twist.

### Root causes (three, all independent)

**A. The model has never seen the clip.** Only the transcript text is sent —
`useAIStore._collectClipParams` (src/renderer/editor/stores/useAIStore.js:31-52)
→ `buildUserContent` (src/main/ai/title-caption-prompt.js:259-272). No frames,
no thumbnail, no audio. Meanwhile the *detection* stage already sends peak
frames as images (src/main/ai-prompt.js:365-389). The plumbing exists; the
title stage just doesn't use it.

**B. The prompt is over-engineered into blandness.** The system prompt is
14,207 characters (~3,700 tokens) before the transcript is even read: 3
pillars, 4 drivers, an execution spec, a payoff-integrity section, a batch
spec, 6 worked examples, 11 real-world titles, 11 anti-patterns, and a 13-line
DO NOT list. Stacking that many constraints collapses output variety — the
model optimizes for not-breaking-rules, which is exactly what "slop" sounds
like. The prompt warns against cargo-culting a framework while being one.

**C. There is no voice to copy.** `styleGuide` in his store is **empty**. The
only voice signal is a bare list of past picks with no clip context, capped at
100 entries. And the highest-value signal is thrown away: what the AI offered
vs. what he actually shipped is never recorded (`_perClipCache` in
useAIStore.js:21 is in-memory only, dies on app close).

### Proposed fix — 4 phases

**Phase 1 — Show it the clip (frames).**
Send 3-6 evenly-spaced frames from the clip's cut window to the title/caption
call, the same way detection does. Extract on demand via FFmpeg, cache per
clip so regenerate/rephrase don't re-pay.
Files: `src/main/ffmpeg.js` (frame extract helper), `src/main/main.js`
(`anthropic:generate` handler ~2411), `src/main/ai/title-caption-prompt.js`
(accept image content blocks), `useAIStore.js` (pass clip id + cut window).
Verify: generate on a clip whose transcript is uninformative (mostly silence
or filler) — suggestions should reference what's visually happening.

**Phase 2 — Rewrite the prompt around his voice, not a framework.**
Cut the system prompt from ~14k chars to ~3k. Keep: the clip-truth gate, the
no-spoiler rule, sentence case, one hashtag, no emoji. Delete: the pillars /
drivers taxonomy, the real-world-titles list, the 6 abstract worked examples,
and most of the DO NOT list. Replace all of it with **20 of his actual shipped
titles** as the examples. Retune the length spec from 5-10 words to **3-7**,
and add an explicit "fragments beat complete sentences — no second clause"
rule (this is the single most consistent edit he makes).
Files: `src/main/ai/title-caption-prompt.js`,
`src/main/data/caption-hook-examples.json`,
`src/main/data/caption-frameworks.md`.
Verify: side-by-side — run the same 5 clips through old and new prompt, show
Fega both sets blind.

**Phase 3 — Start recording real training data.**
New SQLite table `title_caption_rounds`: clip id, game, transcript, the full
3+3 the AI generated, which one (if any) he accepted, the final published text,
and whether he edited it. Log at publish time, not accept time — so
hand-written titles are captured too. Backfill the 31 published titles from
the publish log + `trackerData`. Then Phase 2's examples come from this table
automatically instead of being hardcoded, and improve on their own.
Also: log captions at publish time — right now the publish log stores only
`clipTitle`, so caption history is being lost entirely.
Files: `src/main/database.js` (migration), `src/main/publish.js`,
`src/main/main.js`, new `src/main/title-caption-log.js`.
Verify: publish a clip → row appears with all fields; a hand-typed title is
recorded as `edited: true` with both the AI options and his final text.

**Phase 4 (optional, later) — Close the loop with real numbers.**
`trackerData` already stores YouTube video IDs and Facebook reel URLs for every
published clip. Pull view counts back via the YouTube Data API (already
authorized) and rank the Phase 3 examples by what actually performed, so the
few-shot set is his best titles, not just his most recent.

### What Fega does
Nothing for Phase 1-3 except review. For Phase 2 verification he picks which
of two blind sets reads better. Optionally: if he wants to seed the voice
faster than the data does, paste 10-20 titles he'd genuinely write — but the
31 published ones may already be enough.

### Open decision
Whether to do all 4 phases, or start with Phase 2 alone (cheapest, no new
plumbing, probably the biggest single jump in quality) and judge from there.

---

## 🔄 ACTIVE (session 124) — Pre-alpha.8 batch: viewer screenshot, Recordings auto-refresh, scheduled visibility, Queue blur-save

Render speed work (skip identical overlay frames + FFmpeg streaming) shipped
`6a16202`, closed #180 untested. Four upgrades below join the alpha.8 batch.
Status: DONE — all four built + verified. Decisions (Fega, via question UI):
screenshot = exact-as-final WYSIWYG; DONE = all scheduled (publish is
automatic after); Published gets its own badge. Verified: thumbnail harness
(1.4s, pixel-matches render frame at same t), full-render regression clean
(27/424 frames, 16.3s), renderer build clean, app boots with all four
modified views mounted, no errors. UI behaviors (blur-save feel, NEW chip,
badges on real scheduled clips) await Fega on the alpha.8 installer.

### 1. Viewer screenshot → Shorts thumbnail
What: camera button in the editor preview toolbar. Captures the CURRENT
paused frame and saves a PNG to the render output folder as
`<clip title>_thumbnail.png`, with a toast confirming + click-to-reveal.
OPEN DECISION: exact-as-final (subtitles + reframe layout burned in, ~2-4s,
uses a one-frame render through the real pipeline) vs clean raw frame
(instant, no subtitles) vs a camera button with both options.
How (exact-as-final): new IPC `thumbnail:capture` in main.js — map playhead
timeline time → source time (timeMapping), single pre-seeked FFmpeg input
through the existing filter graph (buildNleFilterComplex, video-only maps),
one overlay PNG at that timestamp via createOverlaySession, `-frames:v 1`.
Files: PreviewPanelNew.js (button), preload.js, main.js, render.js (export a
one-frame seam) or new thumbnail.js.
Verify: screenshot at a karaoke moment → PNG matches rendered output frame
(text, layout, resolution); saved file lands in output folder; toast fires.

### 2. Recordings tab auto-refresh + NEW badge
Root cause: Recordings tab (UploadView.js) loads its file list on mount and
manual refresh only. The file watcher already emits `watcher:fileAdded` /
`fileRemoved` (preload.js:17-25) but only RenameView subscribes (:397).
Renames rewrite files in the watch tree → Recordings list goes stale until
app reload (Ctrl+R).
How: subscribe ONCE at App level (avoids the preload removeAllListeners
stomp between views), debounce-bump a `recordingsVersion` counter, pass to
UploadView → refreshFiles() on change. RenameView's rename-complete path
also bumps it directly (belt + suspenders).
NEW badge: files first seen since the last time the Recordings tab was
viewed get a "NEW" chip + 7-8px glow dot (ui-standards); clears when the
tab is next viewed. Session-only state, nothing persisted.
Files: App.js, UploadView.js, RenameView.js (bump on rename complete).
Verify: rename a batch in Rename tab → switch to Recordings → files appear
without Ctrl+R, wearing NEW badges; badges gone on next visit; new OBS
recording while app open also appears live.

### 3. Scheduled/Published visibility on Projects tab (the brainstorm)
Current truth: clip.status = none/approved/rejected (review), renderStatus
= rendered, SCHEDULED = trackerData row keyed by clipId (+ clip.scheduledAt
until fire time), PUBLISHED = tracker row whose time passed / publish log
success. ProjectsView receives no trackerData at all today — that's the
entire blind spot. "Send to Queue" (editor) = render + approve; every
approved clip auto-appears on the Queue tab; the manual step Fega can't see
from Projects is SCHEDULING.
Plan (recommended):
- Pass trackerData into ProjectsView (App.js already derives scheduled sets
  from it at :650-662 — same zero-new-persisted-state pattern).
- Clip rows/cards gain "Scheduled" badge (purple, with EST date/time) and
  "Published" badge (emerald) alongside Approved/Rendered.
- Project card status becomes three-stage: "N left to review" → "all
  reviewed · N to schedule" (with count of approved-but-unscheduled) →
  "DONE" only when every clip is rejected OR scheduled/published.
- Detail header adds an "Approved" filter-adjacent count: "2 to schedule".
OPEN DECISIONS: (a) does DONE require published or is scheduled enough?
(b) show Published as its own badge or collapse into Scheduled?
Files: App.js (prop), ProjectsView.js (badges, card status, counts).
Verify: schedule one of two approved clips → Projects shows Scheduled on
that clip, card says "1 to schedule"; schedule the other → DONE; published
clip (past tracker entry) shows Published.

### 4. Queue tab: click-outside saves platform text fields
What: editing the YouTube description (and the other per-platform text
fields in the expanded clip panel) saves automatically when the field loses
focus / on click outside — no hunting for the bottom Save button. Save
button removed (redundant-actions rule) with a brief "Saved ✓" flash near
the field (ui-standards: every action needs confirmation).
Files: QueueView.js (expanded panel field handlers).
Verify: edit description → click anywhere outside → collapse/reopen panel
→ text persisted; restart app → still there.

---

## 🔨 BUILT — AWAITING VERIFICATION (built 2026-07-24, session 125, shipped in 0.3.0-alpha.11 alongside the #181 render-collision fix) — Facebook Reels publishing

Spec: `tasks/specs/facebook-reels-publishing.md`. Built as specced: three-phase
`publishReel` + legacy path renamed `publishLegacyVideo` + ffprobe duration router
(3–90s inclusive → Reels, outside → legacy video, probe failure → legacy).
`surface` reaches the publish log; Reels path stores `facebook.com/reel/<id>` in
platformResults; legacy path stores no URL. Error codes 613/190/200/100/6000 get
plain-language messages. Raw status + finish responses logged for the first real
run (Meta's docs are thin on the video_reels status shape — polling parses
tolerantly and proceeds to finish on an unrecognized shape).

**NOT DONE until Fega verifies:** (1) sub-90s clip appears in the page's REELS
tab, (2) log shows `surface: "reels"` + real post ID, (3) tracker link opens,
(4) the 90.73s clip posts as normal video without failing the batch, (5) non-zero
views after 24h — the only check that proves the fix.

**Why:** every video ClipFlow ever posted to Fega's Facebook page had zero views.
Two independent causes. (1) The Meta app was in Development mode, so posts were
visible only to app-role users; Fega switched the app to Live on 2026-07-24 and
Meta un-hides that content retroactively. No code needed, already done. (2) THIS
TASK: `facebook-publish.js:73` posts to `/{page-id}/videos`, the legacy Page video
endpoint, so clips never enter Facebook's Reels distribution surface. Instagram
already does this correctly (`instagram-publish.js:154`, `media_type: "REELS"`).

**Scope:** API swap only. All 28 of Fega's renders already pass every Facebook
Reels spec (1080x1920, 60fps, AAC 48kHz stereo ~194kbps). No re-encoding, no
reframing, no render pipeline work.

**Build:** three-phase Reels flow (start → binary upload to rupload.facebook.com →
finish), adapted from the working resumable-upload pattern already in
`instagram-publish.js`. Keep the existing `/videos` path as a fallback.

**Fega's locked call:** clips outside 3 to 90 seconds post as a normal video
instead of erroring. The legacy path becomes a proven fallback, not dead code, and
a 90s+ clip cannot be a Reel anyway. Never fail the whole multi-platform publish
over Facebook's format boundary.

**Files:** `src/main/oauth/facebook-publish.js` (rewrite, keep legacy fn as
fallback), `src/main/main.js:3212` (prefer real postId). Nothing else touches FB.

**Bonus:** the Reels finish phase returns a real `post_id`, so the tracker can
finally store a clickable Facebook link in `platformResults`.

**Verify:** clip under 90s lands in the page's REELS tab (not just Videos); the
90.73s clip posts as a normal video without failing the batch; and after 24h a
Reels post shows non-zero views. That last check is the only one that proves it.

**Out of scope:** native Facebook scheduling (`video_state=SCHEDULED`), which
would let FB posts fire with the app closed. Real future win, not this change.

---

## 🗄 PREVIOUS (session 123) — Subtitle upgrades + render queue + Queue-tab delete

Shipped earlier this session (committed `e963c13`, unreleased): render input-seek
speed fix (5min → ~8s FFmpeg phase) + app-level floating render pill. Cut of
alpha.7 deferred until this batch lands.

### A. Auto-capitalize I'm / oh my God (smallest, first)
Where: `resolveSubtitles.js` resolvedSegments map (the single choke point all
three consumers share — editor load `useSubtitleStore.js:353`, projects preview
`buildPreviewSubtitles.js:90`, render `render.js:339`), transforming
`repairedWords[i].word` before text rebuild at `:276-278`.
Rules: standalone i + i'm/i'll/i've/i'd → capital I; "god" → "God" only inside
the word sequence "oh my god" (case-insensitive, within a segment, punctuation
preserved). Gate behind `!hasEditorSavedSubs` so a user's saved hand-edits are
never clobbered on reload (mirrors existing cleanup gates at `:192/:211/:290`).
Verify: fresh clip w/ whisper "i'm" renders "I'm" in panel + preview + render;
hand-edited lowercase survives reopen.

### B. Multi-word input into a word block → real word objects (+ merge)
Root cause: `updateWordInSegment` standard path (`useSubtitleStore.js:542`)
stores the whole typed string (spaces included) into ONE word object → text/words
token desync → highlighter treats phrase as one word (Fega's symptom).
Fix at the commit point: split multi-word input into N word objects across the
original word's [start,end], time distributed by char count (reuse/extract
`redistributeByCharCount` from `cleanWordTimestamps.js:138-166`). Rebuild
seg.text from words. 1-word-mode branch (`:503-529`) unchanged.
Merge (Fega clarified 2026-07-23): merge = SEGMENT merge — "very" and "angry"
each on their own segment → one segment holding both as separate word objects,
shown together on screen, highlighted one after the other. Store action
`mergeSegment` (`useSubtitleStore.js:807-824`) already does exactly this —
verify its callers (may be unwired); expose it in the panel: right-click a
segment row → "Merge with next segment" (+ "previous" if trivial).
Verify: type "I am very angry" into one block → 4 blocks, per-word highlight
walks through them in preview; segment merge combines blocks with sequential
highlighting; undo works for both.

### C. Alt+drag duplicates a subtitle segment on the timeline
NLE convention. Gesture is unclaimed (no modifier handling in the drag path —
`SegmentBlock.js:52-90`).
Impl: capture `e.altKey` at pointerdown in `SegmentBlock.onDragStart`; on 3px
threshold cross with Alt: parent callback (`TimelinePanelNew.js`) runs
`startDrag()` (single undo snapshot; _dragging guard makes inner pushes no-ops)
then inserts a clone (fresh `_newSegId()`, deep-copied words) via new store
action `duplicateSegment(segId)` → returns cloneId; SegmentBlock swaps its drag
target to cloneId so the COPY moves, original stays. Existing overlap-push +
snap logic applies (`handleSubtitleDrag:357-409`); `toSource()` conversion as
usual. `endDrag` on release → one undo entry reverts everything.
Verify: Alt+drag left/right → copy lands where dropped, original untouched,
one Ctrl+Z removes the copy; plain drag unchanged.

### D. Queue tab: discoverable remove + optional delete-from-disk
Existing "Remove" (dequeue → status "dequeued", `QueueView.js:680-686`) is
buried in the expanded panel with no confirm. Plan:
- Hover trash icon on the collapsed row (both sections), matching the session-122
  Review-Rail pattern → small confirm popover with two actions:
  "Remove from queue" (existing dequeue, reversible) ·
  "Delete clip + rendered file" (red, destructive).
- Fix latent gap: `projects.deleteClip` deleteFile branch (`projects.js:366-385`)
  unlinks filePath+thumbnailPath but NOT renderPath — add renderPath unlink.
  Never touches project sourceFile.
- Plumb deleteFile through `project:deleteClip` IPC (`main.js:1719`) + preload
  (`preload.js:87`) as optional param, default false — existing editor/rail
  callers unchanged.
- QueueView needs an onClipDeleted callback prop from App (rows derive from
  localProjects, so App must reload the project — same as `App.js:675` flow).
Verify: trash visible on hover; queue-only removal keeps files; full delete
removes record + rendered MP4 + thumb from disk; source recording untouched.

### E. Render queue — serial, auto-drain (Option A; Fega to confirm)
Main process job manager in `main.js`: render:clip invokes enqueue jobs
({clipData, projectData, outputPath, options}); worker drains one at a time via
`render.renderClip`. Progress events gain `{clipId, clipTitle, waiting}`;
terminal events per job. `render:cancel` takes clipId — current job → 
`cancelActiveRender()`, waiting job → drop from queue (resolve canceled).
`render:batch` re-routed through the same queue (enqueue each clip, await all,
aggregate) so batch + single can never run concurrently — `render.batchRender`
becomes dead and is removed.
Renderer: App.js renderJob gains clipId/clipTitle/waiting + waitingIds; floating
pill shows "Rendering <title> — N waiting" and now ALSO shows inside the editor
when the rendering clip ≠ open clip. Topbar pill/buttons: pill only when the
OPEN clip is current-or-waiting; otherwise Queue/Render buttons stay live
(fixes "button blocked behind other clip's %"). doRender guard: only block for
this clip.
Verify: queue clip A, open clip B → B shows green Queue button + floating pill
for A; queue B → both render sequentially; cancel current vs waiting both work;
"Render All" still works and interleaves safely.

Sequencing: A → B → C → D → E, verify each on source, then cut 0.3.0-alpha.7
carrying today's speed fix + pill + this batch.

---

## ✅ SHIPPED (session 120, 0.3.0-alpha.4 — Fega installed; awaiting his live-look confirmation) — Rename fixes + Projects list redesign

Design approved via mockup `tasks/mocks/projects-list-redesign.html`:
**Rich rows · portal dropdown · folders removed · game + date filtering.**

### 1. Rename — game dropdown clipped by the card (bug)
Root cause: session-group card `RenameView.js:1665` uses `overflow:hidden`
(rounds corners) and clips the dropdown when it opens downward; sibling
`SessionPresetPicker` also shares `zIndex:999` and out-paints it.
Fix: render the `GroupedSelect` menu (`RenameView.js:2008`) in a React
**portal** to `document.body`, positioned from the trigger's
`getBoundingClientRect()`; close on outside-click / scroll.
Verify: dropdown fully visible over the naming pill + rows, nothing clipped;
select still works.

### 2. Hover-reveal checkboxes — Rename + Projects (change)
Now always rendered (Rename `LedgerCheck` 1668/1705; Projects `Checkbox`
1267–1270). Hide by default; reveal on row-hover, and show all in "select
mode" (any selection active). Reuse the `.cfr-acts` hover idiom in RenameView.
Files: `RenameView.js`, `ProjectsView.js`.

### 3. Rename — remove the TEST toggle (change)
Delete `<TestChip>` at `RenameView.js:1709` (+ unused import line 5). Keep
`TestChip.js` (used by Projects/Queue/Upload). `isTest` still auto-set by the
test watcher — only the manual per-row toggle goes.

### 4. Projects list redesign — "launch pad" (feature)
Rows (Rich): game-hue poster (tag + hover play) · title · quiet meta
(`date · N clips`) · per-clip **pip strip** (green approved / red rejected /
dim to-review) + count summary · status pill · Review/Open + trash on hover.
Keep a Tight density variant (pips → slim bar).
Chrome: premium header + subline; **status chips** (All / To review / Done);
**game filter chips** (All games + one per game, counts + color dot);
**Sort dropdown** (Most recent · Oldest · Most to review · Name).
Remove: folder sidebar + "Move to Folder" bulk action (folder store data left
untouched for now). Delete bulk action stays.
Data: real — `clipCount`/`approvedCount`/`renderedCount`/derived status; add
`reviewedCount` (approved+rejected) to `listProjects` for the pip/bar fill.
Files: `ProjectsView.js` (ProjectsListView 790–1652; card 1246–1340; sidebar
1046–1186; sort bar 1197–1226; action bar), `projects.js` (listProjects).
Note: ProjectsView.js is CRLF + emoji escapes → Node patch script for big edits.
Verify in `npm start`: hue poster + pips render; game chip narrows to one game;
sort reorders; status chips filter; hover reveals checkbox/Review/trash;
opening a project still enters the clip Review Rail; no sidebar; delete works.

Open decision: purge folder store data on next launch, or leave it. Leaning leave.

---

## ✅ BUILT (session 117, shipped in 0.3.0-alpha.1, awaiting Fega verification) — Rename tab redesign (#172)

Fega approved the plan at session start ("go ahead with the rename redesign");
built per the plan below in one pass, CDP-verified on a sealed dev-profile
sandbox (scratch watch folder, 7 seeded FFmpeg test recordings across 3 dates
+ a 33-min file, real trusted-input drives):
- Sessions group by date+game with header controls (game picker, Day stepper,
  preset chip, folder icon, parts+duration meta); rows slim with native-aspect
  hover-scrub thumbs (50×56 for 8:9 source, 100×56 for 16:9) and 240px peek
  with exact timestamp (24:45 at 75% of 33:00), flip + clamp + leave-hide.
- Selection: row/session checkboxes (full/half states), shift-click range
  (fixed a real bug: anchor ref was read inside the setState updater — see
  lessons.md), Ctrl+A (gated to visible pane + not-in-input), floating batch
  bar with Rename All / N selected modes.
- Set Game on a subset re-groups under the same date and renumbers parts on
  both sides (AR Pt1-3 + Val Pt1-2 from one 5-file day); day counters per
  game.
- Rename 2 Selected renamed exactly those 2 into `2026-07\` (disk verified),
  History recorded, remaining 5 intact; Rename All ran the 33-min auto-split;
  TEST row routed to `Test\2026-07\` and did NOT advance day counters (#170
  intact: AR ended Day3/2026-07-19, Val untouched by the test rename).
- Undo re-enters pending with placeholder thumb (no filePath) and redo
  removes it; per-row preset picker + header "Mixed formats" divergence +
  header Day stepper all verified; zero console errors in instrumented runs.

**Found while verifying (pre-existing, filed, NOT fixed here):**
- #173 — auto-split children renumber from Pt1 and `fs:renameFile` silently
  overwrites an existing target (real data loss in the sandbox repro).
- #174 — the split parent file re-enters Pending via the depth-2 watcher.

**Unresolved wrinkle (watch for it):** ONE blank-page event occurred during
verification right after a header game change on Val-tagged rows; three
instrumented replays of the same and harsher sequences (divergent presets,
select-all, runaway MiniSpinbox hold + mid-hold group unmount) all ran clean
with zero exceptions, and a render-path audit found no throwable. Repro
scripts preserved in the session scratchpad (`cdp-repro*.js`). If Fega ever
sees a blank Rename tab, that's the thread to pull.

## Original plan (approved session 116, executed session 117) — Rename tab redesign

**Approved direction (mock):** `tasks/mocks/rename-tab-redesign.html` — Variant A
"session ledger" + Set Game re-grouping + hover-scrub thumbnails with pop-out peek.
Fega confirmed hover-scrub, the mixed-game-day flow, and the peek preview size fix.

**Scope:** the Pending sub-tab of the Rename tab only. History and Manage sub-tabs,
and ALL rename machinery (presets, collision handling, auto-split, game-switch
scrubber, day/part detection, test-mode rules #170) stay exactly as they are.
Renderer-only change: no main-process edits, no new IPC, no build.files impact.

**File impact:**
- `src/renderer/views/RenameView.js` — pending-tab render rewritten (session
  groups + dense rows + batch bar + peek); selection state added; `renameAll`
  refactored to `renameFiles(list)` so it can run on a subset; header strip
  replaces stat cards + watching banner. All handlers (renameOne, splitAndRename,
  gameSwitchSplitAndRename, hideOne, detectForGame, day-counter updates) reused.
- Possibly one new component file for the ledger pieces if RenameView.js gets
  unwieldy — decided during the build, nothing else imports it either way.

### Build order (ships as ONE unit — the ledger needs Set Game to change a row's game)

**1. Session ledger layout**
- Group pending files by (date + game tag), sessions sorted by date, rows by
  original filename (chronological).
- Session header: checkbox, "Thu, Jul 17" date, game picker (existing
  GroupedSelect), Day stepper, naming-preset chip (moves up from per-row; the
  per-row name stays clickable as today), "N parts · total duration", folder icon.
- Rows (~70px): checkbox, native-aspect thumb, original name, TEST chip,
  → proposed name (game color, clickable preset picker), Pt stepper, duration,
  hover actions: folder / split video / hide. Split badge inline; the
  game-switch scrubber still expands full-width under its row.
- Slim header strip replaces the 4 stat cards + WATCHING banner: title, pulse
  dot + watch path, stat chips (total / pending / games), Refresh + Add Game.
- Explorer access: `window.clipflow.revealInFolder(filePath)` (preload.js:39,
  already used by Recordings) on every row; session-header icon reveals the
  first file of the group.
- Drag-drop import, import progress banner, retro notifications: untouched.

**2. Selection + floating batch bar**
- Row checkboxes; session checkbox with full/partial states; shift-click range.
- Floating bottom-center glass bar (same shell style as the Recordings batch
  cluster, #123): no selection → "Rename All N Files"; with selection →
  "N selected · Set Game ▾ · Hide Selected · Clear · Rename N Selected".
- Set Game: reassigns game on the selected rows and recomputes day/part via the
  existing detectForGame; groups and proposed names re-derive automatically
  (three games in one day = three headers). Per-game Day counters unchanged.
- Rename Selected / Rename All: same per-file pipeline as today via
  renameFiles(list) — splits, collisions, labels, history entries, and the
  #170 test-mode day-counter exclusion all behave identically.
- Hide Selected: existing hideOne per row.

**3. Thumbnails**
- Native aspect: read the preview frame's own naturalWidth/naturalHeight
  (frames already extracted per file) — container height 56px, width follows
  the real aspect, capped for ultrawide. Zero FFmpeg changes.
- Hover-scrub replaces the timed crossfade in PreviewThumbnail: mouse X picks
  the frame; thin position tick at the bottom.
- Peek pop-out: while hovering, a fixed-position ~240px-wide preview appears
  beside the row showing the current frame full-size with a timestamp badge
  (frames already carry timestampSeconds). Flips to the left near the screen
  edge, disappears on mouse-leave. Every <video>/img cleanup rule respected
  (no <video> used — static frames only).

### Verification

**What I do before handing over:**
1. `npm run build:renderer` clean, `npm run dev` (dev profile) launches.
2. CDP-verify in the dev app with seeded pending files: sessions group
   correctly; select 2 of 8 → "Rename 2 Selected" renames only those and
   History records them; Set Game on a subset re-groups + renumbers both
   sides; Rename All still handles auto-split and game-switch markers;
   folder icon opens Explorer with the file selected; hover shows peek with
   correct timestamp; TEST rows still don't advance day counters (#170).
3. Regression pass: drag-drop import, undo from History re-enters pending,
   preset switching per row, label presets validate.
4. `npm run build` for the installer when Fega wants it on the daily driver
   (feature → minor version bump per version policy).

**What Fega checks on the daily driver:**
- His real 8-part RL day shows as one clean session group.
- Pick a few files → Rename Selected; a mixed day → Set Game flow.
- Hover a thumb: peek is big enough to actually see the gameplay.
- Folder icons land in the right Explorer location.

**Risks / watch out for:**
- renameAll today wipes ALL pending state at the end (setPendingRenames([]));
  the subset version must remove only the renamed rows and their splitInfo /
  scrubber state.
- Undo-created pending rows have no filePath — placeholder thumb, no probe,
  no explorer icon (existing behavior, keep it).
- Selection must exclude rows mid-rename (renaming flag) so double-fires
  can't happen.

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

---

## Session 113 — Recordings/disk reconcile + watch-folder split (Fega's 3 issues)

### Findings (all verified read-only against prod DB/store)
1. **Ghost cards:** Recordings tab renders `file_metadata` rows verbatim
   (`allRenamed`, main.js:1834); nothing in the app ever deletes a row, no
   disk-existence check anywhere. 4 ghosts in prod (RL 2026-03-04,
   JC 2026-03-23, JC 2026-03-23 Day1 Pt1, RL 2026-07-15).
2. **Invisible Day7:** `RL 2026-03-04 Day7 Pt1-4.mp4` exist on disk, zero DB
   rows (prod/dev/repo all checked). Mechanism: RenameView.js:612 ignores
   `fileMetadataCreate` failure after the disk rename already succeeded
   (historical trigger unconfirmable). One-time migration regex only matches
   legacy date-first names, never re-runs.
3. **Watch folder:** OBS now pre-buckets `Recordings\<Game>\<YYYY-MM>\`
   (OBS creates month folders; one folder per game). Watcher is depth:0
   (main.js:736); rename dest = `<fileDir>\<month>` → nesting (#171);
   projects tree lives under `<watchFolder>\.clipflow` → changing the
   setting orphans all projects/queue (clip paths absolute, projects.js:308).
4. Side bugs filed: #170 (test renames advance real day counters — RL at
   dayCount 9 / lastDayDate 2026-10-15), #171 (month-folder nesting).

### Plan (approved: reconcile fix; folder design follows Fega's answers)
- [x] 1. Library/watch split: `projectsRoot` store key + idempotent pin-once
       migration; `libraryRoot()` helper; swap project-storage call sites in
       main.js (projects.*, waveform cache, transcripts, pollution migration,
       pipeline, test-project root). Settings shows read-only library line.
- [x] 2. Watcher depth 0→2 (sees `<Game>\<YYYY-MM>\` raws). Rename in place
       when source dir is already a `YYYY-MM` folder (#171). Surface
       `fileMetadataCreate` failure in RenameView instead of swallowing.
- [x] 3. Reconcile on Recordings load + refresh (`metadata:reconcile`):
       flag rows whose file is gone (skip when drive root unreachable);
       adopt untracked renamed files (legacy + tag-first formats, known tags
       only, skip test folders); UI hides missing + "Clean up" button
       (`metadata:removeMissing` — first-ever row delete, confirm-gated).
       Reconcile also repairs impossible day counters (lastDayDate in the
       future → recompute from non-test rows; runs after adoption) (#170).
- [x] 4. Test-mode renames stop advancing real day counters (#170).
- [x] 5. Verify in sandboxed dev profile (backup dev DB/settings, scratch
       watch folder with ghost row + untracked file + nested raw; restore
       after). Build renderer, CDP-check Recordings tab.
- [x] 6. CHANGELOG, commit/push, cut 0.2.2-alpha.1 (includes pending #169
       wizard). Fega installs, sets watch folder to
       `W:\YouTube Gaming Recordings Onward\Recordings`, verifies.

### Outcome (session close)
All six steps DONE and sandbox-verified (commits e0d191d, 3431161, 9d8de89; installer 0.2.2-alpha.1 cut). Remaining: Fega installs, sets watch folder to the Recordings root, confirms — then close #170/#171 (+ #169 wizard pass).

### Success criteria
- Ghost cards hidden immediately; Clean up removes their rows; unplugged
  drive flags nothing.
- Day7 Pt1-4 appear under March 2026 without manual DB surgery.
- Raw files in `Recordings\Arc Raiders\2026-07\` reach the Rename tab; a
  rename there does NOT create `2026-07\2026-07\`.
- Existing projects/queue unchanged after watch-folder switch (library
  pinned to vertical folder).
- Next real RL rename would be Day8 (counter repaired 9→7).
