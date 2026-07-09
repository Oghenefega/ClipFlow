/**
 * Unit tests for trackerCalendarModel — Phase 2 Calendar pure logic.
 *
 * Run: node src/renderer/utils/trackerCalendarModel.test.js
 *
 * Loads the ESM sources the same way segmentWords.test.js does: read, strip export/import,
 * eval into a shared scope so the model's helpers see trackerEngine's helpers.
 */
const fs = require("fs");
const path = require("path");

// ── Load trackerEngine then trackerCalendarModel into one eval scope ──
const engineSrc = fs.readFileSync(path.join(__dirname, "trackerEngine.js"), "utf-8")
  .replace(/^export function /gm, "function ")
  .replace(/^export const /gm, "const ")
  .replace(/^export \{[^}]*\};?$/gm, "")
  .replace(/^export /gm, "");
const modelSrc = fs.readFileSync(path.join(__dirname, "trackerCalendarModel.js"), "utf-8")
  .replace(/^import[^;]*;$/gm, "") // drop the `import { ... } from "./trackerEngine"` line
  .replace(/^export function /gm, "function ")
  .replace(/^export const /gm, "const ")
  .replace(/^export /gm, "");
eval(engineSrc);
eval(modelSrc);

// ── Tiny runner (no Jest) ──
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; failures.push({ name, error: e.message }); console.log(`  ✗ ${name}\n    ${e.message}`); }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || ""} Expected ${b}, got ${a}`);
}
function ok(cond, msg) { if (!cond) throw new Error(msg || "expected truthy"); }

const entry = (date, extra = {}) => ({ id: date + Math.random(), date, time: "1:30 PM", game: "arc", source: "clipflow", ...extra });

console.log("\nTracker Calendar Model Tests");
console.log("=".repeat(48));

// ── monthWeeks ──
console.log("\nmonthWeeks:");
test("July 2026 starts on the Monday of its first week (Jun 29)", () => {
  const rows = monthWeeks(2026, 6); // month is 0-indexed → July
  eq(rows[0].mondayISO, "2026-06-29");
});
test("every row has exactly 6 days, Mon..Sat (no Sunday)", () => {
  const rows = monthWeeks(2026, 6);
  rows.forEach((r) => eq(r.days.length, 6));
  // First day of the first row is a Monday.
  const first = rows[0].days[0].iso;
  ok(first === rows[0].mondayISO, "row day[0] is its Monday");
});
test("adjacent-month days are flagged inMonth:false", () => {
  const rows = monthWeeks(2026, 6);
  // Jun 29/30 are in the first row but not in July.
  const jun29 = rows[0].days.find((d) => d.iso === "2026-06-29");
  const jul1 = rows[0].days.find((d) => d.iso === "2026-07-01");
  eq(jun29.inMonth, false);
  eq(jul1.inMonth, true);
});
test("a week row is included only if some day lands in the month", () => {
  const rows = monthWeeks(2026, 6);
  rows.forEach((r) => ok(r.days.some((d) => d.inMonth), "row must intersect month"));
});
test("February 2026 (non-leap) resolves without infinite loop", () => {
  const rows = monthWeeks(2026, 1);
  ok(rows.length >= 4 && rows.length <= 6, "reasonable row count");
  ok(rows.some((r) => r.days.some((d) => d.dayNum === 28 && d.inMonth)), "Feb 28 present");
});

// ── groupByLocalDate ──
console.log("\ngroupByLocalDate:");
test("buckets entries by date", () => {
  const m = groupByLocalDate([entry("2026-07-06"), entry("2026-07-06"), entry("2026-07-07")]);
  eq(m.get("2026-07-06").length, 2);
  eq(m.get("2026-07-07").length, 1);
});
test("tolerates empty / undefined input", () => {
  eq(groupByLocalDate(undefined).size, 0);
  eq(groupByLocalDate([]).size, 0);
});

// ── streakByWeek ──
console.log("\nstreakByWeek:");
test("consecutive hits accumulate streakAfter", () => {
  const meta = {
    "2026-06-01": { outcome: "hit" }, "2026-06-08": { outcome: "hit" }, "2026-06-15": { outcome: "hit" },
  };
  const s = streakByWeek(meta);
  eq(s["2026-06-01"].streakAfter, 1);
  eq(s["2026-06-08"].streakAfter, 2);
  eq(s["2026-06-15"].streakAfter, 3);
});
test("a miss records the lost streak and resets the run", () => {
  const meta = {
    "2026-05-04": { outcome: "hit" }, "2026-05-11": { outcome: "hit" },
    "2026-05-18": { outcome: "hit" }, "2026-05-25": { outcome: "missed" },
    "2026-06-01": { outcome: "hit" },
  };
  const s = streakByWeek(meta);
  eq(s["2026-05-18"].streakAfter, 3);
  eq(s["2026-05-25"].lostStreak, 3);
  eq(s["2026-05-25"].streakAfter, 0);
  eq(s["2026-06-01"].streakAfter, 1); // run restarts after the miss
});
test("a non-consecutive Monday breaks the run", () => {
  const meta = { "2026-06-01": { outcome: "hit" }, "2026-06-15": { outcome: "hit" } }; // gap week
  const s = streakByWeek(meta);
  eq(s["2026-06-15"].streakAfter, 1);
});

// ── weekAggregate ──
console.log("\nweekAggregate:");
const todayMon = "2026-07-06";
test("current week is 'current' with live streak from streakState", () => {
  const ebd = groupByLocalDate([entry("2026-07-06"), entry("2026-07-06")]);
  const w = weekAggregate({ mondayIso: todayMon, weekMeta: { [todayMon]: { target: 48, nowPlaying: "Arc Raiders" } }, entriesByDate: ebd, scheduledByDate: new Map(), streakMap: {}, todayMondayIso: todayMon, streakState: { current: 5 } });
  eq(w.state, "current");
  eq(w.posted, 2);
  eq(w.streakAfter, 5);
});
test("past hit week renders from frozen meta + derived streak", () => {
  const mon = "2026-06-29";
  const ebd = groupByLocalDate(Array.from({ length: 48 }, () => entry("2026-06-29")));
  const meta = { [mon]: { target: 48, nowPlaying: "Arc Raiders", outcome: "hit", recap: { clips: 48 } } };
  const w = weekAggregate({ mondayIso: mon, weekMeta: meta, entriesByDate: ebd, scheduledByDate: new Map(), streakMap: { [mon]: { streakAfter: 5, lostStreak: 0 } }, todayMondayIso: todayMon, streakState: { current: 5 } });
  eq(w.state, "hit");
  eq(w.target, 48);
  eq(w.streakAfter, 5);
  eq(w.recap.clips, 48);
});
test("future week is 'future' with scheduled counts only", () => {
  const mon = "2026-07-13";
  const sbd = groupByLocalDate([{ date: "2026-07-13" }, { date: "2026-07-14" }]);
  const w = weekAggregate({ mondayIso: mon, weekMeta: {}, entriesByDate: new Map(), scheduledByDate: sbd, streakMap: {}, todayMondayIso: todayMon, streakState: {} });
  eq(w.state, "future");
  eq(w.posted, 0);
  eq(w.sched, 2);
});
test("empty past week with no snapshot is noData", () => {
  const mon = "2026-01-05";
  const w = weekAggregate({ mondayIso: mon, weekMeta: {}, entriesByDate: new Map(), scheduledByDate: new Map(), streakMap: {}, todayMondayIso: todayMon, streakState: {} });
  eq(w.state, "noData");
});
test("past week with entries but no snapshot is untracked (pre-goal history, never 'missed')", () => {
  const mon = "2026-05-04";
  const ebd = groupByLocalDate([entry("2026-05-04"), entry("2026-05-05"), entry("2026-05-06")]);
  const w = weekAggregate({ mondayIso: mon, weekMeta: {}, entriesByDate: ebd, scheduledByDate: new Map(), streakMap: {}, todayMondayIso: todayMon, streakState: {} });
  eq(w.state, "untracked");
  eq(w.posted, 3);
  eq(w.target, null);
});
test("a Sunday entry counts toward its week's score (Phase 1 weekEntries parity)", () => {
  const mon = "2026-06-29";
  // Jul 5 2026 is the Sunday of the week starting Mon Jun 29.
  const ebd = groupByLocalDate([entry("2026-06-29"), entry("2026-07-05")]);
  const meta = { [mon]: { target: 2, nowPlaying: "Arc Raiders", outcome: "hit", recap: { clips: 2 } } };
  const w = weekAggregate({ mondayIso: mon, weekMeta: meta, entriesByDate: ebd, scheduledByDate: new Map(), streakMap: {}, todayMondayIso: todayMon, streakState: {} });
  eq(w.posted, 2); // 1 Monday + 1 Sunday — must match the frozen outcome's math
});

// ── monthStats ──
console.log("\nmonthStats:");
test("counts only in-month clips, and decided weeks register in hits/done", () => {
  const rows = monthWeeks(2026, 6);
  const ebd = groupByLocalDate([
    entry("2026-06-29"), // adjacent (June) — must NOT count toward July
    entry("2026-07-01"), entry("2026-07-01"), entry("2026-07-02"),
  ]);
  const meta = {
    "2026-06-29": { outcome: "hit" }, // Monday in the first displayed row, decided
  };
  const stats = monthStats({ year: 2026, month: 6, rows, weekMeta: meta, entriesByDate: ebd, streakState: { current: 5 }, todayMondayIso: "2026-07-06" });
  eq(stats.clips, 3); // Jun 29 excluded, three July clips counted
  eq(stats.bestDay, 2); // Jul 1 had 2
  eq(stats.streak, 5);
  eq(stats.done, 1, "decided weeks in view must be counted");
  eq(stats.hits, 1, "hit weeks in view must be counted");
});
test("Sunday clips count toward the month total (no Sunday column, still honest)", () => {
  const rows = monthWeeks(2026, 6);
  const ebd = groupByLocalDate([entry("2026-07-05")]); // Sunday Jul 5
  const stats = monthStats({ year: 2026, month: 6, rows, weekMeta: {}, entriesByDate: ebd, streakState: {}, todayMondayIso: "2026-07-06" });
  eq(stats.clips, 1);
});

// ── liveWeekPaceColor ──
console.log("\nliveWeekPaceColor:");
test("ahead of pace is green, far behind is red", () => {
  // Monday, 1 day elapsed, target 48 → expected 8. posted 10 → green.
  const green = liveWeekPaceColor({ posted: 10, target: 48, todayIso: "2026-07-06", mondayIso: "2026-07-06" });
  eq(green.color, "green");
  // posted 2 vs expected 8 → below 85% → red.
  const red = liveWeekPaceColor({ posted: 2, target: 48, todayIso: "2026-07-06", mondayIso: "2026-07-06" });
  eq(red.color, "red");
});

// ── summary ──
console.log("\n" + "=".repeat(48));
console.log(`${passed} passed, ${failed} failed`);
if (failed) { failures.forEach((f) => console.log(`  ✗ ${f.name}: ${f.error}`)); process.exit(1); }
