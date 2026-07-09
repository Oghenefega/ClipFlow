# Tracker Calendar View — Phase 2 Spec

> Goal: enable the disabled Calendar pill on the Tracker and ship the Calendar view — the
> navigation layer for past, present, and future weeks. Read-only everywhere. It browses the
> honest data Phase 1 already collects; it adds ZERO new persisted state.
>
> Status (2026-07-09): design locked by Fega. He chose the P3 "Hybrid" prototype (density grid +
> week scoreboard rail + month stats line) and explicitly ruled: function first, visual
> refinement iterates later on the real app. Do not run extra beauty passes; build the locked
> shape. Produced by Wick (GM agent); code anchors below verified against this repo 2026-07-09.

---

## Source material (read these)

- **The mock (the visual spec):** `Desktop\ClipFlow stuff\Tracker Redesign\tracker-calendar-prototypes.html`
  — open it, select the **P3 Hybrid** tab, click everything (day cells, week chips, month arrows,
  the drawer, the drill-in). P1/P2 tabs are rejected candidates; ignore them except where this
  spec says to borrow. The mock's DATA is fake and pinned to a fake "today" (Jul 6); this spec is
  the authority on behavior, the mock on look and feel.
- **Phase 1 spec (context + locked product rules):** `tasks/specs/tracker-now-playing.md`.
- Current implementation: `src/renderer/views/TrackerView.js` (Phase 1 rebuild, live),
  `src/renderer/utils/trackerEngine.js` (pure engine + 41-assertion test).

## Locked decisions (Fega, 2026-07-03 + 2026-07-09)

1. **Calendar = navigation layer, one mental model for past/present/future.** The "This week /
   Calendar" toggle becomes two live states. The disabled pill to replace is
   `TrackerView.js:438-439`.
2. **Read-only, absolutely.** No logging, no editing, no scheduling actions anywhere in the
   Calendar. Tracker = motivation, Queue = operations (locked product boundary). The future is a
   faint preview with scheduled counts only.
3. **Mon to Sat. No Sunday column exists.**
4. **Day cells: count + per-clip segment strip. NO full-cell game tint.** Each day renders its
   clip count and an 8-slot track of segments: one segment per clip in that clip's game color
   (from `gamesDb`), manual clips faded (~45% opacity), scheduled clips hollow, unused slots a
   faint neutral. A mixed day (4 Rocket League + 4 Valorant) shows its true mix; no single color
   ever "wins" a day. This was Fega's direct call after seeing the tint version.
5. **Never encode game identity by hue alone.** Game colors are user-chosen, and two of Fega's
   own games validate as near-identical for colorblind users. Segments keep 2px gaps, day cells
   get a plain-text tooltip naming the mix, and the drawer + drill-in keep lettered game tags.
6. **Week rail (the scoreboard):** each week row ends in a chip: `posted/target` mono score,
   outcome tag (HIT / MISSED / LIVE / PREVIEW), a thin progress bar (green = hit, dim red =
   missed, pace-colored while live using the existing Phase 1 pace thresholds, faint = preview),
   and the week's frozen game + streak count. Chip opens the week drill-in.
7. **Month stats line** above the grid, slim inline mono text (NOT stat boxes): clips this month,
   weeks hit, current streak, best day.
8. **Day drawer:** clicking a day slides in a right panel: that day's clips with game tag, slot
   time, platforms, auto/manual dot, and a "View" link per entry where a `platformResults` row
   carries a url (YouTube today). Future day with scheduled clips: faint dashed rows + the note
   that scheduling lives in the Queue.
9. **Week drill-in:** clicking a week chip opens the read-only week overlay: frozen target,
   outcome banner, the week in day-column layout (chips only, nothing clickable to mutate), and
   the week's frozen recap (per-platform counts, streak/rank/game context, Flowve mark). The
   trophy-shelf effect: old recaps stay reachable forever.
   - Hit week banner: "Goal hit. N of T posted. Bonus XP banked, streak extended to S."
   - Missed week banner (calm, no shame): "Target T, posted N. Streak ended at S weeks. Rank
     kept every XP, the next streak started the following Monday."
   - Current week: short banner + a button that flips back to the This week view (don't
     duplicate the live view inside the drill-in).
   - Future week: scheduled count + "read-only preview, scheduling lives in the Queue."
10. **Streak-lost stakes state (This week view):** Phase 1 already shipped `streakOverVariant`
    (`TrackerView.js:641` passes it into StakesBar; the Monday-after detection anchor is
    `prevWeekOutcome` at `:95`). Reconcile its copy and styling with the locked design in the
    mock's bottom section: muted flame, neutral border, copy "Streak ended at N weeks. Your rank
    kept every XP. New streak starts with this week's goal." If the shipped variant already
    matches in substance, align wording only; do not rebuild it.

## Verified code anchors (checked against this repo 2026-07-09)

Phase 2 is read-only over Phase 1's state. Everything it needs already exists:

- **`weekMeta`** — React state `App.js:139`, persisted `App.js:322`, store default `main.js:175`.
  Frozen per-week snapshots keyed by LOCAL Monday-ISO: `{ target, nowPlaying, outcome, recap }`.
  Past weeks render with THEIR frozen target/game/outcome/recap. Never recompute a past week
  from today's settings.
- **`streakState`** — `{ evaluatedThroughMondayISO, current, best }`, default `main.js:177`,
  state `App.js:141`. Rollover engine: `evaluateRollover` `trackerEngine.js:146` (runs on launch
  and tracker writes, `App.js:359-370`).
- **`trackerData` entries** — permanent, uncapped. Publish-created entries carry `platformResults`
  (actual succeeded platforms + post IDs, url where derivable) written at `QueueView.js:1034-1038`;
  manual entries get picker-chosen `platformResults` rows (no postId) at `TrackerView.js:254`;
  CSV round-trips the column (`TrackerView.js:355, 371-376`). Per-platform recap math lives in
  `trackerEngine.js:130-131`.
- **Local dates everywhere** — entry dates and weekMeta keys are local-calendar, not UTC
  (comment anchor `TrackerView.js:23`). The calendar's month/week/day math must use the same
  local-date helpers. Do not introduce `toISOString()` date keys.
- **Calendar pill (the thing you're enabling)** — `TrackerView.js:438-439`, currently
  `disabled title="Calendar view — coming in Phase 2"`.

Coder verifies before building (small, but unverified by this spec):
- The read path for scheduled clips (future preview counts + slot times). The Queue renders
  scheduled clips today; the calendar needs the same data read-only, grouped by local date.
  Display count + times only; no actions.

## Behavior details

- **Month model:** weeks are Mon..Sat rows; a week row renders if any of its 6 days falls in the
  displayed month; adjacent-month days render dimmed. Month arrows navigate; a Today button
  returns to the current month. Default view = current month.
- **Day cell click zones:** past + today days open the drawer. Future days open the drawer only
  if they have scheduled clips; otherwise inert. Weeks with no data (before tracking existed)
  show a "No data" rail chip and blank cells, nothing clickable.
- **Entries without `platformResults`** (pre-Phase-1 history): count toward day/week totals,
  render in the drawer as "platforms unknown", excluded from per-platform recap counts (same
  rule Phase 1 locked).
- **Live week in the grid:** today gets the accent ring + TODAY tag; the live week's rail chip
  shows LIVE with the pace-colored bar; its recap is not frozen (it lives on the This week view).
- **Performance:** group `trackerData` by local date once per render of the visible month; never
  scan the full array per cell. `trackerData` is uncapped and grows forever.

## The view itself

- Same conventions as TrackerView: inline-`T`-theme style (extend `theme.js` only if a token is
  genuinely missing), DM Sans + JetBrains Mono, no CDN assets, no new icon system.
- Structure suggestion (coder's call on exact split): a `TrackerCalendar` component file beside
  TrackerView, plus pure month-model helpers (monthWeeks, groupByDate, week aggregation) in
  `trackerEngine.js` or a sibling pure module WITH unit tests like the Phase 1 engine.
- Escape closes drawer and drill-in. Drawer and drill-in follow the mock's layout.
- No new IPC. No store/schema changes. No new persisted state.

## Build order

1. Pure month-model helpers (month rows, local-date grouping, week aggregates) + unit tests.
2. Calendar grid + week rail + month stats, static against real data (enable the pill).
3. Day drawer (posted + scheduled variants, View links from `platformResults`).
4. Week drill-in (banners, read-only day columns, frozen recap render; reuse the Phase 1 recap
   card renderer if it extracts cleanly, otherwise a read-only variant).
5. Future preview wiring (scheduled counts on cells + drawer rows).
6. Streak-lost copy/design reconcile on the This week StakesBar (decision 10).
7. `npm run build:renderer` + `npm start`, self-review, then Fega verification below.

## Verification (Fega, plain — ~5 min in the running app)

1. Open the Tracker, hit Calendar: this month appears with your real posted days, each day
   showing its count and colored segments that match what you actually posted.
2. Click yesterday: the drawer lists your real clips with times and platforms, and the YouTube
   links open the actual live posts.
3. Click a finished week's chip: the drill-in shows that week's frozen target and outcome, and
   the recap numbers match what that week really was (not today's settings).
4. Arrow back to a month before the tracker existed: calm "No data", nothing broken.
5. Look at next week: faint, shows scheduled counts if any, and there is no way to schedule,
   log, or edit anything from the calendar.
6. Confirm there is no Sunday column anywhere.
7. The streak number in the rail matches the This week view's streak chip.
8. ✅ all of the above / ❌ anything reads wrong, dead, or mutable.

## Watch out for

- READ-ONLY is the invariant. If any calendar interaction writes state, it's wrong.
- Past weeks render from `weekMeta` snapshots, never recomputed from current target/game.
- Local dates only; a UTC key will shift evening posts to the wrong day (the exact bug Phase 1
  fixed app-wide).
- The mock's fake data behaviors are fiction (pinned today, fabricated clip detail). Real
  drawer/drill-in content comes from `trackerData` + `weekMeta` + the publish log, nothing else.
- No em or en dashes in any UI copy. Ranges are "X to Y", separators are middots or commas.
- Do not copy the mock's hardcoded month list, seeded weeks, or its deterministic fake
  `clipsFor()` generator into the app.
