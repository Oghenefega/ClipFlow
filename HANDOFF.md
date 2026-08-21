# HANDOFF — Session 179 (2026-08-20)

## Current State
**Six issues shipped, 0.4.0-alpha.1 cut and published to the update feed
(first build on the 0.4 line — Fega's call, minor bumped because the batch
since alpha.60 was substantial).** All six are `status: untested` until Fega
sees them in the installed app: #278, #275, #276, #279 (two passes), #280.
Also riding this installer, still untested from earlier sessions: #263/#269
(s176 game auto-detect), #271 (s177 audio wizard), #270 (s178 per-word
styles).

## What Was Built
- **#278** — `resolveSubtitles.js`: the consecutive-duplicate-word cleanup is
  now gated behind `!hasEditorSavedSubs` like the mega-filter and segment
  dedup (#115 pattern). Saved "that that" survives reopen cycles; raw
  transcriptions still dedupe. Unit-proved with a Node harness + live clip open.
- **#275** — `ProjectsView.js`: PageHeader + filter chips wrapped in a sticky
  block that swallows the pane's 32px top padding (`margin:-32px 0 16px;
  padding:32px 0 14px`, opaque bg, zIndex 30). Zero layout jump at pin.
- **#276** — `TrackerView.js`: Calendar sub-view deleted (`TrackerCalendar.js`
  removed; `trackerCalendarModel.js` + tests stay and power the week
  aggregation). `weekOffset` state replaces `subView`; `wd`/`monday` derive
  from the viewed week so everything downstream follows. Past weeks render
  frozen state via `weekAggregate` (snapshot game via `viewedGameName`,
  target null → "untracked", HIT/MISSED verdict + recap + streak from
  `streakByWeek`), read-only log (no open slots, popover without Remove, post
  links intact). Future weeks = read-only scheduled preview with Manage in
  Queue as the only exit. All writes (log/target/switch/slot editor/remove)
  gated to `viewMode === "current"`; goal-reached toast gated too.
- **#279** — Tracker density, two passes. Final shape: ONE header line
  (title + NOW PLAYING + week nav + streak chip + Rundown/Export/Import),
  ONE top row (Now Playing card w/ art + Weekly Goal w/ 88px ring + Rank),
  slim stakes bar, week log with the legend folded into its header, no
  spacer. Zero-scroll verified at 1280×860 AND 1575×1368 with an 8-slot week.
- **#280** — Tracker card tile uses the Projects-tab `gameArt` map
  (App → `gameArt` prop; 54×72 poster, tag-on-color fallback).

## Key Decisions
- **0.4.0-alpha.1, not 0.4.0** — keeps the `alpha` channel so future alpha
  builds keep flowing through the updater (a bare 0.4.0 would outrank them).
- **Tracker is motivation, Queue is operations** (issue #276 guardrail) —
  future weeks never schedule from the Tracker.
- **Switch game lives inline on the "Now playing" label line** — every
  absolute corner and the chips row collide in the narrow card.
- **#273 (volume ramps) explicitly NOT started** — it's a full session
  (data model + Web Audio preview + FFmpeg parity + mock-first per house rule).

## Next Steps
1. **Fega's in-app pass** on 0.4.0-alpha.1: Tracker (arrow back/forward, no
   scroll at his window, art tile, Switch pill), Projects header pin, a saved
   clip with a repeated word reopened twice. Then clear `status: untested` on
   #275/#276/#278/#279/#280 (+ #263/#269/#270/#271).
2. **#272 → #273** (approved batch order from s178): mic/game balance first,
   then volume ramps. Mock the ramp interaction before code.
3. #277 premium design pass epic is queued behind these — Tracker is now in
   its final pre-redesign shape.

## Watch Out For
- **Short-window Tracker can still scroll on extreme days** (a day with 5+
  posted cards at 860px tall) — that's content, not chrome; typical weeks fit.
- **Dev profile tracker store is empty** — past-week/HIT states need seeded
  history. Pattern used: back up `%APPDATA%\clipflow-dev\clipflow-settings.json`,
  inject `trackerData` + `weekMeta`, test, restore (restore guarded on `seed-`
  id markers). Dev Queue's scheduled clips DO show up in the Tracker preview.
- **`innerText` is rendered text** — uppercase via `text-transform`, newlines
  between inline children. Probe with `/regex/i`, or read refs/fiber state.
- **Emulation.setDeviceMetricsOverride** is how to test other window sizes
  in Electron via CDP (`Browser.setWindowBounds` isn't implemented); the
  override persists across CDP sessions until cleared.

## Logs / Debugging
- Scratchpad harnesses this session (session dir `93464d24…/scratchpad`):
  `cdp.js` (eval helper), `shot.js` (screenshot), `verify-275.js` (sticky
  header cycles), `verify-276.js` + `verify-276b.js` (week nav + read-only
  popover), `verify-279b.js` (dual-viewport fit), `click-switch.js` (trusted
  input click), `test-278.js` (resolver unit proof).
- Build log: `scratchpad/build-0.4.0-alpha.1.log`. Feed check:
  `curl -s https://engine.flowve.app/updates/alpha.yml | head -1`.
- Tracker state inspection trick: walk `__reactFiber$` from the Switch button
  to the first function-component fiber; hooks 28–31 = pickerOpen, pickerRef,
  pickerBtnRef, pickerPos (order follows source declaration).
