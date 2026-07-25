# ClipFlow — Session Handoff

_Last updated: 2026-07-25 — Session 128 — **Clip sections can be reordered on the timeline (#184). Shipped as 0.5.0-alpha.1; installer cut, awaiting Fega's confirmation on the daily driver.**_

---

## One-line TL;DR

Fega asked for two things: move a stretch of a clip in front of another (10s–14s before 0s–9s), and Alt+drag to duplicate a section — subtitles following in both cases. **Reorder shipped; duplication was cut by Fega after the plan showed what it costs.** The reorder itself was cheap — `nleSegments` is an ordered list and timeline position is already derived by summing durations in array order, so moving a section is a pure array move and subtitles follow for free (they're source-timed and re-projected on every read). The real work was the three places that had quietly used *array order* as a proxy for *recording order*, which was true for the app's entire life until now.

## Current State

Shipped and built: **0.5.0-alpha.1**, `dist\ClipFlow Setup 0.5.0-alpha.1.exe` (124 MB, 01:06). Fega has not installed or confirmed it yet — **#184 stays open** until he does. Commits `753131e` (feature) and `ff4bb0c` (version bump).

## What Was Just Built

- **Drag a block on the Audio track to a new slot.** Orange insertion line marks the drop point; the timeline stays gapless (everything else shifts). `moveSegment` in `segmentOps.js` (pure array move) → `moveNleSegment` in the editor store, inside the existing `_pushNleUndo()` envelope so one Ctrl+Z reverts the gesture. `WaveformTrack` grew a body-drag handler mirroring `SegmentBlock.onDragStart` (3px threshold); the insertion index is computed in `TimelinePanelNew` from the midpoints of the *other* sections, which is already in "list with this one lifted out" terms — exactly what `moveSegment` expects.
- **Move section earlier / Move section later** in the Audio track's right-click menu, disabled at the ends. A drag gesture must never be the only path to a requested capability (`.claude/rules/ui-standards.md`).
- **Three order-assumption fixes.** `extendSegmentLeft/Right` now clamp against the nearest segment in *source* order, not the array neighbour. Playback gap-recovery resumes at the head of whatever section follows the *playhead*, in both `usePlaybackStore.mapSourceTime` and `ProjectsView.mapPreviewSourceTime` (the Projects preview carries its own copy of that logic — it needed a `tlTimeRef` because the rAF loop's closure can't read `currentTime` state).
- **Straddle guard** in `visibleSubtitleSegments` / `visibleWords`: a subtitle spoken across a cut maps to an inverted range once the two sides are separated. It now clips to the section holding its first word and rebuilds `text` from the kept words. Unreachable while sections stay in recording order, so trimmed clips are byte-identical.
- **Mapped subtitles are sorted by `timelineStartSec`.** Found during verification — see Watch Out For.
- 16 new unit tests (91 total in `nleModel.test.js`; the 74 pre-existing ones unchanged — any needing an edit would have meant the straddle guard was too broad).

## Key Decisions

- **Insert/ripple, not free placement.** The model and the render pipeline have no concept of a gap (a gap would be black frames); `getTimelineDuration` is a sum of durations. Free placement would have been a much larger change for no clear gain.
- **Duplication cut (Fega's call).** Two copies of the same footage make "where am I?" unanswerable from a timestamp — `sourceToTimeline` returns the first match — which would have forced `visibleSubtitleSegments` to emit one instance per *appearance*, with synthetic IDs and read-only repeat instances. That's the single choke point every subtitle surface in the app runs through. Reorder needed none of it.
- **Captions deliberately do not follow a moved section.** They're stored in timeline time, subtitles in source time. Accepted and documented rather than silently converted.
- **Pressing a waveform block now starts a move, not a scrub.** The pointerdown swallows the container's scrub handler, so a press that never becomes a drag seeks explicitly via `onSeekClick` — otherwise the gesture would have silently removed click-to-seek over the waveform. Press-and-drag scrubbing still works on the ruler and the empty track areas.
- **Version sizing: minor bump, counter reset (0.4.0-alpha.1 → 0.5.0-alpha.1).** The editor can do something it could not do before, which reads as a new capability rather than "X works now".

## Next Steps

1. **Get Fega's confirmation on the installed 0.5.0-alpha.1** and close #184. Worth asking specifically about (a) subtitles landing right on his own footage after a move, and (b) how a section cut mid-sentence reads — those are where it could feel wrong in practice even though the mechanics check out.
2. **Watch whether the caption not moving actually bothers him.** If it does, the fix is converting captions to source time, which is a real migration (every saved `captionSegments` is timeline-relative) — don't start it speculatively.
3. #183 (AI titles/captions) still needs a real read — see session 127's notes; "a bit better" never got upgraded to a confirmation.
4. Pre-existing backlog otherwise unchanged — run the start-session ritual for the current list.

## Watch Out For

- **The bug that nearly shipped: mapped subtitles were in recording order.** `visibleSubtitleSegments` emits in input order, which matched playback order for the app's whole life until a section could move. Consumers that walk the list as a flat sequence — the karaoke global word index, the Edit-subtitles rows, the Transcript paragraphs — then track the wrong word; the symptom was the transcript highlight sitting on the clip's last word while the playhead was mid-clip. Fixed with an explicit sort on `timelineStartSec`. **91 green unit tests and a correct render did not catch it** (the tests assert per-segment values, never the sequence; the preview overlay `find()`s by time range and is order-independent). Only driving the real UI did.
- **`nleSegments` order is no longer source order.** Anything new that scans for "the next segment" or clamps against a neighbour must resolve in the coordinate space it actually means. `sourceToTimeline`/`timelineToSource` walk in array order and are safe by construction.
- **`clip:concatRecut` (main.js:1473) sorts sections by start time** and would silently undo a reorder. Confirmed unreachable — its only caller `rippleDeleteAudioSegment` has no callers itself. Left in place as pre-existing dead code; if it's ever revived, drop the sort.
- **The dev profile's copy of "2026-07-17 RL Day8 Pt6 / Clip 1" is left in a reordered, split state** from verification. Harmless (dev profile is isolated), but don't mistake it for a bug when you open it.
- The straddle guard drops trailing words from a subtitle cut across a seam — by design, and `text` is rebuilt to match so `words[]`/`text` stay in sync (#116). If a word ever goes missing from a burned-in render near a seam, that's the place to look.

## Logs/Debugging

- **App log:** `%APPDATA%\clipflow\logs\app.log` (prod), `%APPDATA%\clipflow-dev\logs\app.log` (dev). Nothing new logs from this feature — reorder is pure renderer state.
- **Verifying without touching the daily driver:** the single-instance lock blocks `npm start` while the installed app is open, but the lock is scoped per profile, so `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222` runs beside it. Note `isDev` is hardcoded `false` in `main.js`, so that command loads the **built** `build/` output, not a Vite dev server — build first, then launch. Kill it with `taskkill //IM electron.exe //F` (only matches the dev instance; the installed app is `ClipFlow.exe`).
- **CDP driver used this session:** a ~90-line script in the session scratchpad with `eval` / `click` / `rclick` / `drag` / `key` / `shot` subcommands over the `/json/list` page target, using Node 24's global `WebSocket` (no `ws` dependency). Useful probes: count and locate audio sections with `[...document.querySelectorAll('canvas')].map(c => c.parentElement.parentElement.getBoundingClientRect())` — the first canvas is the preview, the rest are waveform blocks in timeline order; read the playhead clock by matching `/^\d\d:\d\d\.\d$/` on leaf elements. Scope button queries with `b.offsetParent` — every tab pane stays mounted, so an unscoped `querySelectorAll('button')` returns the Rename tab's controls.
- **Render verification without watching a progress bar:** trigger Render, then compare frames. `ffmpeg -ss <t> -i <render> -frames:v 1 out.png` against `ffmpeg -ss <clipOrigin + sourceOffset> -i <source> -frames:v 1 out.png`. For this clip: origin 1557s (25:57), so render t=1 ↔ source 1576 and render t=13 ↔ source 1560 — both matched, which is what proved the export order. During the overlay-capture phase the CDP page target switches to the 1080×1920 offscreen window, so `eval` will appear to hit the wrong page; that's expected.
- **`git add` explicitly, never `-A`:** `data/clipflow.db` is permanently dirty from runtime churn, and `.agents/`, `.codex/`, `AGENTS.md`, `tasks/mocks/*` are untracked pre-existing files.

## Verification Status

**Verified in the running app (dev profile, built renderer):** split a real 30s clip into three, dragged the third to the front — subtitles followed onto the right footage, duration unchanged; one Ctrl+Z reverted; playback crossed both seams monotonically (10.9 → 12.0 → 14.0); order survived an app reload and clip reopen; "Move section later" from the right-click menu reordered correctly and greyed out at the ends; a subtitle deliberately split across a cut clipped cleanly; click-to-seek on the waveform intact. **Rendered end-to-end:** 30.03s out, frame at 1s matches source 19s and frame at 13s matches source ~2s, with the correct burned-in subtitle. 91 model tests green. The installer artifact was confirmed to contain the new code by grepping the asar bytes.

**Not verified:** Fega hasn't run 0.5.0-alpha.1 on the daily driver yet.
