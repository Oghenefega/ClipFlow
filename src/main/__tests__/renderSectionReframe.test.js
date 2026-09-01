// #349: per-section layouts in the render graph. buildNleFilterComplex takes
// opts.segmentReframes (one effective layout per section). Every section
// agreeing — or the option absent — must produce the Phase A graph byte for
// byte; only genuinely mixed sections take the composite-then-concat path.
jest.mock("../subtitle-overlay-renderer", () => ({}));

const { buildNleFilterComplex } = require("../render");

const SEGS_2 = [
  { id: "a", sourceStart: 0, sourceEnd: 5 },
  { id: "b", sourceStart: 10, sourceEnd: 15 },
];
const SEGS_3 = [...SEGS_2, { id: "c", sourceStart: 20, sourceEnd: 25 }];

const W = 2560;
const H = 2880;
const LAYOUT_A = { layoutId: "a", camRect: { x: 0, y: 0, w: 640, h: 360 }, gameRect: { x: 0, y: 400, w: 2560, h: 1440 }, style: null };
const LAYOUT_B = { layoutId: "b", camRect: null, gameRect: { x: 200, y: 0, w: 1620, h: 2880 }, style: { blur: 20 } };

describe("buildNleFilterComplex — #349 segmentReframes", () => {
  test("absent option, or every section agreeing, is byte-identical to the Phase A graph", () => {
    for (const rf of [null, LAYOUT_A, LAYOUT_B]) {
      const plain = buildNleFilterComplex(SEGS_2, true, rf, W, H);
      const agreed = buildNleFilterComplex(SEGS_2, true, rf, W, H, { segmentReframes: [rf, rf] });
      expect(agreed.filterComplex).toBe(plain.filterComplex);
      expect(agreed.mapArgs).toEqual(plain.mapArgs);
    }
  });

  test("same look under different library ids is still the single-composite graph", () => {
    const plain = buildNleFilterComplex(SEGS_2, false, LAYOUT_A, W, H);
    const relabelled = buildNleFilterComplex(SEGS_2, false, LAYOUT_A, W, H, {
      segmentReframes: [LAYOUT_A, { ...LAYOUT_A, layoutId: "other" }],
    });
    expect(relabelled.filterComplex).toBe(plain.filterComplex);
    expect(relabelled.filterComplex).toContain("[base_v]split=3[rf_cam_in]");
    expect(relabelled.filterComplex).not.toContain("rf0_");
  });

  test("a single section takes the single-composite path whatever the option says", () => {
    const one = buildNleFilterComplex([SEGS_2[0]], false, LAYOUT_A, W, H, { segmentReframes: [LAYOUT_B] });
    // The section's own layout is what renders — B is a 9:16 game-only box,
    // so the fully-zoomed single crop, on the plain base_v/base_out labels.
    expect(one.filterComplex).toContain("[base_v]crop=1620:2880:200:0,scale=1080:1920,format=yuv420p,setsar=1[base_out]");
    expect(one.filterComplex).not.toContain("rf0_");
  });

  test("mixed sections: each composites from its own input, then the 1080x1920 streams concat", () => {
    const { filterComplex, mapArgs } = buildNleFilterComplex(SEGS_2, false, LAYOUT_A, W, H, {
      segmentReframes: [LAYOUT_A, LAYOUT_B],
    });
    expect(filterComplex).toContain("[0:v]setpts=PTS-STARTPTS[v0]");
    expect(filterComplex).toContain("[v0]split=3[rf0_cam_in][rf0_game_in][rf0_bg_in]");
    expect(filterComplex).toContain("[rf0_t2]format=yuv420p[v0_rf]");
    // B is a 9:16 game-only box → fully-zoomed single crop into its own label.
    expect(filterComplex).toContain("[v1]crop=1620:2880:200:0,scale=1080:1920,format=yuv420p,setsar=1[v1_rf]");
    expect(filterComplex).toContain("[v0_rf][a0][v1_rf][a1]concat=n=2:v=1:a=1[base_out][base_a]");
    // No whole-clip composite after the concat, and no raw base stream at all.
    expect(filterComplex).not.toContain("[base_v]");
    expect(filterComplex).not.toContain("[rf_");
    expect(mapArgs).toEqual(["-map", "[base_out]", "-map", "[base_a]"]);
  });

  test("a raw section inside a mixed clip letterboxes the whole frame with a neighbour's style", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_3, false, null, W, H, {
      segmentReframes: [null, LAYOUT_B, LAYOUT_A],
    });
    // Section 0 resolves to nothing → fit-to-screen: game crop is the full
    // 2560x2880 frame, no cam (split=2), and the backdrop borrows LAYOUT_B's
    // blur (20 → boxblur radius 11) because B is the first laid-out section.
    expect(filterComplex).toContain("[v0]split=2[rf0_game_in][rf0_bg_in]");
    expect(filterComplex).toContain(`[rf0_game_in]crop=${W}:${H}:0:0,scale=1080:`);
    expect(filterComplex).toMatch(/\[rf0_bg_in\]crop=[^;]*boxblur=11:2/);
    expect(filterComplex).toContain("[v0_rf][a0][v1_rf][a1][v2_rf][a2]concat=n=3:v=1:a=1[base_out][base_a]");
  });

  test("mixed clip without source dimensions refuses rather than guessing", () => {
    expect(() => buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      segmentReframes: [null, LAYOUT_A],
    })).toThrow(/source dimensions/);
  });

  test("mixed clip: overlays size against the 1080 frame and the PNG stream keeps its index", () => {
    const IMG = { inputIndex: 3, mediaType: "image", tlStart: 1, tlEnd: 4, xPct: 50, yPct: 50, wPct: 40, opacity: 1 };
    const { filterComplex, mapArgs } = buildNleFilterComplex(SEGS_2, true, null, W, H, {
      segmentReframes: [LAYOUT_A, null], mediaAssets: [IMG], outputWidth: W,
    });
    expect(filterComplex).toContain("[3:v]format=rgba,scale=432:-1[movl0]");
    expect(filterComplex).toContain("[base_out][movl0]overlay=");
    expect(filterComplex).toContain("[2:v]format=rgba[sub]");
    expect(filterComplex).toContain("[movid0][sub]overlay=0:0:eof_action=pass[out]");
    expect(mapArgs).toEqual(["-map", "[out]", "-map", "[base_a]"]);
  });

  test("mixed clip, muted source: the audio side is untouched by the video regrouping", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, W, H, {
      segmentReframes: [LAYOUT_A, null], sourceMuted: true,
    });
    expect(filterComplex).toContain("[base_a]volume=0[base_am]");
  });
});
