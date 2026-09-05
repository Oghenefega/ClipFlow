const {
  SLOT_CLAIM_WINDOW_MIN,
  timeToMinutes,
  minutesToLabel12h,
  label12hTo24h,
  hhmmTo12hLabel,
  slotDateTimeIso,
  claimSlots,
  buildDayRows,
  retroLogVisible,
  suggestRetroLogTime,
} = require("../trackerDayRows");

// 2026-09-05 is a Saturday. Every test that needs a clock uses this exact
// local moment so nothing depends on when the suite runs.
const NOW = new Date(2026, 8, 5, 15, 0, 0);
const TODAY_ISO = "2026-09-05";

describe("timeToMinutes", () => {
  test("parses a normal 12-hour label", () => {
    expect(timeToMinutes("2:30 PM")).toBe(870);
  });

  test("parses the legacy spaceless form", () => {
    expect(timeToMinutes("2:30PM")).toBe(870);
  });

  test("is case insensitive", () => {
    expect(timeToMinutes("2:30 pm")).toBe(870);
  });

  test("midnight is 0, not 720", () => {
    expect(timeToMinutes("12:00 AM")).toBe(0);
  });

  test("noon rolls forward, not back", () => {
    expect(timeToMinutes("12:15 PM")).toBe(735);
  });

  test("morning times parse", () => {
    expect(timeToMinutes("9:05 AM")).toBe(545);
  });

  test("returns null for unparsable input rather than 0", () => {
    expect(timeToMinutes("garbage")).toBeNull();
    expect(timeToMinutes("")).toBeNull();
    expect(timeToMinutes(null)).toBeNull();
    expect(timeToMinutes(undefined)).toBeNull();
  });
});

describe("label conversions", () => {
  test("minutesToLabel12h drops the leading zero on the hour and pads minutes", () => {
    expect(minutesToLabel12h(870)).toBe("2:30 PM");
    expect(minutesToLabel12h(545)).toBe("9:05 AM");
    expect(minutesToLabel12h(0)).toBe("12:00 AM");
    expect(minutesToLabel12h(720)).toBe("12:00 PM");
  });

  test("minutes round-trip through minutesToLabel12h and back", () => {
    for (const mins of [0, 1, 545, 719, 720, 870, 1199, 1439]) {
      expect(timeToMinutes(minutesToLabel12h(mins))).toBe(mins);
    }
  });

  test("label12hTo24h produces a zero-padded 24-hour time", () => {
    expect(label12hTo24h("2:30 PM")).toBe("14:30");
    expect(label12hTo24h("9:05 AM")).toBe("09:05");
    expect(label12hTo24h("12:00 AM")).toBe("00:00");
    expect(label12hTo24h("12:00 PM")).toBe("12:00");
  });

  test("label12hTo24h returns an empty string when it cannot parse", () => {
    expect(label12hTo24h("garbage")).toBe("");
    expect(label12hTo24h(null)).toBe("");
  });

  test("hhmmTo12hLabel is the inverse of label12hTo24h", () => {
    expect(hhmmTo12hLabel("14:30")).toBe("2:30 PM");
    expect(hhmmTo12hLabel("00:00")).toBe("12:00 AM");
    expect(hhmmTo12hLabel("12:00")).toBe("12:00 PM");
    expect(hhmmTo12hLabel("09:05")).toBe("9:05 AM");
  });

  test("hhmmTo12hLabel rejects nonsense and out-of-range times", () => {
    expect(hhmmTo12hLabel("garbage")).toBe("");
    expect(hhmmTo12hLabel("")).toBe("");
    expect(hhmmTo12hLabel("2:30 PM")).toBe("");
    expect(hhmmTo12hLabel("25:00")).toBe("");
    expect(hhmmTo12hLabel("10:75")).toBe("");
  });

  test("labels round-trip 12h to 24h and back", () => {
    for (const label of ["12:00 AM", "9:05 AM", "12:00 PM", "2:30 PM", "11:59 PM"]) {
      expect(hhmmTo12hLabel(label12hTo24h(label))).toBe(label);
    }
  });
});

describe("slotDateTimeIso", () => {
  test("joins the day and slot into a local (offset-free) datetime string", () => {
    expect(slotDateTimeIso("2026-09-05", "2:30 PM")).toBe("2026-09-05T14:30:00");
  });

  test("the result parses as local time, not UTC", () => {
    const parsed = new Date(slotDateTimeIso("2026-09-05", "2:30 PM"));
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(5);
    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(30);
  });

  test("returns null when either half is missing or unparsable", () => {
    expect(slotDateTimeIso("2026-09-05", "garbage")).toBeNull();
    expect(slotDateTimeIso("", "2:30 PM")).toBeNull();
    expect(slotDateTimeIso(null, "2:30 PM")).toBeNull();
  });
});

describe("claimSlots", () => {
  const oneSlot = [timeToMinutes("2:30 PM")];
  const twoSlots = [timeToMinutes("2:30 PM"), timeToMinutes("3:30 PM")];

  test("the default claim window is 30 minutes", () => {
    expect(SLOT_CLAIM_WINDOW_MIN).toBe(30);
  });

  test("an exact hit claims its slot", () => {
    expect(claimSlots(oneSlot, [timeToMinutes("2:30 PM")])).toEqual([0]);
  });

  test("2:31 PM claims the 2:30 PM slot", () => {
    expect(claimSlots(oneSlot, [timeToMinutes("2:31 PM")])).toEqual([0]);
  });

  test("2:59 PM still claims 2:30 PM — 29 minutes is inside the window", () => {
    expect(claimSlots(oneSlot, [timeToMinutes("2:59 PM")])).toEqual([0]);
  });

  test("exactly 30 minutes away still claims — the window is inclusive", () => {
    expect(claimSlots(oneSlot, [timeToMinutes("3:00 PM")])).toEqual([0]);
    expect(claimSlots(oneSlot, [timeToMinutes("2:00 PM")])).toEqual([0]);
  });

  test("3:01 PM is 31 minutes from the only slot, so it claims nothing", () => {
    expect(claimSlots(oneSlot, [timeToMinutes("3:01 PM")])).toEqual([-1]);
  });

  test("the nearest slot wins when two are in range", () => {
    expect(claimSlots(twoSlots, [timeToMinutes("3:10 PM")])).toEqual([1]);
    expect(claimSlots(twoSlots, [timeToMinutes("2:50 PM")])).toEqual([0]);
  });

  test("a dead tie at 3:00 PM goes to the earlier slot", () => {
    expect(claimSlots(twoSlots, [timeToMinutes("3:00 PM")])).toEqual([0]);
  });

  test("a tie goes to the earlier slot even when the slots arrive out of order", () => {
    const reversed = [timeToMinutes("3:30 PM"), timeToMinutes("2:30 PM")];
    expect(claimSlots(reversed, [timeToMinutes("3:00 PM")])).toEqual([1]);
  });

  test("two items may claim the same slot", () => {
    const items = [timeToMinutes("2:30 PM"), timeToMinutes("2:35 PM")];
    expect(claimSlots(oneSlot, items)).toEqual([0, 0]);
  });

  test("an item with no parsable time claims nothing", () => {
    expect(claimSlots(oneSlot, [null])).toEqual([-1]);
    expect(claimSlots(oneSlot, [timeToMinutes("garbage")])).toEqual([-1]);
  });

  test("with no slots at all nothing is claimed", () => {
    expect(claimSlots([], [timeToMinutes("2:30 PM")])).toEqual([-1]);
  });

  test("the window is overridable", () => {
    expect(claimSlots(oneSlot, [timeToMinutes("3:01 PM")], 60)).toEqual([0]);
    expect(claimSlots(oneSlot, [timeToMinutes("2:31 PM")], 0)).toEqual([-1]);
  });
});

describe("buildDayRows on the current week", () => {
  // 10:00 AM has passed, 2:30 PM has passed, 5:00 PM and 8:00 PM are still ahead of 3 PM.
  const SLOTS = ["10:00 AM", "2:30 PM", "5:00 PM", "8:00 PM"];
  const build = (items, slots = SLOTS) =>
    buildDayRows({ slots, items, dayIso: TODAY_ISO, now: NOW, viewMode: "current" });

  test("a claimed slot becomes a card row at the card's own time, with no slot row", () => {
    const rows = build([{ kind: "entry", time: "2:31 PM", ref: { id: "e1" } }]);
    const card = rows.find((r) => r.type === "entry");
    expect(card).toEqual({ type: "entry", item: { id: "e1" }, minutes: 871, claimedSlot: "2:30 PM" });
    expect(rows.some((r) => r.type === "slot" && r.time === "2:30 PM")).toBe(false);
  });

  test("an unclaimed slot that is still ahead of now gets a slot row", () => {
    const rows = build([]);
    expect(rows.filter((r) => r.type === "slot").map((r) => r.time)).toEqual(["5:00 PM", "8:00 PM"]);
  });

  test("an unclaimed slot that has already passed shows nothing at all", () => {
    const rows = build([]);
    expect(rows.some((r) => r.time === "10:00 AM")).toBe(false);
    expect(rows.some((r) => r.time === "2:30 PM")).toBe(false);
  });

  test("a slot row carries its own minutes", () => {
    const rows = build([]);
    expect(rows.find((r) => r.time === "5:00 PM")).toEqual({ type: "slot", time: "5:00 PM", minutes: 1020 });
  });

  test("an off-slot card keeps its own row and leaves its neighbours alone", () => {
    // 6:30 PM is 90 minutes from both 5:00 PM and 8:00 PM.
    const rows = build([{ kind: "entry", time: "6:30 PM", ref: { id: "off" } }]);
    const card = rows.find((r) => r.type === "entry");
    expect(card.claimedSlot).toBeNull();
    expect(card.minutes).toBe(1110);
    expect(rows.filter((r) => r.type === "slot").map((r) => r.time)).toEqual(["5:00 PM", "8:00 PM"]);
  });

  test("rows come back sorted by minutes ascending", () => {
    const rows = build([
      { kind: "entry", time: "6:30 PM", ref: { id: "off" } },
      { kind: "entry", time: "10:05 AM", ref: { id: "morning" } },
      { kind: "sched", time: "8:00 PM", ref: { id: "evening" } },
    ]);
    const minutes = rows.map((r) => r.minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    expect(minutes).toEqual([605, 1020, 1110, 1200]);
  });

  test("each item kind becomes its own row type", () => {
    const rows = build([
      { kind: "entry", time: "10:05 AM", ref: "a" },
      { kind: "sched", time: "5:00 PM", ref: "b" },
      { kind: "retry", time: "8:00 PM", ref: "c" },
    ]);
    expect(rows.map((r) => r.type)).toEqual(["entry", "sched", "retry"]);
    expect(rows.map((r) => r.item)).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.claimedSlot)).toEqual(["10:00 AM", "5:00 PM", "8:00 PM"]);
  });

  test("an item with an unparsable time sorts to the top with minutes 0", () => {
    const rows = build([
      { kind: "entry", time: "garbage", ref: { id: "broken" } },
      { kind: "entry", time: "10:05 AM", ref: { id: "morning" } },
    ]);
    expect(rows[0]).toEqual({ type: "entry", item: { id: "broken" }, minutes: 0, claimedSlot: null });
  });

  test("with no slots the rows are exactly the items", () => {
    const rows = build([{ kind: "entry", time: "2:31 PM", ref: "a" }], []);
    expect(rows).toEqual([{ type: "entry", item: "a", minutes: 871, claimedSlot: null }]);
  });

  test("with no items and no slots there are no rows", () => {
    expect(build([], [])).toEqual([]);
  });

  test("unparsable slot labels are skipped rather than crashing", () => {
    const rows = buildDayRows({
      slots: ["nonsense", "5:00 PM"],
      items: [],
      dayIso: TODAY_ISO,
      now: NOW,
      viewMode: "current",
    });
    expect(rows).toEqual([{ type: "slot", time: "5:00 PM", minutes: 1020 }]);
  });

  test("slots given out of order still come back in time order", () => {
    const rows = buildDayRows({
      slots: ["8:00 PM", "5:00 PM"],
      items: [],
      dayIso: TODAY_ISO,
      now: NOW,
      viewMode: "current",
    });
    expect(rows.map((r) => r.time)).toEqual(["5:00 PM", "8:00 PM"]);
  });
});

describe("buildDayRows on a future week", () => {
  const SLOTS = ["10:00 AM", "2:30 PM", "5:00 PM"];

  test("every unclaimed slot appears even when its clock time is behind now", () => {
    const rows = buildDayRows({
      slots: SLOTS,
      items: [],
      dayIso: "2026-09-12",
      now: NOW,
      viewMode: "future",
    });
    expect(rows.map((r) => r.time)).toEqual(["10:00 AM", "2:30 PM", "5:00 PM"]);
  });

  test("a claimed slot still drops out on a future week", () => {
    const rows = buildDayRows({
      slots: SLOTS,
      items: [{ kind: "sched", time: "10:00 AM", ref: "s1" }],
      dayIso: "2026-09-12",
      now: NOW,
      viewMode: "future",
    });
    expect(rows.filter((r) => r.type === "slot").map((r) => r.time)).toEqual(["2:30 PM", "5:00 PM"]);
    expect(rows[0]).toEqual({ type: "sched", item: "s1", minutes: 600, claimedSlot: "10:00 AM" });
  });
});

describe("buildDayRows on a past week", () => {
  const SLOTS = ["10:00 AM", "2:30 PM", "5:00 PM"];

  test("no slot rows are drawn at all", () => {
    const rows = buildDayRows({
      slots: SLOTS,
      items: [],
      dayIso: "2026-08-29",
      now: NOW,
      viewMode: "past",
    });
    expect(rows).toEqual([]);
  });

  test("the cards that were posted are kept, claims and all", () => {
    const rows = buildDayRows({
      slots: SLOTS,
      items: [
        { kind: "entry", time: "2:35 PM", ref: "a" },
        { kind: "entry", time: "9:00 PM", ref: "b" },
      ],
      dayIso: "2026-08-29",
      now: NOW,
      viewMode: "past",
    });
    expect(rows).toEqual([
      { type: "entry", item: "a", minutes: 875, claimedSlot: "2:30 PM" },
      { type: "entry", item: "b", minutes: 1260, claimedSlot: null },
    ]);
  });
});

describe("retroLogVisible", () => {
  test("shows on an earlier day of the current week", () => {
    expect(retroLogVisible({ dayIso: "2026-09-03", todayIso: TODAY_ISO, viewMode: "current" })).toBe(true);
  });

  test("shows on today", () => {
    expect(retroLogVisible({ dayIso: TODAY_ISO, todayIso: TODAY_ISO, viewMode: "current" })).toBe(true);
  });

  test("hides on a later day of the current week", () => {
    expect(retroLogVisible({ dayIso: "2026-09-06", todayIso: TODAY_ISO, viewMode: "current" })).toBe(false);
  });

  test("hides on any other view mode", () => {
    expect(retroLogVisible({ dayIso: "2026-08-29", todayIso: TODAY_ISO, viewMode: "past" })).toBe(false);
    expect(retroLogVisible({ dayIso: "2026-09-12", todayIso: TODAY_ISO, viewMode: "future" })).toBe(false);
  });
});

describe("suggestRetroLogTime", () => {
  const SLOTS = ["10:00 AM", "2:30 PM", "5:00 PM"];

  test("picks the latest slot that has passed and is unclaimed", () => {
    const suggestion = suggestRetroLogTime({
      slots: SLOTS,
      items: [],
      dayIso: TODAY_ISO,
      todayIso: TODAY_ISO,
      now: NOW,
    });
    expect(suggestion).toBe("2:30 PM");
  });

  test("skips an elapsed slot that is already claimed", () => {
    const suggestion = suggestRetroLogTime({
      slots: SLOTS,
      items: [{ kind: "entry", time: "2:31 PM", ref: "a" }],
      dayIso: TODAY_ISO,
      todayIso: TODAY_ISO,
      now: NOW,
    });
    expect(suggestion).toBe("10:00 AM");
  });

  test("falls back to now floored to 5 minutes when today has no free elapsed slot", () => {
    const now = new Date(2026, 8, 5, 15, 7, 0);
    const suggestion = suggestRetroLogTime({
      slots: SLOTS,
      items: [
        { kind: "entry", time: "10:00 AM", ref: "a" },
        { kind: "entry", time: "2:30 PM", ref: "b" },
      ],
      dayIso: TODAY_ISO,
      todayIso: TODAY_ISO,
      now,
    });
    expect(suggestion).toBe("3:05 PM");
  });

  test("falls back to now even when today has no slots at all", () => {
    const suggestion = suggestRetroLogTime({
      slots: [],
      items: [],
      dayIso: TODAY_ISO,
      todayIso: TODAY_ISO,
      now: new Date(2026, 8, 5, 9, 3, 0),
    });
    expect(suggestion).toBe("9:00 AM");
  });

  test("on an earlier day with every slot claimed, falls back to the last slot", () => {
    const suggestion = suggestRetroLogTime({
      slots: SLOTS,
      items: SLOTS.map((time) => ({ kind: "entry", time, ref: time })),
      dayIso: "2026-09-03",
      todayIso: TODAY_ISO,
      now: NOW,
    });
    expect(suggestion).toBe("5:00 PM");
  });

  test("on an earlier day with no slots, falls back to noon", () => {
    const suggestion = suggestRetroLogTime({
      slots: [],
      items: [],
      dayIso: "2026-09-03",
      todayIso: TODAY_ISO,
      now: NOW,
    });
    expect(suggestion).toBe("12:00 PM");
  });
});
