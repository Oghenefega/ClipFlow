// Tracker Calendar (Phase 2) — pure month-model logic.
// Read-only over Phase 1 state: derives the month grid, groups entries by local date,
// aggregates each week's scoreboard, and reconstructs the per-week streak from the frozen
// outcome history in weekMeta (which stores only a running streakState, never per-week).
// No React, no Date.now() — every function takes dates/today as arguments. Local dates only.

import { localISO, mondayISO, addDaysISO, weekEntries, computeRecap } from "./trackerEngine";

// Inverse of localISO: parse a YYYY-MM-DD string to a local Date (noon, to sidestep DST edges).
function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/**
 * Weeks (Mon..Sat) that intersect the given month. A week row is included if any of its 6
 * days falls in `month`; each day is tagged inMonth so adjacent-month days can render dimmed.
 * Returns [{ mondayISO, days: [{ iso, dayNum, inMonth }] }] in chronological order.
 */
export function monthWeeks(year, month) {
  const first = new Date(year, month, 1, 12);
  const last = new Date(year, month + 1, 0, 12); // last calendar day of the month
  const rows = [];
  let monIso = mondayISO(first);
  // A month spans at most 6 Mon..Sat rows; the <= guard terminates well within that.
  while (parseISO(monIso) <= last) {
    const days = [];
    let anyInMonth = false;
    for (let i = 0; i < 6; i++) {
      const iso = addDaysISO(monIso, i);
      const d = parseISO(iso);
      const inMonth = d.getMonth() === month && d.getFullYear() === year;
      if (inMonth) anyInMonth = true;
      days.push({ iso, dayNum: d.getDate(), inMonth });
    }
    if (anyInMonth) rows.push({ mondayISO: monIso, days });
    monIso = addDaysISO(monIso, 7);
  }
  return rows;
}

/**
 * Groups tracker entries by their local `date` (YYYY-MM-DD) in a single pass.
 * Returns a Map so the visible month can look up per-day entries without rescanning.
 */
export function groupByLocalDate(entries) {
  const map = new Map();
  for (const entry of entries || []) {
    if (!entry || !entry.date) continue;
    const list = map.get(entry.date);
    if (list) list.push(entry);
    else map.set(entry.date, [entry]);
  }
  return map;
}

/**
 * Reconstructs the streak as of the end of each evaluated (frozen) week purely from outcome
 * history. weekMeta stores only the current running streakState, so past-week streak numbers
 * (needed by the rail chip and drill-in banners) must be recomputed here, never guessed.
 *
 * For each week returns { streakAfter, lostStreak }:
 *   - hit    → streakAfter = the running consecutive-hit count including this week
 *   - missed → lostStreak  = the streak that just ended (the run of hits before this week)
 * A non-consecutive Monday breaks the run (same rule as evaluateRollover).
 */
export function streakByWeek(weekMeta) {
  const weeks = Object.keys(weekMeta || {})
    .filter((k) => weekMeta[k] && weekMeta[k].outcome)
    .sort();
  const result = {};
  let run = 0;
  let prevKey = null;
  for (const weekKey of weeks) {
    const consecutive = prevKey === null || addDaysISO(prevKey, 7) === weekKey;
    if (weekMeta[weekKey].outcome === "hit") {
      run = consecutive ? run + 1 : 1;
      result[weekKey] = { streakAfter: run, lostStreak: 0 };
    } else {
      // The run that was alive coming into this missed week is what got lost.
      result[weekKey] = { streakAfter: 0, lostStreak: consecutive ? run : 0 };
      run = 0;
    }
    prevKey = weekKey;
  }
  return result;
}

/**
 * Aggregates one week for the scoreboard rail. Read-only: past weeks render from their frozen
 * weekMeta snapshot (target/game/outcome/recap), never recomputed from today's settings.
 *
 * `state` is derived from position relative to today:
 *   current  → this week's Monday (live, not frozen)
 *   future   → a later week (faint preview, scheduled counts only)
 *   hit/missed → a decided past week (from weekMeta.outcome)
 *   noData   → no snapshot and nothing posted (before tracking existed)
 */
export function weekAggregate({ mondayIso, weekMeta, entriesByDate, scheduledByDate, streakMap, todayMondayIso, streakState }) {
  const meta = weekMeta?.[mondayIso] || null;

  let posted = 0;
  let bestDay = 0;
  let sched = 0;
  for (let i = 0; i < 6; i++) {
    const iso = addDaysISO(mondayIso, i);
    const c = entriesByDate.get(iso)?.length || 0;
    posted += c;
    if (c > bestDay) bestDay = c;
    sched += scheduledByDate?.get(iso)?.length || 0;
  }

  const hasData = !!meta || posted > 0;
  if (!hasData && sched === 0 && mondayIso < todayMondayIso) {
    return { mondayIso, state: "noData", posted: 0, sched: 0 };
  }

  let state;
  if (mondayIso === todayMondayIso) state = "current";
  else if (mondayIso > todayMondayIso) state = "future";
  else state = meta?.outcome === "hit" ? "hit" : "missed";

  const target = meta?.target ?? null;
  const game = meta?.nowPlaying ?? null;
  const streakInfo = streakMap?.[mondayIso] || { streakAfter: 0, lostStreak: 0 };
  // The live week's streak on the line is the current running streak from streakState.
  const streakAfter = state === "current" ? (streakState?.current || 0) : streakInfo.streakAfter;

  return {
    mondayIso, state, target, game, posted, sched, bestDay,
    streakAfter, lostStreak: streakInfo.lostStreak,
    recap: meta?.recap || null,
  };
}

/**
 * The slim month-stats line above the grid: clips posted in the displayed month, weeks
 * hit / weeks decided, the current running streak, and the best single day this month.
 * Counts only in-month days so a week spanning two months contributes to each honestly.
 */
export function monthStats({ rows, weekMeta, entriesByDate, streakState, todayMondayIso }) {
  let clips = 0;
  let bestDay = 0;
  for (const row of rows) {
    for (const day of row.days) {
      if (!day.inMonth) continue;
      const c = entriesByDate.get(day.iso)?.length || 0;
      clips += c;
      if (c > bestDay) bestDay = c;
    }
  }

  let done = 0;
  let hits = 0;
  for (const row of rows) {
    const mon = row.mondayIso;
    if (mon >= todayMondayIso) continue; // skip current + future weeks
    const meta = weekMeta?.[mon];
    if (!meta || !meta.outcome) continue;
    done++;
    if (meta.outcome === "hit") hits++;
  }

  return { clips, hits, done, streak: streakState?.current || 0, bestDay };
}

/**
 * Pace-colored bar fraction+color for a live week's rail chip, reusing Phase 1 pace thresholds
 * (green on/ahead, yellow within 85%, red behind). Days elapsed is Mon..today within the week.
 */
export function liveWeekPaceColor({ posted, target, todayIso, mondayIso }) {
  if (!target || target <= 0) return { frac: 0, color: "green" };
  // elapsed active days (Mon..today, capped at 6); today counts as elapsed.
  let elapsed = 0;
  for (let i = 0; i < 6; i++) {
    if (addDaysISO(mondayIso, i) <= todayIso) elapsed++;
  }
  const expected = (target * elapsed) / 6;
  let color;
  if (posted >= expected) color = "green";
  else if (posted >= expected * 0.85) color = "yellow";
  else color = "red";
  return { frac: Math.min(1, posted / target), color };
}
