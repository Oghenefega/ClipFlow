const {
  placementLength,
  occupantsFromLane,
  normalizePlacements,
  resolvePlacements,
  assignRows,
  SOUND_TRACK_CAP,
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

// ── #312: extra Music / SFX lanes ──
// A sound lane is LAYOUT ONLY. The one thing that must never happen is a lane
// assignment reaching the mix, so the tests here are mostly about what does NOT
// change. (The media lanes are the opposite case — there the index IS z-order
// and resolveMediaPlacements sorts by it.)
describe("trackIndex — extra sound lanes", () => {
  test("a clip saved before extra lanes existed lands on lane 0", () => {
    const [p] = normalizePlacements([sfx()], SEGS);
    expect(p.trackIndex).toBe(0);
  });

  test("an explicit lane survives normalizing", () => {
    const [p] = normalizePlacements([sfx({ trackIndex: 2 })], SEGS);
    expect(p.trackIndex).toBe(2);
  });

  test("a nonsense lane falls back to 0 rather than propagating", () => {
    for (const bad of [-1, null, "1", undefined, NaN]) {
      const [p] = normalizePlacements([sfx({ trackIndex: bad })], SEGS);
      expect(p.trackIndex).toBe(0);
    }
  });

  test("the lane never reaches the mix: resolving is identical either way", () => {
    // Same three sounds, once all on lane 0 and once spread across three lanes.
    // What render.js consumes is this array, in this order — so if these two
    // agree, moving a block between lanes cannot change a byte of the export.
    const spread = [
      sfx({ id: "a", sourceTime: 12, trackIndex: 0 }),
      sfx({ id: "b", sourceTime: 12, trackIndex: 2 }),
      song({ id: "c", trackIndex: 1 }),
    ];
    const flat = spread.map((x) => ({ ...x, trackIndex: 0 }));
    const strip = (list) => list.map(({ trackIndex, ...rest }) => rest);
    expect(strip(resolvePlacements(spread, SEGS)))
      .toEqual(strip(resolvePlacements(flat, SEGS)));
  });

  test("resolving does NOT reorder by lane the way media placements do", () => {
    const out = resolvePlacements([
      sfx({ id: "high", sourceTime: 12, trackIndex: 2 }),
      sfx({ id: "low", sourceTime: 12, trackIndex: 0 }),
    ], SEGS);
    expect(out.map((x) => x.id)).toEqual(["high", "low"]);
  });

  test("packing one lane at a time is what stops a 3rd sound being drawn over", () => {
    // Three sounds overlapping at the same instant. On one lane the 2-row
    // packer has to put the third somewhere — it lands on top of another block.
    const all = [
      { id: "a", tlStart: 0, tlEnd: 4, trackIndex: 0 },
      { id: "b", tlStart: 1, tlEnd: 5, trackIndex: 0 },
      { id: "c", tlStart: 2, tlEnd: 6, trackIndex: 1 },
    ];
    const oneLane = assignRows(all);
    const collides = oneLane.blocks.some((x) =>
      oneLane.blocks.some((y) => x.id !== y.id && x.row === y.row
        && x.tlStart < y.tlEnd && x.tlEnd > y.tlStart));
    expect(collides).toBe(true);

    // Split across two lanes — the caller passes one lane at a time — and
    // neither lane has an overlap left to hide.
    for (const lane of [0, 1]) {
      const { blocks } = assignRows(all.filter((x) => x.trackIndex === lane));
      const hidden = blocks.some((x) =>
        blocks.some((y) => x.id !== y.id && x.row === y.row
          && x.tlStart < y.tlEnd && x.tlEnd > y.tlStart));
      expect(hidden).toBe(false);
    }
  });

  test("the cap leaves room for more than the three sounds that motivated it", () => {
    // 2 rows packed per lane, so the cap is what actually bounds how many
    // simultaneous sounds stay visible.
    expect(SOUND_TRACK_CAP * 2).toBeGreaterThanOrEqual(3);
  });
});

// ── #321: who is holding the last lane ──
// The remove-lane button and the store action have to ask ONE question, and it
// has to be asked of the RAW list: a placement whose footage was cut away is
// dropped by the resolver (no block is drawn) but still occupies its lane.
describe("occupantsFromLane", () => {
  test("counts the lane itself and everything above it", () => {
    const list = [sfx({ id: "a", trackIndex: 0 }), sfx({ id: "b", trackIndex: 1 }), sfx({ id: "c", trackIndex: 2 })];
    expect(occupantsFromLane(list, 1).map((p) => p.id)).toEqual(["b", "c"]);
    expect(occupantsFromLane(list, 0)).toHaveLength(3);
    expect(occupantsFromLane(list, 3)).toHaveLength(0);
  });

  test("a missing lane counts as lane 0", () => {
    expect(occupantsFromLane([{ id: "x" }], 0)).toHaveLength(1);
    expect(occupantsFromLane([{ id: "x" }], 1)).toHaveLength(0);
  });

  test("a dormant placement still holds its lane after the resolver drops it", () => {
    // Source 16-19 is between the two segments — cut away, so no block renders.
    const dormant = sfx({ id: "gone", sourceTime: 17, trackIndex: 1 });
    expect(resolvePlacements([dormant], SEGS)).toHaveLength(0);
    expect(occupantsFromLane([dormant], 1)).toHaveLength(1);
  });

  test("non-arrays are empty rather than throwing", () => {
    expect(occupantsFromLane(null, 0)).toEqual([]);
    expect(occupantsFromLane(undefined, 1)).toEqual([]);
  });

  test("judges a malformed lane the way the normalizer draws it", () => {
    // normalizePlacements sends a non-number to lane 0, so it must not hold a
    // higher lane here — otherwise that lane can never close and the dormant
    // note points at a block that is visibly rendering on lane 0.
    expect(occupantsFromLane([sfx({ id: "x", trackIndex: "2" })], 1)).toHaveLength(0);
    expect(occupantsFromLane([sfx({ id: "x", trackIndex: "2" })], 0)).toHaveLength(1);
    expect(occupantsFromLane([sfx({ id: "y", trackIndex: 1.7 })], 1)).toHaveLength(1);
    expect(occupantsFromLane([sfx({ id: "y", trackIndex: 1.7 })], 2)).toHaveLength(0);
  });
});
