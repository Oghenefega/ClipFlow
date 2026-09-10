// #397/#398: the pure maths behind the Analytics tab. Pins the rules the tab
// renders so a wording or threshold change is a deliberate edit here, not a
// surprise in the app.
const {
  median, lengthBucket, titleShouts, parseHour, postingSlot, slotGrid, rollup,
  platformTotals, totalAtOrBefore, viewsGained, windowDelta, dailyTotals, clipMilestones, buildInsights,
} = require("../../shared/analyticsInsights");
const { localDayKey } = require("../analytics-core");

const clip = (over = {}) => ({
  clipId: over.clipId || Math.random().toString(36).slice(2),
  title: "A clip", game: "mc", gameName: "Meccha Chameleon", date: "2026-09-05", time: "1:30 PM",
  duration: 30, titleSource: "self", fetchedAt: "2026-09-09T12:00:00.000Z",
  views: { youtube: 1000, facebook: 2000, instagram: 500, tiktok: null },
  history: [], ...over,
  total: over.total ?? ((over.views?.youtube || 0) + (over.views?.facebook || 0) + (over.views?.instagram || 0)),
});

describe("basics", () => {
  test("median ignores non-numbers and averages an even middle", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(3);
    expect(median([null, undefined, 7])).toBe(7);
    expect(median([])).toBe(0);
  });
  test("length buckets", () => {
    expect(lengthBucket(12)).toBe("under 20s");
    expect(lengthBucket(20)).toBe("20–35s");
    expect(lengthBucket(54.9)).toBe("35–55s");
    expect(lengthBucket(90)).toBe("55s+");
    expect(lengthBucket(0)).toBeNull();
    expect(lengthBucket(undefined)).toBeNull();
  });
  test("a shouted title has a 4+ letter all-caps word, hashtags excluded", () => {
    expect(titleShouts("Sato is a MONSTER! #valorant")).toBe(true);
    expect(titleShouts("Dude thinks he's TenZ #VALORANT")).toBe(false);
    expect(titleShouts("100T Cryo went crazy")).toBe(false);
  });
  test("tracker times parse verbatim, 12-hour and 24-hour", () => {
    expect(parseHour("1:30 PM")).toBe(13);
    expect(parseHour("12:05 AM")).toBe(0);
    expect(parseHour("12 PM")).toBe(12);
    expect(parseHour("22:15")).toBe(22);
    expect(parseHour("")).toBeNull();
  });
  test("posting slot is local weekday + two-hour band", () => {
    expect(postingSlot("2026-09-08", "1:30 PM")).toEqual({ day: "Tue", band: "12p" });
    expect(postingSlot("2026-09-05", "4:00 PM")).toEqual({ day: "Sat", band: "4p" });
    expect(postingSlot("2026-09-06", "")).toBeNull();
  });
  test("localDayKey never shifts the day through UTC", () => {
    expect(localDayKey(new Date(2026, 8, 10, 23, 30))).toBe("2026-09-10");
    expect(localDayKey(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });
});

describe("rollups", () => {
  test("rollup groups ranked clips and sorts by median; unfetched clips are left out", () => {
    const clips = [
      clip({ game: "a", views: { youtube: 100 } }), clip({ game: "a", views: { youtube: 300 } }),
      clip({ game: "b", views: { youtube: 500 } }), clip({ game: "b", fetchedAt: null, views: { youtube: 9999 } }),
    ];
    const r = rollup(clips, (c) => c.game);
    expect(r.map((g) => [g.key, g.n, g.median])).toEqual([["b", 1, 500], ["a", 2, 200]]);
  });
  test("platformTotals gives shares that sum to one", () => {
    const { total, platforms } = platformTotals([clip(), clip({ views: { youtube: 0, facebook: 1000, instagram: 0 } })]);
    expect(total).toBe(4500);
    expect(platforms.facebook.share).toBeCloseTo(3000 / 4500);
    expect(platforms.youtube.clips).toBe(2);
    expect(platforms.tiktok.clips).toBe(0);
  });
  test("slotGrid medians per cell and picks the best cells with enough clips", () => {
    const clips = [
      clip({ date: "2026-09-08", time: "1:00 PM", views: { youtube: 100 } }),
      clip({ date: "2026-09-08", time: "1:10 PM", views: { youtube: 900 } }),
      clip({ date: "2026-09-09", time: "1:00 PM", views: { youtube: 5000 } }), // alone in its cell
    ];
    const { grid, best, max } = slotGrid(clips, 2);
    expect(grid.find((g) => g.day === "Tue" && g.band === "12p")).toMatchObject({ n: 2, median: 500 });
    expect(best.map((b) => b.day)).toEqual(["Tue"]);
    expect(max).toBe(5000);
  });
});

describe("snapshots (#398)", () => {
  const h = [["2026-09-01", 100], ["2026-09-03", 300], ["2026-09-07", 700]];
  test("totalAtOrBefore walks the history", () => {
    expect(totalAtOrBefore(h, "2026-08-31")).toBeNull();
    expect(totalAtOrBefore(h, "2026-09-03")).toBe(300);
    expect(totalAtOrBefore(h, "2026-09-05")).toBe(300);
    expect(totalAtOrBefore(h, "2026-09-30")).toBe(700);
  });
  test("viewsGained counts growth inside the window; a clip with no earlier point counts from zero", () => {
    const old = clip({ history: h });
    const fresh = clip({ date: "2026-09-06", history: [["2026-09-07", 50]] });
    expect(viewsGained([old, fresh], "2026-09-04", "2026-09-07")).toBe(400 + 50);
    expect(viewsGained([old], "2026-09-08", "2026-09-09")).toBe(0);
  });
  test("windowDelta is null until a snapshot exists before the window, then compares gains", () => {
    const today = "2026-09-10";
    const noBase = clip({ history: [["2026-09-05", 100], ["2026-09-10", 400]] });
    expect(windowDelta([noBase], 7, today)).toBeNull(); // window starts 09-04, first snapshot 09-05
    const withBase = clip({ date: "2026-08-20", history: [["2026-08-25", 100], ["2026-09-03", 300], ["2026-09-10", 700]] });
    // prev window 08-28..09-03 gained 200 (100→300); current 09-04..09-10 gained 400 (300→700)
    expect(windowDelta([withBase], 7, today)).toMatchObject({ current: 400, previous: 200, pct: 100, days: 7 });
  });
  test("dailyTotals needs two snapshot days and carries counts forward", () => {
    expect(dailyTotals([clip({ history: [["2026-09-05", 10]] })], 30, "2026-09-10")).toEqual([]);
    const a = clip({ history: [["2026-09-05", 10], ["2026-09-07", 30]] });
    const b = clip({ history: [["2026-09-06", 5]] });
    expect(dailyTotals([a, b], 30, "2026-09-10")).toEqual([
      { day: "2026-09-05", total: 10 }, { day: "2026-09-06", total: 15 }, { day: "2026-09-07", total: 35 },
    ]);
  });
  test("clipMilestones reads day 2 / day 7 / now from the clip's own history", () => {
    const c = clip({ date: "2026-09-01", history: [["2026-09-02", 40], ["2026-09-03", 90], ["2026-09-09", 200]] });
    expect(clipMilestones(c)).toEqual({ day2: 90, day7: 90, now: 200, firstDay: "2026-09-02", lastDay: "2026-09-09" });
    expect(clipMilestones(clip())).toBeNull();
  });
});

describe("buildInsights", () => {
  const fleet = () => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      out.push(clip({
        clipId: `s${i}`, title: i % 2 ? `Sato is a MONSTER ${i}` : `quiet title ${i}`,
        duration: i < 6 ? 25 : 70, date: "2026-09-08", time: "1:00 PM",
        views: { youtube: 1000 + (i % 2) * 2000, facebook: 3000 + (i % 2) * 4000, instagram: 200 },
        titleSource: i < 6 ? "self" : "ai",
      }));
    }
    return out;
  };
  test("stays silent under eight ranked clips", () => {
    expect(buildInsights(fleet().slice(0, 7))).toEqual([]);
  });
  test("names the carrying platform, the shouting pattern, the best length, and what to repeat", () => {
    const cards = buildInsights(fleet());
    const keys = cards.map((c) => c.key);
    expect(keys).toEqual(["platform", "titles", "length", "repeat"]);
    expect(cards[0].parts[0].text).toMatch(/^Facebook is \d+% of your views\./);
    expect(cards[0].parts[1].text).toMatch(/more plays there than on YouTube/);
    expect(cards[1].parts[0].text).toBe("SHOUTING works:");
    expect(cards[2].parts[0].text).toBe("20–35s is your sweet spot");
    expect(cards[3].parts.map((p) => p.text).join("")).toMatch(/Meccha Chameleon owns \d of your top 5/);
    expect(cards[3].parts.map((p) => p.text).join("")).toMatch(/Tue 12–2 PM/);
    for (const c of cards) expect(typeof c.why).toBe("string");
  });
  test("adds a momentum card only when a previous window is measurable", () => {
    expect(buildInsights(fleet(), { delta: null }).some((c) => c.key === "momentum")).toBe(false);
    const cards = buildInsights(fleet(), { delta: { current: 1380, previous: 1000, pct: 38, since: "2026-08-01", days: 30 } });
    const m = cards.find((c) => c.key === "momentum");
    expect(m.parts[0].text).toBe("Views are up 38%");
  });
});
