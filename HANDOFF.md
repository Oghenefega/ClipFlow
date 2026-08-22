# HANDOFF — Session 180 (2026-08-21)

## Current State
**Two issues shipped from Fega's annotated Tracker screenshots: #281 (premium
redesign) and #282 (drag a scheduled clip to reschedule, incl. cross-week edge
travel).** Both on master in `71ffcd6`, both `status: untested` — **not in any
installer yet.** Fega was asked whether to cut a build for them or let them ride
until the batch is bigger; he wrapped the session without answering, so **that
question is still open.**

0.4.0-alpha.1 (cut s179) is still the newest published build. Everything from
s179 and earlier is still awaiting Fega's in-app pass: #263/#269, #270, #271,
#275, #276, #278, #279, #280.

## What Was Built
Both issues are one file's worth of change: `src/renderer/views/TrackerView.js`
(+ 4 lines in `App.js` for the reschedule callback).

- **#281 layout.** Week nav (`‹ Aug 17 – Aug 22 ›`) left the page header and is
  now the week-log card's own header row, above the day columns — `THIS WEEK`
  caption at offset 0, `Back to this week` button otherwise. Legend + hint moved
  to a footer strip under the grid. The log header now carries only the nav and
  Edit slots/Custom.
- **#281 Now Playing card.** Album-cover shape: `flex: 0 0 92px` poster,
  `alignSelf: stretch`, full card height (~154px), vignette + right-edge fade.
  The rank pill and the "N posted this week" pill are deleted (both duplicated
  cards sitting beside them). Name at 21px, clamped to 3 lines. `Switch` is an
  absolutely-positioned hover-reveal pill driven by `npHover` state (inline
  styles — no CSS class to hang `:hover` on); it stays visible while the picker
  is open. `NOW PLAYING <game>` removed from the page header (Fega confirmed).
- **#281 premium pass.** Projects list-row treatment: game-hue radial+linear
  wash, `${gameColor}3d` border and hover-lift on Now Playing; new module-level
  `PANEL_BG` (the ProjectsView.js:842 top-edge highlight) on Goal, Rank and the
  week log.
- **#282 drag.** `movable = isSched && clipId && projectId && onRescheduleClip`
  — posted entries never get `draggable`. Payload lives in `dragRef`, not
  `dataTransfer`. Open slots gain `onDragOver/onDragLeave/onDrop` only when
  `droppable` (not a past week, slot time > now); the drop builds
  `<dayIso>T<HH:MM>:00` and calls `onRescheduleClip`, wired in App.js to the
  existing `handleUpdateClipFields` (optimistic state + `projectUpdateClip`).
- **#282 edge travel.** `onLogDragOver` on the log card reads `e.clientX`
  against its rect; within `EDGE_PX` (30) of either edge it arms a timer —
  `EDGE_DWELL_MS` 550 then `EDGE_REPEAT_MS` 800 repeats — calling `goWeek(±1)`.
  The two edge strips are `pointerEvents: none`, so Mon/Sat slots underneath
  stay droppable.

## Key Decisions
- **Mock-first, as usual.** `tasks/mocks/tracker-redesign.html` (interactive —
  real drag/drop, hover states, the real Rocket League poster embedded as a data
  URI) was signed off before any app code. Fega approved it and confirmed the
  header trim in the same message.
- **The drag is an accelerator, never the only path** (`.claude/rules/
  ui-standards.md` "Requested controls"). The scheduled-clip popover still leads
  with **Manage in Queue** and now carries an "or drag the card to another slot"
  line; the footer advertises the gesture.
- **Cross-week only via edge travel** — you still cannot drop onto a week you
  are not viewing, and past weeks remain dead ends (they render no open slots).
- **Accepted a 30px height cost.** Measured both builds the same way at
  1280×860: old layout had 101px of slack, new has 71px, no scrollbar either
  way. The header border + footer strip are what the design needs; I clawed
  back ~12px by trimming the log card's paddings.

## Next Steps
1. **Answer the open question: cut an installer for #281/#282, or wait?**
   Fega can't see any of this until one ships (he tests on the installed exe).
2. **Fega's in-app pass** on #281/#282, then clear `status: untested`.
3. **#272 → #273** (approved batch order from s178): mic/game balance first,
   then volume ramps — mock the ramp interaction before code.
4. #277 premium design pass epic — the Tracker is now done, so #277's remaining
   scope is the other tabs.

## Watch Out For
- **`dragend` does not fire when the week flips mid-drag.** The source card
  unmounts, and events on a detached node never reach the document. Cleanup
  therefore also listens for `mousemove` (the OS suppresses mouse events for the
  whole native drag, so one arriving proves the drag ended), with a 300ms grace
  window for the mousemove that started it. **Do not "simplify" that listener
  away** — without it the drag state strands and the edge strips stay on screen.
- **The edge timer needs its liveness check.** `EDGE_STALE_MS` (1200) bails when
  no `dragover` has arrived; Chromium fires `dragover` ~every 350ms while a drag
  hovers a target, even stationary, so a genuinely held cursor is never mistaken
  for a departed one. Removing this brings back the runaway week-flip bug found
  during verification (the week marched on forever after the cursor left).
- **Short windows.** The tab needs ~789px of window height for a no-scroll fit
  (was ~759). Fine at 1280×860 and at Fega's ~1368; a deliberately squat window
  will scroll.
- **`Switch` renders at `opacity: 0` until hover.** A CDP probe reading its
  opacity will say `0` and that is correct, not a bug.
- **Reading React state in the same expression as a synthetic click** returns the
  pre-render value — the game picker looked broken twice for this reason before
  a 400ms wait proved it fine. Prove the probe detects the positive case first.

## Logs / Debugging
- Session scratchpad `869ddf03…/scratchpad` holds the reusable harness:
  `cdp.js` (eval / `size` / `shot`, uses the GLOBAL-ish `ws` at
  `C:\Users\IAmAbsolute\node_modules\ws`), `fit.js` (pane-vs-content slack
  measurement), `drag-test.js`, `drop-test.js`, `edge-test.js` (synthetic
  `DragEvent` + `new DataTransfer()` drivers), plus `tracker-1280x860.png`,
  `final-1280x860.png`, `fallback-art.png` and `dev-settings.backup.json`.
- **Isolated fixture pattern (new, and better than snapshot-restore):** point the
  DEV profile's `projectsRoot` **and** `watchFolder` at a scratchpad dir holding
  `.clipflow/projects/<id>/project.json`, so destructive schedule tests never
  touch the real library. Clips must carry `renderStatus: "rendered"` or App's
  `allClips` memo drops them (and `scheduledClips` with them). Dev settings were
  restored from the backup at session end — verify with:
  `node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.APPDATA+'/clipflow-dev/clipflow-settings.json','utf8')).projectsRoot)"`
- **Launch for verification:**
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`,
  wait ~18s, then `node cdp.js size 1280 860`. Kill with
  `taskkill //F //IM electron.exe` (double slash) and confirm
  `tasklist | grep -ci electron` is 0 before relaunching.
- App log: `%APPDATA%\clipflow-dev\logs`. Publish errors live in
  `clipflow-publish-log.json`, not `app.log`.
- Both traps above are recorded as gotchas 48–49 in the CDP memory file.
