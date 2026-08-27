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

const vid = (over) => ({ id: "v1", mediaType: "video", sourceTime: 12, ...over });

// ── #318: the window into a video is only as long as the video ──
// Every clamp on a video overlay's trim window derives from its file length, so
// what the model does when that length is MISSING is the whole of #318: it can
// clamp nothing, and the block can be stretched past the end of its own file.
// The fix keeps a video from ever being placed unmeasured (MediaPanel refuses,
// the preview writes back what the element measured, the render probes) — these
// pin the clamps that then take effect.
describe("video trim window", () => {
  test("clamps the window to the file", () => {
    const [p] = normalizeMediaPlacements([vid({ durationSec: 5, trimStart: 1, trimEnd: 30 })]);
    expect(p.trimStart).toBe(1);
    expect(p.trimEnd).toBe(5);
  });

  test("a start past the end is pulled back inside the file", () => {
    const [p] = normalizeMediaPlacements([vid({ durationSec: 5, trimStart: 40, trimEnd: 50 })]);
    expect(p.trimStart).toBeLessThan(5);
    expect(p.trimEnd).toBe(5);
    expect(p.trimEnd).toBeGreaterThan(p.trimStart);
  });

  test("a fresh video plays the whole file", () => {
    const [p] = normalizeMediaPlacements([vid({ durationSec: 8 })]);
    expect(p.trimStart).toBe(0);
    expect(p.trimEnd).toBe(8);
  });

  test("with no file length there is nothing to clamp to — the #318 hole", () => {
    // Documented, not desired: this is exactly why an unmeasured video is now
    // refused at placement and healed from the preview element.
    const [p] = normalizeMediaPlacements([vid({ durationSec: null, trimStart: 0, trimEnd: 999 })]);
    expect(p.trimEnd).toBe(999);
  });

  test("a still is unaffected — it has no inside to run out of", () => {
    const [p] = normalizeMediaPlacements([img({ durationSec: null })]);
    expect(p.trimStart).toBe(0);
    expect(p.trimEnd).toBe(3);
  });
});
