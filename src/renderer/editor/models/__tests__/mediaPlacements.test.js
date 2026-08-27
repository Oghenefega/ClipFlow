const {
  normalizeMediaPlacements,
  resolveMediaPlacements,
} = require("../mediaPlacements");

// Source 10-15 and 20-30 → timeline 0-5 and 5-15.
const SEGS = [
  { id: "a", sourceStart: 10, sourceEnd: 15 },
  { id: "b", sourceStart: 20, sourceEnd: 30 },
];

const img = (over) => ({ id: "i1", mediaType: "image", sourceTime: 12, ...over });

// ── #320: the lane guard ──
// A media lane index IS z-order — it indexes a lane array AND drives the
// draw-order sort — so a non-number must never travel on. The old guard was
// `if (!(out.trackIndex >= 0))`, which a null walks straight through.
describe("trackIndex — the overlay lane", () => {
  test("a clip saved before extra lanes existed lands on lane 0", () => {
    const [p] = normalizeMediaPlacements([img()]);
    expect(p.trackIndex).toBe(0);
  });

  test("an explicit lane survives normalizing", () => {
    const [p] = normalizeMediaPlacements([img({ trackIndex: 2 })]);
    expect(p.trackIndex).toBe(2);
  });

  test("a nonsense lane falls back to 0 rather than propagating", () => {
    for (const bad of [-1, null, "1", undefined, NaN, 1.7]) {
      const [p] = normalizeMediaPlacements([img({ trackIndex: bad })]);
      expect(p.trackIndex).toBe(bad === 1.7 ? 1 : 0);
      expect(Number.isInteger(p.trackIndex)).toBe(true);
    }
  });

  test("agrees with the sound twin: the result is always a real lane number", () => {
    const out = normalizeMediaPlacements([
      img({ id: "a", trackIndex: null }),
      img({ id: "b", trackIndex: "2" }),
      img({ id: "c", trackIndex: 1 }),
    ]);
    for (const p of out) expect(Number.isFinite(p.trackIndex)).toBe(true);
  });

  test("draw order still sorts lane 0 first, top lane last", () => {
    const resolved = resolveMediaPlacements(
      [
        img({ id: "top", trackIndex: 2 }),
        img({ id: "bottom", trackIndex: null }),
        img({ id: "mid", trackIndex: 1 }),
      ],
      SEGS
    );
    expect(resolved.map((p) => p.id)).toEqual(["bottom", "mid", "top"]);
  });
});
