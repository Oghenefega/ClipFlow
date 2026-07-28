const {
  placementLength,
  normalizePlacements,
  resolvePlacements,
  assignRows,
} = require("../audioPlacements");

// Source 10-15 and 20-30 → timeline 0-5 and 5-15.
const SEGS = [
  { id: "a", sourceStart: 10, sourceEnd: 15 },
  { id: "b", sourceStart: 20, sourceEnd: 30 },
];

const sfx = (over) => ({ id: "s1", kind: "sfx", durationSec: 10, sourceTime: 12, trimStart: 0, trimEnd: 10, ...over });
const song = (over) => ({ id: "m1", kind: "music", durationSec: 180, sourceTime: 10, trimStart: 0, trimEnd: 15, ...over });

describe("placementLength", () => {
  test("is the file window, not the file length", () => {
    expect(placementLength(sfx({ trimStart: 5, trimEnd: 7 }))).toBeCloseTo(2);
  });

  test("falls back to the whole file when no window is set", () => {
    expect(placementLength({ durationSec: 4 })).toBeCloseTo(4);
  });
});

describe("normalizePlacements — clips saved before trimming existed", () => {
  test("fills the window with the whole file", () => {
    const [p] = normalizePlacements([{ id: "x", kind: "sfx", durationSec: 3, sourceTime: 12 }], SEGS);
    expect(p.trimStart).toBe(0);
    expect(p.trimEnd).toBe(3);
  });

  test("a legacy music bed becomes a song at the top of the clip, spanning it", () => {
    // No sourceTime at all — the old shape. Timeline is 15s, song is 180s long.
    const [p] = normalizePlacements([{ id: "m", kind: "music", durationSec: 180, volume: 0.4 }], SEGS);
    expect(p.sourceTime).toBe(10); // first surviving footage = timeline 0
    expect(p.trimStart).toBe(0);
    expect(p.trimEnd).toBe(15); // exactly the old "spans the clip" behaviour
  });

  test("a legacy bed shorter than the clip keeps its own length", () => {
    const [p] = normalizePlacements([{ id: "m", kind: "music", durationSec: 8 }], SEGS);
    expect(p.trimEnd).toBe(8);
  });

  test("does not mutate the input", () => {
    const input = [{ id: "x", kind: "sfx", durationSec: 3 }];
    normalizePlacements(input, SEGS);
    expect(input[0].trimEnd).toBeUndefined();
  });

  test("non-arrays are empty", () => {
    expect(normalizePlacements(null, SEGS)).toEqual([]);
    expect(normalizePlacements(undefined, SEGS)).toEqual([]);
  });
});

describe("resolvePlacements", () => {
  test("maps a sound to its footage moment", () => {
    const [r] = resolvePlacements([sfx({ sourceTime: 22, trimEnd: 2 })], SEGS);
    expect(r.tlStart).toBeCloseTo(7); // 5 + (22 - 20)
    expect(r.tlEnd).toBeCloseTo(9);
  });

  test("a sound whose moment was trimmed away is dropped", () => {
    // 17 sits in the deleted gap between the two sections.
    expect(resolvePlacements([sfx({ sourceTime: 17 })], SEGS)).toHaveLength(0);
  });

  test("a song whose anchor was trimmed away clamps forward instead of vanishing", () => {
    const [r] = resolvePlacements([song({ sourceTime: 17 })], SEGS);
    expect(r).toBeDefined();
    expect(r.tlStart).toBeCloseTo(5); // start of the next surviving footage
  });

  test("a song anchored before the clip's new head starts at the top", () => {
    const [r] = resolvePlacements([song({ sourceTime: 2 })], SEGS);
    expect(r.tlStart).toBeCloseTo(0);
  });

  test("the trim window sets the timeline length", () => {
    const [r] = resolvePlacements([sfx({ sourceTime: 12, trimStart: 5, trimEnd: 7 })], SEGS);
    expect(r.tlStart).toBeCloseTo(2);
    expect(r.tlEnd).toBeCloseTo(4);
  });
});

describe("assignRows — overlapping blocks stack instead of hiding each other", () => {
  test("blocks that don't overlap share one row", () => {
    const { blocks, rows } = assignRows([
      { id: "a", tlStart: 0, tlEnd: 2 },
      { id: "b", tlStart: 3, tlEnd: 5 },
    ]);
    expect(rows).toBe(1);
    expect(blocks.map((b) => b.row)).toEqual([0, 0]);
  });

  test("touching blocks (A ends where B starts) still share one row", () => {
    const { rows } = assignRows([
      { id: "a", tlStart: 0, tlEnd: 8 },
      { id: "b", tlStart: 8, tlEnd: 15 },
    ]);
    expect(rows).toBe(1);
  });

  test("an overlap drops the second block to row 1", () => {
    const { blocks, rows } = assignRows([
      { id: "a", tlStart: 0, tlEnd: 4 },
      { id: "b", tlStart: 2, tlEnd: 6 },
    ]);
    expect(rows).toBe(2);
    expect(blocks.find((b) => b.id === "b").row).toBe(1);
  });

  test("output is in timeline order regardless of input order", () => {
    const { blocks } = assignRows([
      { id: "late", tlStart: 9, tlEnd: 10 },
      { id: "early", tlStart: 1, tlEnd: 2 },
    ]);
    expect(blocks.map((b) => b.id)).toEqual(["early", "late"]);
  });

  test("a block clear of row 0 goes back to row 0", () => {
    const { blocks } = assignRows([
      { id: "a", tlStart: 0, tlEnd: 4 },
      { id: "b", tlStart: 2, tlEnd: 6 },
      { id: "c", tlStart: 7, tlEnd: 8 },
    ]);
    expect(blocks.find((b) => b.id === "c").row).toBe(0);
  });
});
