# ClipFlow — Session Handoff

_Last updated: 2026-07-31 — Session 142 (S142 · alpha.36 — Status ladder & seamless splits) — **both features verified by Fega on the installed build; #221 and #222 closed.**_

---

## One-line TL;DR

Fega reported the felt gap when playback crosses a deleted middle and asked for a
unified clip-status color system; both shipped as `0.3.0-alpha.36`, he tested the
installed build the same session and confirmed both work.

## Current State

Healthy. Master clean at `753d6c8`. [#221](https://github.com/Oghenefega/ClipFlow/issues/221)
and [#222](https://github.com/Oghenefega/ClipFlow/issues/222) filed, shipped, verified
by Fega on the daily driver, and **closed**. His installed app is on alpha.36.

---

## What Was Just Built

### 1. Unified clip status ladder on the Projects tab (#221, `ddf0b77`)

One six-color ladder everywhere, furthest stage wins: untouched (ghost) → approved
(green) → rendered/waiting-in-queue (orange, new `T.orange` #f97316) → scheduled
(yellow) → published (cyan) — rejected (red) off-ladder. Yellow/cyan deliberately
match the Tracker's existing scheduled/posted dots.

- **Root-cause fix:** the Scheduled badge existed but required a Tracker entry, and
  Tracker entries are only written at publish time (`logPost`) — `scheduleClipOnly`
  sets only `clip.scheduledAt`. `makePublishState` (ProjectsView.js) now reads
  `isScheduled = !!c.scheduledAt`; `isPublished` still requires the tracker entry.
- **Strict Done (Fega's call):** a project is Done only when every clip is Rejected,
  Scheduled with an actual date, or Published. Rendered-but-undated blocks.
- **Dequeued** (Queue "Remove", `status: "dequeued"`) gets a ghost "Removed from
  queue" badge, counts as pending review via the new `isClipUndecided` helper, and
  blocks Done. Previously indistinguishable from never-reviewed.
- After install, Fega's Done count went 2 → 17 — that's the fixed logic finally
  counting dated clips, not a bug.

### 2. Seamless split playback in the editor preview (#222, `ddf0b77`)

Fega's "slight space between both clips" after deleting a middle segment.
Root cause: single `<video>` on the full source recording; each cut boundary did an
in-place `currentTime` seek — measured **190–1100ms (avg ~450ms)** of frozen frame +
silent audio on a real 2560×2880 HEVC recording (probe in session scratchpad).

Fix — double-buffered playback in `PreviewPanelNew.js` + `usePlaybackStore.js`:

- `videoRef` is now a **pointer** to the active of two `<video>` elements
  (`videoElARef`/`videoElBRef`). Every consumer (store actions, rAF loop,
  compositor, audio sync, external `getVideoRef()` callers) reads `.current` at
  call time, so swaps needed zero changes elsewhere.
- The hidden standby is **parked** on the next section's first frame while playing;
  at the boundary the elements swap (opacity flip, play/pause, rate/volume copy)
  and the old one re-parks at the section after that. Measured handoff: **~8ms**,
  zero visible `seeking`, 1.5× shuttle speed carried across.
- `mapSourceTime` gained an additive `seekToIndex` so the swap validates its park;
  legacy in-place seek remains the fallback; adjacent (nothing-deleted) split
  boundaries still play straight through (distance gate).
- All media events are target-guarded so standby parking never steers the store;
  both buffers get the #90 src teardown + unmount cleanup; `swapTick` re-anchors
  the reframe compositor's rVFC loop after each swap.

### 3. Explainer artifact

`tasks/mocks/clip-status-and-split-gap.html` — the visual explainer Fega approved
the design from (ladder colors, Done rule table, dequeued proposal).

## Key Decisions

- **Strict Done** over "queued is enough" — Fega: if a clip is approved but not
  rendered/queued, or rendered but slotless, there's still work to do there.
- **Queue ≠ a state.** Every approved unpublished clip is automatically on the
  Queue tab, so "Rendered" doubles as "waiting in queue" — no separate queue color.
- **Double-buffer over alternatives** for the seam: only approach that hides HEVC
  seek latency with one decoder file; MSE/frame-pipelines rejected as too heavy.
- **NEW STANDING RULE (memory `feedback_test_on_rejected_clips`):** every in-app
  test runs on a clip with rejected status — never approved ones.

## Next Steps

1. Watch for seam edge cases in real editing: rapid cuts close together (standby
   may not park in time → falls back to the old seek — expected, not a bug),
   reordered sections, reframe-active clips.
2. #220 (session 141 keyboard layer) — Fega has alpha.36 now which includes it;
   still open pending his explicit confirmation of the keyboard work.
3. Queue tab could adopt the same ladder colors for its status chips (not asked
   yet — surface as an option, don't just do it).

## Watch Out For

- **Editor autosave fires ~800ms after every edit** — there is NO memory-only
  editing session; killing the app does not discard edits (CDP gotcha 29).
- **Dev profile shares `projectsRoot` with prod** — dev editor edits hit real
  project JSON (gotcha 27). Session incident: `S` (trim-end, NOT split — split is
  `U`) cut a real clip; restored exactly (single segment 733.1377→747.8186,
  verified on disk; backup in session scratchpad).
- **`isClipUndecided` includes `"dequeued"`** — any new review-count consumer in
  ProjectsView should use it, not `status === "none"`.
- The two `<video>` buffers must stay behaviorally identical — new media event
  handlers in PreviewPanelNew need the `e.target !== videoRef.current` guard, and
  any new element-bound effect (like rVFC) needs `swapTick` in its deps.
- Badge `bg` prop: non-green/yellow/red badge colors need an explicit `bg`
  (orange/cyan use `T.orangeDim`/`T.cyanDim`) or they fall back to purple dim.

## Logs/Debugging

- **Seek-latency probe** (`scratchpad/seek-probe.html` + `probe-main.js`): headless
  Electron, real recording — small +4s jumps: 410/466/228/1099/192ms; +45s jumps:
  807/188/197ms. This is the "before" baseline for the seam fix.
- **Crossing measurement**: sampler at ~120Hz over a real deleted-middle cut —
  one visible-element flip, 8.2ms sample gap, `seeking` count 0, playhead
  continuous, playback ran to clip end and stopped (atEnd path intact).
- **CDP driving**: window occlusion kills rAF (and the playback loop) — relaunch
  with `--disable-features=CalculateNativeWinOcclusion --disable-renderer-backgrounding
  --disable-background-timer-throttling` (gotcha 28); `Page.bringToFront` and
  user32 ShowWindow both failed to flip `visibilityState`.
- No new Sentry errors introduced; renderer builds clean (chunk-size warning is
  the known benign one).
