// #202: SFX/music mixing in the render filter graph.
// buildNleFilterComplex is the exported seam (#164). subtitle-overlay-renderer
// pulls in electron at require time — mock it so render.js loads under jest.
jest.mock("../subtitle-overlay-renderer", () => ({}));

const { buildNleFilterComplex } = require("../render");

const SEGS_2 = [
  { id: "a", sourceStart: 10, sourceEnd: 15 },
  { id: "b", sourceStart: 20, sourceEnd: 30 },
];

describe("buildNleFilterComplex — #202 audio asset mixing", () => {
  test("no audioAssets: graph is byte-identical to the pre-#202 output", () => {
    const { filterComplex, mapArgs } = buildNleFilterComplex(SEGS_2, false, null);
    expect(filterComplex).toBe(
      "[0:v]setpts=PTS-STARTPTS[v0];[0:a]asetpts=PTS-STARTPTS[a0];" +
      "[1:v]setpts=PTS-STARTPTS[v1];[1:a]asetpts=PTS-STARTPTS[a1];" +
      "[v0][a0][v1][a1]concat=n=2:v=1:a=1[base_v][base_a]"
    );
    expect(mapArgs).toEqual(["-map", "[base_v]", "-map", "[base_a]"]);
  });

  test("empty audioAssets array is the same no-op", () => {
    const plain = buildNleFilterComplex(SEGS_2, true, null);
    const withEmpty = buildNleFilterComplex(SEGS_2, true, null, undefined, undefined, {
      audioAssets: [], timelineDuration: 15,
    });
    expect(withEmpty.filterComplex).toBe(plain.filterComplex);
    expect(withEmpty.mapArgs).toEqual(plain.mapArgs);
  });

  test("one SFX: leveled, delayed to its timeline position, mixed over base", () => {
    const { filterComplex, mapArgs } = buildNleFilterComplex(SEGS_2, true, null, undefined, undefined, {
      audioAssets: [{ inputIndex: 3, kind: "sfx", volume: 0.8, delaySec: 2.5 }],
      timelineDuration: 15,
    });
    expect(filterComplex).toContain(
      "[3:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.8,adelay=2500:all=1[mixin0]"
    );
    expect(filterComplex).toContain("[base_a]aformat=sample_rates=48000:channel_layouts=stereo[base_af]");
    expect(filterComplex).toContain("[base_af][mixin0]amix=inputs=2:duration=first:normalize=0[mix_a]");
    expect(mapArgs).toEqual(["-map", "[out]", "-map", "[mix_a]"]);
  });

  test("music bed: trimmed to the clip, faded, no delay", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      audioAssets: [{ inputIndex: 2, kind: "music", volume: 0.4, delaySec: 0, fadeIn: 1, fadeOut: 2 }],
      timelineDuration: 20,
    });
    expect(filterComplex).toContain(
      "[2:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:20,afade=t=in:st=0:d=1,afade=t=out:st=18:d=2,volume=0.4[mixin0]"
    );
    expect(filterComplex).not.toContain("adelay");
  });

  test("sfx at timeline 0 gets no adelay stage", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      audioAssets: [{ inputIndex: 2, kind: "sfx", volume: 1, delaySec: 0 }],
      timelineDuration: 15,
    });
    expect(filterComplex).toContain("volume=1[mixin0]");
    expect(filterComplex).not.toContain("adelay");
  });

  test("multiple assets mix together in one amix", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      audioAssets: [
        { inputIndex: 2, kind: "music", volume: 0.4, delaySec: 0 },
        { inputIndex: 3, kind: "sfx", volume: 1, delaySec: 4 },
        { inputIndex: 4, kind: "sfx", volume: 0.5, delaySec: 9.25 },
      ],
      timelineDuration: 15,
    });
    expect(filterComplex).toContain("[base_af][mixin0][mixin1][mixin2]amix=inputs=4:duration=first:normalize=0[mix_a]");
    expect(filterComplex).toContain("adelay=9250:all=1[mixin2]");
  });

  test("thumbnail path (audio:false) ignores audioAssets entirely", () => {
    const single = [{ id: "a", sourceStart: 10, sourceEnd: 15 }];
    const { filterComplex, mapArgs } = buildNleFilterComplex(single, true, null, undefined, undefined, {
      audio: false,
      audioAssets: [{ inputIndex: 2, kind: "sfx", volume: 1, delaySec: 1 }],
      timelineDuration: 5,
    });
    expect(filterComplex).not.toContain("amix");
    expect(filterComplex).not.toContain("[base_a]");
    expect(mapArgs).toEqual(["-map", "[out]"]);
  });

  test("volume is clamped to 0..1", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      audioAssets: [{ inputIndex: 2, kind: "sfx", volume: 4, delaySec: 0 }],
      timelineDuration: 15,
    });
    expect(filterComplex).toContain("volume=1[mixin0]");
  });
});
