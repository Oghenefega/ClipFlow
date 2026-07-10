# ClipFlow — Session Handoff
_Last updated: 2026-07-09 — Session 97 — **Tracker Phase 2 (Calendar) BUILT + Fega-verified in dev (7/7), fresh-eyes review fixed 4 real bugs, installer 0.1.8-alpha.13 cut (sessions 91–97 promoted to the daily driver).**_

---

## One-line TL;DR
Built the read-only Tracker Calendar from Wick's locked P3 Hybrid spec (`3e156e6`), Fega verified all 7 checks in dev same-session; a "fresh eyes" re-review then caught and fixed 4 real bugs + 5 polish items (`beaa24f`) including a monthStats casing bug my own tests had masked; filed #161 (add Sundays — product decision); cut installer **0.1.8-alpha.13** promoting the whole Tracker arc.

## Current State
- **Installed daily driver: 0.1.8-alpha.13 — INSTALLED AND CONFIRMED** (Fega reinstalled end-of-session, Settings reads v0.1.8-alpha.13). The daily driver now carries the full Tracker arc.
- **Tracker Phase 2 is DONE and verified** (dev build, 7/7 checks): month grid + week rail + month stats, day drawer with live post links, week drill-in with frozen recaps, future preview from Queue scheduled clips, streak-lost stakes state reconciled (decision 10). Read-only, zero new persisted state, all local dates.
- Working tree: usual never-commit `data/` pair + untracked `tasks/mocks/` scratch.

## What Was Just Built
- **`src/renderer/views/TrackerCalendar.js`** (new) — the whole Calendar view: grid, rail, stats, DayDrawer, WeekDrill. Escape closes overlays; drawer z 3000, drill z 3100 (toast 4000 stays on top).
- **`src/renderer/utils/trackerCalendarModel.js`** (new, pure) + **19-assertion test** (`node src/renderer/utils/trackerCalendarModel.test.js`): monthWeeks (Mon–Sat rows), groupByLocalDate, streakByWeek (rebuilds per-week streaks from frozen outcomes — weekMeta only stores the running streak), weekAggregate, monthStats, liveWeekPaceColor.
- **TrackerView.js** — `subView` state ("week"/"calendar"), both toggle pills live; switching to Calendar clears popover/picker/template-editor state. StakesBar gained the calm streak-lost branch (only when `lostStreakLen > 0`; back-to-back misses show "start your streak" instead).
- **App.js** — `scheduledClips` memo (date/time/title/game from `scheduledAt`, local string slicing, gameTag lowercased) passed into TrackerView.
- **Fresh-eyes fix round (`beaa24f`)** — Fega asked for a meticulous re-review after his ✅; it found: (1) `monthStats` read `row.mondayIso` vs the real `mondayISO` → "weeks hit" was always "0 of 0" (test asserted other fields only — lesson filed); (2) pre-Phase-1 history weeks rendered "Missed · streak reset" → new **"untracked"** state ("N posted · Before goal tracking"); (3) week scores counted Mon–Sat while frozen outcomes count Mon–Sun → 7-day parity; (4) drill-in game tags invisible (missing background). Plus: time-sorted day lists, no "streak ended at 0 weeks", no "NOW PLAYING UNKNOWN", inert no-data cells, sched rows show game tags, plural fix.

## Key Decisions
- **"Untracked" week state** (not in Wick's spec): past weeks with entries but no frozen weekMeta get an honest no-judgement chip. Fega's prod DB has months of these; never render them as "Missed".
- **Week rail scores are Mon–Sun** even though no Sunday column exists — must match the frozen outcome math (`weekEntries`), else a hit week can read "41/42 HIT".
- **Drill-in recap mark = ClipFlow** (standing override; spec text says Flowve — don't regress).
- **#161 filed (Fega's product call): add Sundays to schedule + calendars.** Mon–Sat is his personal conviction, not a product rule. `milestone: commercial-launch` — Sunday posters' clips currently count but render nowhere. Body has all code anchors.
- **Streak-lost copy**: exact locked wording "Streak ended at N weeks. Your rank kept every XP. New streak starts with this week's goal." + "Last week · N of T" sub.

## Next Steps (prioritized)
1. ~~Fega reinstalls alpha.13~~ DONE (confirmed v0.1.8-alpha.13). Still worth a casual spot-check of the Tracker Calendar on the installed app with real prod data — prod has NO weekMeta history yet, so old weeks should read "Before goal tracking" / "No data", not "Missed".
2. **Phase 1 closeout check** (still pending): first REAL publish through the Queue → today's column +1, ring +1, XP +10, detail popover shows actual platforms with working links.
3. **Wick's post-verification skim** — inbox updated this session (Phase 2 report + #161 flagged as GM-relevant); his 2026-07-05 item can archive once he skims.
4. **#161 Sundays (7-day support)** — later session; full anchors in the issue.
5. **Silent-failures batch** #150/#151/#152 (+#153) — session-92 plan.
6. **Projects tab finish** (premium header + width-capped column + hover-to-play + REVIEW pill).

## Watch Out For
- **Prod first-run of the Calendar**: rollover only freezes weeks from first-launch forward, so ALL prod history pre-alpha.13 renders as "untracked" — that's by design, not a bug.
- **`monthStats` vs `weekAggregate` casing**: model returns `mondayISO` on rows but `mondayIso` inside aggregates — the exact mismatch that caused the 0-of-0 bug. Grep the boundary if touching either.
- **Test suite must assert EVERY field** a pure function returns (session 97 lesson — partial assertions passed 16/16 over a broken stat).
- **XP ledger append-only; calendar dates LOCAL (`localISO`)** — standing invariants.
- **`package.json` now 105 lines** (was 99) — silent-strip check baseline updated ([[project_package_json_strip]]).

## Logs / Debugging
- **Builds:** `build:renderer` clean ×3 (12–14s, standing >500 kB warning only); calendar model tests 19/19; installer build (npm run build → NSIS) run in background this session — artifact `dist/ClipFlow Setup 0.1.8-alpha.13.exe`.
- **Fega's dev verification:** all 7 Phase 2 checks ✅ in `npm run dev` (clipflow-dev profile). No renderer errors reported.
- **Commits this session:** `3e156e6` (Phase 2 build), `beaa24f` (review fixes), `7c309b3` (lesson), + alpha.13 bump, + this wrap.
