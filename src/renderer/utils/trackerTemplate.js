/**
 * trackerTemplate.js — the weekly posting template: which time slots exist,
 * what sits in each day/slot cell, and which days of the week the creator
 * actually posts on ("active days").
 *
 * Pure logic for the Now Playing Tracker, split out of TrackerView so pace and
 * day-toggling can be unit-tested. CJS on purpose (jest runs it with no babel);
 * the renderer imports the named bindings and Vite handles the interop.
 *
 * Shape: { timeSlots: string[], grid: { Monday..Sunday: string[] }, activeDays: string[] }
 * Legacy stores predate both `activeDays` and `grid.Sunday`, so every reader
 * here is lenient and `normalizeTemplate` is the one place that fills the gaps.
 * PURE — no state, no side effects, every date arrives as an argument.
 */

const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEK_DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Mon–Sat: the shape every template had before active days existed.
const DEFAULT_ACTIVE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * A template's active days in Mon..Sun order. Missing, not an array, or
 * nothing recognisable left after filtering → a copy of the Mon–Sat default.
 */
function activeDaysOf(template) {
  const raw = template && template.activeDays;
  if (!Array.isArray(raw)) return DEFAULT_ACTIVE_DAYS.slice();
  const kept = WEEK_DAYS.filter((day) => raw.includes(day));
  return kept.length ? kept : DEFAULT_ACTIVE_DAYS.slice();
}

/** Does this template post on `dayName`? */
function isActiveDay(template, dayName) {
  return activeDaysOf(template).includes(dayName);
}

/** The last active day of the week, e.g. "Saturday" — the week's deadline. */
function lastActiveDayName(template) {
  const days = activeDaysOf(template);
  return days[days.length - 1];
}

/** Weekday of a Date as a Monday-first index: Mon=0 … Sun=6. */
function mondayIndex(date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

/** Active days up to and including today. Today always counts. */
function elapsedActiveDays(template, date) {
  const today = mondayIndex(date);
  return activeDaysOf(template).filter((day) => WEEK_DAYS.indexOf(day) <= today).length;
}

/** Active days still ahead — strictly after today. */
function activeDaysLeftAfter(template, date) {
  const today = mondayIndex(date);
  return activeDaysOf(template).filter((day) => WEEK_DAYS.indexOf(day) > today).length;
}

/**
 * Pace status against a weekly target, prorated over the template's OWN active
 * days rather than a hardcoded six (see paceInfo in trackerEngine.js).
 */
function paceForTemplate({ posted, target, date, template }) {
  const activeCount = activeDaysOf(template).length;
  const elapsedActive = elapsedActiveDays(template, date);
  const expected = target > 0 && activeCount > 0 ? (target * elapsedActive) / activeCount : 0;
  const expectedRounded = Math.round(expected);
  const diff = posted - expectedRounded;

  let status;
  if (posted >= expected) status = "green";
  else if (posted >= expected * 0.85) status = "yellow";
  else status = "red";

  return { expected, expectedRounded, diff, status, daysLeft: activeDaysLeftAfter(template, date) };
}

/**
 * A NEW template with every key present and in a fixed order: all 7 days in the
 * grid, a column per time slot ("main" where a legacy store had none, e.g. the
 * Sunday it never stored), and resolved activeDays. Idempotent, and two
 * equivalent inputs stringify identically whatever order their keys arrived in.
 */
function normalizeTemplate(tmpl) {
  const timeSlots = Array.isArray(tmpl && tmpl.timeSlots) ? tmpl.timeSlots.slice() : [];
  const srcGrid = (tmpl && tmpl.grid) || {};
  const grid = {};
  for (const day of WEEK_DAYS) {
    grid[day] = Array.isArray(srcGrid[day]) ? srcGrid[day].slice() : new Array(timeSlots.length).fill("main");
  }
  return { timeSlots, grid, activeDays: activeDaysOf(tmpl) };
}

/**
 * Normalized copy with `dayName` flipped on or off. Turning off the last active
 * day would leave a week with no posting days at all, so that returns the SAME
 * reference — the caller compares identity to detect the refusal.
 */
function withDayToggled(template, dayName) {
  const current = activeDaysOf(template);
  const turningOff = current.includes(dayName);
  if (turningOff && current.length === 1) return template;

  const next = turningOff
    ? current.filter((day) => day !== dayName)
    : WEEK_DAYS.filter((day) => current.includes(day) || day === dayName);

  const out = normalizeTemplate(template);
  out.activeDays = next;
  return out;
}

/**
 * Sort the time slots chronologically, carrying every day's grid column along
 * so each cell stays with its slot. `parseTimeToMinutes` is injected because
 * the renderer already owns one. A day missing from the grid fills with "main".
 */
function sortTemplateByTime(tmpl, parseTimeToMinutes) {
  const slots = Array.isArray(tmpl && tmpl.timeSlots) ? tmpl.timeSlots : [];
  const srcGrid = (tmpl && tmpl.grid) || {};
  const indices = slots
    .map((t, i) => ({ t, i, m: parseTimeToMinutes(t) }))
    .sort((a, b) => a.m - b.m);

  const grid = {};
  for (const day of WEEK_DAYS) {
    const column = srcGrid[day] || [];
    grid[day] = indices.map((x) => column[x.i] || "main");
  }

  return normalizeTemplate({
    timeSlots: indices.map((x) => x.t),
    grid,
    activeDays: tmpl && tmpl.activeDays,
  });
}

module.exports = {
  WEEK_DAYS,
  WEEK_DAYS_SHORT,
  DEFAULT_ACTIVE_DAYS,
  activeDaysOf,
  isActiveDay,
  lastActiveDayName,
  mondayIndex,
  elapsedActiveDays,
  activeDaysLeftAfter,
  paceForTemplate,
  normalizeTemplate,
  withDayToggled,
  sortTemplateByTime,
};
