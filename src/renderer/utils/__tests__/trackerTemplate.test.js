const {
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
} = require("../trackerTemplate");

// Local dates built with the (y, m, d) constructor so no timezone can shift the
// weekday. Each test asserts the weekday it depends on.
const MONDAY = new Date(2026, 8, 7);
const TUESDAY = new Date(2026, 8, 8);
const WEDNESDAY = new Date(2026, 8, 9);
const SATURDAY = new Date(2026, 8, 12);
const SUNDAY = new Date(2026, 8, 13);

const ALL_SEVEN = WEEK_DAYS.slice();
const MWF = ["Monday", "Wednesday", "Friday"];

/** Minimal 12-hour parser, injected into sortTemplateByTime the way the view does. */
const parseTimeToMinutes = (label) => {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(String(label || ""));
  if (!m) return 0;
  const hour12 = parseInt(m[1], 10) % 12;
  const hour = m[3].toUpperCase() === "PM" ? hour12 + 12 : hour12;
  return hour * 60 + parseInt(m[2], 10);
};

test("the fixture dates really are the weekdays the tests assume", () => {
  expect(MONDAY.getDay()).toBe(1);
  expect(TUESDAY.getDay()).toBe(2);
  expect(WEDNESDAY.getDay()).toBe(3);
  expect(SATURDAY.getDay()).toBe(6);
  expect(SUNDAY.getDay()).toBe(0);
});

describe("constants", () => {
  test("the week runs Monday to Sunday", () => {
    expect(WEEK_DAYS).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
  });

  test("the short names line up one-for-one with the long ones", () => {
    expect(WEEK_DAYS_SHORT).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(WEEK_DAYS_SHORT).toHaveLength(WEEK_DAYS.length);
  });

  test("the default active week is Monday to Saturday", () => {
    expect(DEFAULT_ACTIVE_DAYS).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
  });
});

describe("activeDaysOf", () => {
  test("a legacy template with no activeDays gets the Mon–Sat default", () => {
    expect(activeDaysOf({ timeSlots: [], grid: {} })).toEqual(DEFAULT_ACTIVE_DAYS);
  });

  test("a missing or non-array template is tolerated", () => {
    expect(activeDaysOf(undefined)).toEqual(DEFAULT_ACTIVE_DAYS);
    expect(activeDaysOf(null)).toEqual(DEFAULT_ACTIVE_DAYS);
    expect(activeDaysOf({ activeDays: "Monday" })).toEqual(DEFAULT_ACTIVE_DAYS);
    expect(activeDaysOf({ activeDays: {} })).toEqual(DEFAULT_ACTIVE_DAYS);
  });

  test("the default is a fresh copy each time, never the shared array", () => {
    const first = activeDaysOf({});
    first.push("mutated");
    expect(activeDaysOf({})).toEqual(DEFAULT_ACTIVE_DAYS);
    expect(DEFAULT_ACTIVE_DAYS).not.toContain("mutated");
  });

  test("days come back in Mon..Sun order however they were stored", () => {
    expect(activeDaysOf({ activeDays: ["Sunday", "Wednesday", "Monday"] })).toEqual([
      "Monday",
      "Wednesday",
      "Sunday",
    ]);
  });

  test("unknown names are filtered out", () => {
    expect(activeDaysOf({ activeDays: ["Monday", "Funday", "monday", "Friday"] })).toEqual([
      "Monday",
      "Friday",
    ]);
  });

  test("an empty list, or one with nothing recognisable, falls back to the default", () => {
    expect(activeDaysOf({ activeDays: [] })).toEqual(DEFAULT_ACTIVE_DAYS);
    expect(activeDaysOf({ activeDays: ["Funday", "Caturday"] })).toEqual(DEFAULT_ACTIVE_DAYS);
  });

  test("duplicates collapse", () => {
    expect(activeDaysOf({ activeDays: ["Monday", "Monday"] })).toEqual(["Monday"]);
  });
});

describe("isActiveDay", () => {
  test("reads the default week when the template predates activeDays", () => {
    expect(isActiveDay({}, "Monday")).toBe(true);
    expect(isActiveDay({}, "Saturday")).toBe(true);
    expect(isActiveDay({}, "Sunday")).toBe(false);
  });

  test("reads an explicit week", () => {
    const tmpl = { activeDays: MWF };
    expect(isActiveDay(tmpl, "Wednesday")).toBe(true);
    expect(isActiveDay(tmpl, "Thursday")).toBe(false);
  });
});

describe("lastActiveDayName", () => {
  test("the default week ends on Saturday", () => {
    expect(lastActiveDayName({})).toBe("Saturday");
  });

  test("adding Sunday moves the deadline to Sunday", () => {
    expect(lastActiveDayName({ activeDays: ALL_SEVEN })).toBe("Sunday");
  });

  test("a Mon–Wed week ends on Wednesday", () => {
    expect(lastActiveDayName({ activeDays: ["Monday", "Tuesday", "Wednesday"] })).toBe("Wednesday");
  });

  test("order in the stored array does not matter", () => {
    expect(lastActiveDayName({ activeDays: ["Friday", "Monday"] })).toBe("Friday");
  });
});

describe("mondayIndex", () => {
  test("Monday is 0 and Sunday is 6", () => {
    expect(mondayIndex(MONDAY)).toBe(0);
    expect(mondayIndex(SUNDAY)).toBe(6);
  });

  test("the middle of the week counts up from Monday", () => {
    expect(mondayIndex(TUESDAY)).toBe(1);
    expect(mondayIndex(WEDNESDAY)).toBe(2);
    expect(mondayIndex(SATURDAY)).toBe(5);
  });
});

describe("elapsedActiveDays and activeDaysLeftAfter", () => {
  const monSat = { activeDays: DEFAULT_ACTIVE_DAYS };

  test("on a Monday the Mon–Sat week has one day elapsed and five left", () => {
    expect(elapsedActiveDays(monSat, MONDAY)).toBe(1);
    expect(activeDaysLeftAfter(monSat, MONDAY)).toBe(5);
  });

  test("on the Saturday every day has elapsed and none are left", () => {
    expect(elapsedActiveDays(monSat, SATURDAY)).toBe(6);
    expect(activeDaysLeftAfter(monSat, SATURDAY)).toBe(0);
  });

  test("on the Sunday of a Mon–Sat week the week is over, not restarted", () => {
    expect(elapsedActiveDays(monSat, SUNDAY)).toBe(6);
    expect(activeDaysLeftAfter(monSat, SUNDAY)).toBe(0);
  });

  test("a Mon–Sun week has all seven elapsed on the Sunday", () => {
    const monSun = { activeDays: ALL_SEVEN };
    expect(elapsedActiveDays(monSun, SUNDAY)).toBe(7);
    expect(activeDaysLeftAfter(monSun, SUNDAY)).toBe(0);
    expect(elapsedActiveDays(monSun, SATURDAY)).toBe(6);
    expect(activeDaysLeftAfter(monSun, SATURDAY)).toBe(1);
  });

  test("a Mon/Wed/Fri week on a Tuesday counts only the Monday, with two left", () => {
    const mwf = { activeDays: MWF };
    expect(elapsedActiveDays(mwf, TUESDAY)).toBe(1);
    expect(activeDaysLeftAfter(mwf, TUESDAY)).toBe(2);
  });

  test("an active day counts on the day itself, not the day after", () => {
    const mwf = { activeDays: MWF };
    expect(elapsedActiveDays(mwf, WEDNESDAY)).toBe(2);
    expect(activeDaysLeftAfter(mwf, WEDNESDAY)).toBe(1);
  });

  test("elapsed plus left always accounts for every active day", () => {
    for (const date of [MONDAY, TUESDAY, WEDNESDAY, SATURDAY, SUNDAY]) {
      for (const tmpl of [{}, { activeDays: ALL_SEVEN }, { activeDays: MWF }]) {
        expect(elapsedActiveDays(tmpl, date) + activeDaysLeftAfter(tmpl, date)).toBe(
          activeDaysOf(tmpl).length
        );
      }
    }
  });
});

describe("paceForTemplate", () => {
  // The default template matches trackerEngine.paceInfo exactly: target * elapsed / 6.
  const defaultTmpl = {};

  test("a Monday on the default week expects a sixth of the target", () => {
    const pace = paceForTemplate({ posted: 2, target: 12, date: MONDAY, template: defaultTmpl });
    expect(pace).toEqual({ expected: 2, expectedRounded: 2, diff: 0, status: "green", daysLeft: 5 });
  });

  test("a Wednesday on the default week expects half the target", () => {
    const pace = paceForTemplate({ posted: 6, target: 12, date: WEDNESDAY, template: defaultTmpl });
    expect(pace).toEqual({ expected: 6, expectedRounded: 6, diff: 0, status: "green", daysLeft: 3 });
  });

  test("a Saturday on the default week expects the whole target with no days left", () => {
    const pace = paceForTemplate({ posted: 12, target: 12, date: SATURDAY, template: defaultTmpl });
    expect(pace).toEqual({ expected: 12, expectedRounded: 12, diff: 0, status: "green", daysLeft: 0 });
  });

  test("a Sunday on the default week is still the full target — Sunday is not a seventh day", () => {
    const pace = paceForTemplate({ posted: 10, target: 12, date: SUNDAY, template: defaultTmpl });
    expect(pace.expected).toBe(12);
    expect(pace.daysLeft).toBe(0);
    expect(pace.diff).toBe(-2);
  });

  test("green at or above expected, yellow down to 85 percent, red below", () => {
    const at = (posted) =>
      paceForTemplate({ posted, target: 20, date: WEDNESDAY, template: defaultTmpl });
    expect(at(10).expected).toBe(10);
    expect(at(11).status).toBe("green");
    expect(at(10).status).toBe("green");
    expect(at(9).status).toBe("yellow");
    expect(at(8.5).status).toBe("yellow");
    expect(at(8).status).toBe("red");
    expect(at(0).status).toBe("red");
  });

  test("diff is measured against the rounded expectation", () => {
    // Mon–Sat, Tuesday: 10 * 2 / 6 = 3.333..., rounded to 3.
    const pace = paceForTemplate({ posted: 4, target: 10, date: TUESDAY, template: defaultTmpl });
    expect(pace.expected).toBeCloseTo(10 / 3, 10);
    expect(pace.expectedRounded).toBe(3);
    expect(pace.diff).toBe(1);
  });

  test("a seven-day week prorates over seven, not six", () => {
    const monSun = { activeDays: ALL_SEVEN };
    const pace = paceForTemplate({ posted: 14, target: 14, date: SUNDAY, template: monSun });
    expect(pace).toEqual({ expected: 14, expectedRounded: 14, diff: 0, status: "green", daysLeft: 0 });
  });

  test("a Mon/Wed/Fri week on a Tuesday expects only the Monday's third", () => {
    const pace = paceForTemplate({ posted: 3, target: 9, date: TUESDAY, template: { activeDays: MWF } });
    expect(pace).toEqual({ expected: 3, expectedRounded: 3, diff: 0, status: "green", daysLeft: 2 });
  });

  test("a target of zero expects nothing and stays green", () => {
    const pace = paceForTemplate({ posted: 0, target: 0, date: WEDNESDAY, template: defaultTmpl });
    expect(pace).toEqual({ expected: 0, expectedRounded: 0, diff: 0, status: "green", daysLeft: 3 });
  });

  test("a template with no active days cannot divide by zero — it falls back to the default week", () => {
    const empty = { activeDays: [] };
    const pace = paceForTemplate({ posted: 6, target: 12, date: WEDNESDAY, template: empty });
    expect(Number.isFinite(pace.expected)).toBe(true);
    expect(pace).toEqual(paceForTemplate({ posted: 6, target: 12, date: WEDNESDAY, template: {} }));
  });
});

describe("normalizeTemplate", () => {
  const legacy = {
    timeSlots: ["9:00 AM", "5:00 PM"],
    grid: {
      Monday: ["main", "alt"],
      Tuesday: ["main", "main"],
      Wednesday: ["main", "main"],
      Thursday: ["main", "main"],
      Friday: ["main", "main"],
      Saturday: ["alt", "main"],
    },
  };

  test("adds the Sunday a legacy store never wrote, sized to the time slots", () => {
    const out = normalizeTemplate(legacy);
    expect(out.grid.Sunday).toEqual(["main", "main"]);
  });

  test("adds the activeDays a legacy store never wrote", () => {
    expect(normalizeTemplate(legacy).activeDays).toEqual(DEFAULT_ACTIVE_DAYS);
  });

  test("preserves the slots and cell values it was given", () => {
    const out = normalizeTemplate(legacy);
    expect(out.timeSlots).toEqual(["9:00 AM", "5:00 PM"]);
    expect(out.grid.Monday).toEqual(["main", "alt"]);
    expect(out.grid.Saturday).toEqual(["alt", "main"]);
  });

  test("has exactly the three keys in a fixed order, with all seven days in week order", () => {
    const out = normalizeTemplate(legacy);
    expect(Object.keys(out)).toEqual(["timeSlots", "grid", "activeDays"]);
    expect(Object.keys(out.grid)).toEqual(WEEK_DAYS);
  });

  test("copies rather than aliasing the input arrays", () => {
    const out = normalizeTemplate(legacy);
    out.timeSlots.push("11:00 PM");
    out.grid.Monday.push("alt");
    expect(legacy.timeSlots).toHaveLength(2);
    expect(legacy.grid.Monday).toHaveLength(2);
  });

  test("survives a completely empty or missing template", () => {
    for (const input of [undefined, null, {}, { timeSlots: "nope", grid: 7 }]) {
      const out = normalizeTemplate(input);
      expect(out.timeSlots).toEqual([]);
      expect(Object.keys(out.grid)).toEqual(WEEK_DAYS);
      expect(out.grid.Monday).toEqual([]);
      expect(out.activeDays).toEqual(DEFAULT_ACTIVE_DAYS);
    }
  });

  test("two equivalent templates stringify identically whatever order their keys arrived in", () => {
    const a = {
      timeSlots: ["9:00 AM"],
      grid: {
        Monday: ["main"],
        Tuesday: ["main"],
        Wednesday: ["main"],
        Thursday: ["main"],
        Friday: ["main"],
        Saturday: ["main"],
        Sunday: ["main"],
      },
      activeDays: ["Monday", "Friday"],
    };
    const b = {
      activeDays: ["Friday", "Monday"],
      grid: {
        Sunday: ["main"],
        Saturday: ["main"],
        Friday: ["main"],
        Thursday: ["main"],
        Wednesday: ["main"],
        Tuesday: ["main"],
        Monday: ["main"],
      },
      timeSlots: ["9:00 AM"],
    };
    expect(JSON.stringify(normalizeTemplate(a))).toBe(JSON.stringify(normalizeTemplate(b)));
  });

  test("is idempotent", () => {
    const once = normalizeTemplate(legacy);
    const twice = normalizeTemplate(once);
    expect(twice).toEqual(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  test("returns a new object, never the input", () => {
    const out = normalizeTemplate(legacy);
    expect(out).not.toBe(legacy);
    expect(normalizeTemplate(out)).not.toBe(out);
  });
});

describe("withDayToggled", () => {
  const base = { timeSlots: ["9:00 AM"], grid: { Monday: ["alt"] } };

  test("turning Sunday on appends it in week order", () => {
    const out = withDayToggled(base, "Sunday");
    expect(out.activeDays).toEqual(ALL_SEVEN);
  });

  test("turning a mid-week day on inserts it in week order, not at the end", () => {
    const out = withDayToggled({ activeDays: ["Monday", "Friday"] }, "Wednesday");
    expect(out.activeDays).toEqual(["Monday", "Wednesday", "Friday"]);
  });

  test("turning Sunday off removes it", () => {
    const out = withDayToggled({ activeDays: ALL_SEVEN }, "Sunday");
    expect(out.activeDays).toEqual(DEFAULT_ACTIVE_DAYS);
  });

  test("refuses to turn off the last active day, returning the same reference", () => {
    const oneDay = { timeSlots: [], grid: {}, activeDays: ["Wednesday"] };
    expect(withDayToggled(oneDay, "Wednesday")).toBe(oneDay);
  });

  test("the result is otherwise normalized", () => {
    const out = withDayToggled(base, "Sunday");
    expect(Object.keys(out)).toEqual(["timeSlots", "grid", "activeDays"]);
    expect(Object.keys(out.grid)).toEqual(WEEK_DAYS);
    expect(out.grid.Monday).toEqual(["alt"]);
    expect(out.grid.Sunday).toEqual(["main"]);
  });

  test("never mutates the template it was given", () => {
    const tmpl = { timeSlots: [], grid: {}, activeDays: ["Monday", "Tuesday"] };
    withDayToggled(tmpl, "Tuesday");
    expect(tmpl.activeDays).toEqual(["Monday", "Tuesday"]);
  });

  test("toggling the same day twice returns to where it started", () => {
    const once = withDayToggled(base, "Sunday");
    const twice = withDayToggled(once, "Sunday");
    expect(twice.activeDays).toEqual(DEFAULT_ACTIVE_DAYS);
  });
});

describe("sortTemplateByTime", () => {
  const unsorted = {
    timeSlots: ["5:00 PM", "9:00 AM", "12:30 PM"],
    grid: {
      Monday: ["m-evening", "m-morning", "m-noon"],
      Tuesday: ["t-evening", "t-morning", "t-noon"],
      Wednesday: ["w-evening", "w-morning", "w-noon"],
      Thursday: ["th-evening", "th-morning", "th-noon"],
      Friday: ["f-evening", "f-morning", "f-noon"],
      Saturday: ["sa-evening", "sa-morning", "sa-noon"],
      Sunday: ["su-evening", "su-morning", "su-noon"],
    },
    activeDays: MWF,
  };

  test("puts the time slots in chronological order", () => {
    const out = sortTemplateByTime(unsorted, parseTimeToMinutes);
    expect(out.timeSlots).toEqual(["9:00 AM", "12:30 PM", "5:00 PM"]);
  });

  test("reorders every one of the seven grid rows to match", () => {
    const out = sortTemplateByTime(unsorted, parseTimeToMinutes);
    expect(out.grid.Monday).toEqual(["m-morning", "m-noon", "m-evening"]);
    expect(out.grid.Tuesday).toEqual(["t-morning", "t-noon", "t-evening"]);
    expect(out.grid.Wednesday).toEqual(["w-morning", "w-noon", "w-evening"]);
    expect(out.grid.Thursday).toEqual(["th-morning", "th-noon", "th-evening"]);
    expect(out.grid.Friday).toEqual(["f-morning", "f-noon", "f-evening"]);
    expect(out.grid.Saturday).toEqual(["sa-morning", "sa-noon", "sa-evening"]);
    expect(out.grid.Sunday).toEqual(["su-morning", "su-noon", "su-evening"]);
  });

  test("keeps the active days", () => {
    expect(sortTemplateByTime(unsorted, parseTimeToMinutes).activeDays).toEqual(MWF);
  });

  test("tolerates a legacy grid missing a day, filling it with main", () => {
    const legacy = {
      timeSlots: ["5:00 PM", "9:00 AM"],
      grid: { Monday: ["m-evening", "m-morning"] },
    };
    const out = sortTemplateByTime(legacy, parseTimeToMinutes);
    expect(out.timeSlots).toEqual(["9:00 AM", "5:00 PM"]);
    expect(out.grid.Monday).toEqual(["m-morning", "m-evening"]);
    expect(out.grid.Sunday).toEqual(["main", "main"]);
    expect(out.activeDays).toEqual(DEFAULT_ACTIVE_DAYS);
  });

  test("tolerates a grid row shorter than the slot list", () => {
    const ragged = {
      timeSlots: ["5:00 PM", "9:00 AM"],
      grid: { Monday: ["m-evening"] },
    };
    expect(sortTemplateByTime(ragged, parseTimeToMinutes).grid.Monday).toEqual(["main", "m-evening"]);
  });

  test("returns a fully normalized template", () => {
    const out = sortTemplateByTime(unsorted, parseTimeToMinutes);
    expect(Object.keys(out)).toEqual(["timeSlots", "grid", "activeDays"]);
    expect(Object.keys(out.grid)).toEqual(WEEK_DAYS);
  });

  test("an already-sorted template comes back unchanged", () => {
    const sorted = sortTemplateByTime(unsorted, parseTimeToMinutes);
    expect(JSON.stringify(sortTemplateByTime(sorted, parseTimeToMinutes))).toBe(JSON.stringify(sorted));
  });

  test("never mutates the template it was given", () => {
    sortTemplateByTime(unsorted, parseTimeToMinutes);
    expect(unsorted.timeSlots).toEqual(["5:00 PM", "9:00 AM", "12:30 PM"]);
    expect(unsorted.grid.Monday).toEqual(["m-evening", "m-morning", "m-noon"]);
  });
});
