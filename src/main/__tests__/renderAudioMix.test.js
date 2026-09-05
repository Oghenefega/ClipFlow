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

  test("song: plays its own window, faded relative to the block, no delay at 0", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      audioAssets: [{
        inputIndex: 2, kind: "music", volume: 0.4, delaySec: 0,
        trimStart: 0, trimEnd: 20, durationSec: 180, fadeIn: 1, fadeOut: 2,
      }],
    });
    expect(filterComplex).toContain(
      "[2:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:20,asetpts=PTS-STARTPTS," +
      "afade=t=in:st=0:d=1,afade=t=out:st=18:d=2,volume=0.4[mixin0]"
    );
    expect(filterComplex).not.toContain("adelay");
  });

  // #202b: the intro of a song can be skipped. asetpts is what makes the
  // window land where adelay puts it instead of 12s later.
  test("song trimmed off its own start: window is rebased before the delay", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      audioAssets: [{
        inputIndex: 2, kind: "music", volume: 0.5, delaySec: 8,
        trimStart: 12, trimEnd: 19, durationSec: 180, fadeIn: 0.5, fadeOut: 0,
      }],
    });
    expect(filterComplex).toContain(
      "[2:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=12:19,asetpts=PTS-STARTPTS," +
      "afade=t=in:st=0:d=0.5,volume=0.5,adelay=8000:all=1[mixin0]"
    );
  });

  // The reason trimming exists: silence around the actual hit in the file.
  test("SFX trimmed on both ends: only the hit is mixed, at its moment", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, true, null, undefined, undefined, {
      audioAssets: [{
        inputIndex: 3, kind: "sfx", volume: 1, delaySec: 3.64,
        trimStart: 5, trimEnd: 7, durationSec: 10,
      }],
    });
    expect(filterComplex).toContain(
      "[3:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=5:7,asetpts=PTS-STARTPTS," +
      "volume=1,adelay=3640:all=1[mixin0]"
    );
  });

  // Two songs = the hyped → sad switch. Song A's window ends where B's delay
  // starts; both ride the same amix.
  test("two songs: A ends where B begins", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      audioAssets: [
        { inputIndex: 2, kind: "music", volume: 0.4, delaySec: 0, trimStart: 0, trimEnd: 8, durationSec: 120 },
        { inputIndex: 3, kind: "music", volume: 0.4, delaySec: 8, trimStart: 0, trimEnd: 7, durationSec: 95 },
      ],
    });
    expect(filterComplex).toContain("atrim=0:8,asetpts=PTS-STARTPTS,volume=0.4[mixin0]");
    expect(filterComplex).toContain("atrim=0:7,asetpts=PTS-STARTPTS,volume=0.4,adelay=8000:all=1[mixin1]");
    expect(filterComplex).toContain("[base_af][mixin0][mixin1]amix=inputs=3:duration=first:normalize=0[mix_a]");
  });

  // A clip saved before trimming existed carries no window — normalizePlacements
  // fills it upstream, so nothing here has to guess.
  test("no trim window: the atrim stage is left out entirely", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      audioAssets: [{ inputIndex: 2, kind: "sfx", volume: 1, delaySec: 1 }],
    });
    expect(filterComplex).not.toContain("atrim");
    expect(filterComplex).toContain(
      "[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=1,adelay=1000:all=1[mixin0]"
    );
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

  // #209: fades were gated on kind === "music" in the graph, the preview, the
  // popover and the store default. A cinematic boom wants a tail too, and the
  // afade math was never music-specific.
  test("SFX fades: afade is emitted for a one-shot, same as for a song", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, true, null, undefined, undefined, {
      audioAssets: [{
        inputIndex: 3, kind: "sfx", volume: 0.6, delaySec: 2,
        trimStart: 0, trimEnd: 4, durationSec: 4, fadeIn: 0.5, fadeOut: 1,
      }],
    });
    expect(filterComplex).toContain(
      "[3:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:4,asetpts=PTS-STARTPTS," +
      "afade=t=in:st=0:d=0.5,afade=t=out:st=3:d=1,volume=0.6,adelay=2000:all=1[mixin0]"
    );
  });

  // A fade set before a trim shortened its block outlives that trim. Fade-OUT
  // was already guarded by `len > a.fadeOut`; fade-IN had no guard anywhere, so
  // a 3s fade on a 0.4s boom ramped through the whole sound without ever
  // reaching full level.
  test("fades longer than the block are clamped to what actually plays", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, true, null, undefined, undefined, {
      audioAssets: [{
        inputIndex: 3, kind: "sfx", volume: 1, delaySec: 0,
        trimStart: 0, trimEnd: 0.4, durationSec: 5, fadeIn: 3, fadeOut: 3,
      }],
    });
    expect(filterComplex).toContain("afade=t=in:st=0:d=0.4");
    expect(filterComplex).toContain("afade=t=out:st=0:d=0.4");
  });
});

// #272: recording levels — the source's own audio rebuilt from the file's
// individual OBS tracks at the user's levels, in place of the full-mix track.
describe("buildNleFilterComplex — #272 recording levels (sourceMix)", () => {
  const MIX = [{ index: 1, gain: 0.5012 }, { index: 3, gain: 7.9433 }];

  test("single section: the file's tracks are leveled and summed into base_a", () => {
    const { filterComplex, mapArgs } = buildNleFilterComplex([SEGS_2[0]], false, null, undefined, undefined, {
      sourceMix: MIX,
    });
    expect(filterComplex).toBe(
      "[0:v]setpts=PTS-STARTPTS[base_v];" +
      "[0:a:1]volume=0.5012[s0_1];[0:a:3]volume=7.9433[s0_3];" +
      "[s0_1][s0_3]amix=inputs=2:duration=longest:normalize=0,asetpts=PTS-STARTPTS[base_a]"
    );
    expect(mapArgs).toEqual(["-map", "[base_v]", "-map", "[base_a]"]);
  });

  test("multi section: every input is rebuilt before the concat", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, { sourceMix: MIX });
    expect(filterComplex).toContain(
      "[1:a:1]volume=0.5012[s1_1];[1:a:3]volume=7.9433[s1_3];" +
      "[s1_1][s1_3]amix=inputs=2:duration=longest:normalize=0,asetpts=PTS-STARTPTS[a1]"
    );
    expect(filterComplex).toContain("[v0][a0][v1][a1]concat=n=2:v=1:a=1[base_v][base_a]");
    expect(filterComplex).not.toContain("[0:a]asetpts");
  });

  test("one mixable track: leveled, no amix stage", () => {
    const { filterComplex } = buildNleFilterComplex([SEGS_2[0]], false, null, undefined, undefined, {
      sourceMix: [{ index: 2, gain: 2 }],
    });
    expect(filterComplex).toContain("[0:a:2]volume=2[s0_2];[s0_2]asetpts=PTS-STARTPTS[base_a]");
    expect(filterComplex).not.toContain("amix");
  });

  test("levels and placed sounds compose: the rebuilt base feeds the #202 mix", () => {
    const { filterComplex } = buildNleFilterComplex([SEGS_2[0]], false, null, undefined, undefined, {
      sourceMix: MIX,
      audioAssets: [{ inputIndex: 1, kind: "sfx", volume: 1, delaySec: 0 }],
    });
    expect(filterComplex).toContain("[base_a]aformat=sample_rates=48000:channel_layouts=stereo[base_af]");
    expect(filterComplex).toContain("[base_af][mixin0]amix=inputs=2:duration=first:normalize=0[mix_a]");
  });

  test("the #296 mute still applies on top of the rebuilt base", () => {
    const { filterComplex } = buildNleFilterComplex([SEGS_2[0]], false, null, undefined, undefined, {
      sourceMix: MIX, sourceMuted: true,
    });
    expect(filterComplex).toContain("[base_a]volume=0[base_am]");
  });

  test("absent / empty sourceMix: graph is byte-identical to today's", () => {
    const plain = buildNleFilterComplex(SEGS_2, false, null);
    for (const sourceMix of [undefined, null, []]) {
      const out = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, { sourceMix });
      expect(out.filterComplex).toBe(plain.filterComplex);
      expect(out.mapArgs).toEqual(plain.mapArgs);
    }
  });

  test("thumbnail path (audio:false) ignores sourceMix", () => {
    const { filterComplex, mapArgs } = buildNleFilterComplex([SEGS_2[0]], false, null, undefined, undefined, {
      audio: false, sourceMix: MIX,
    });
    expect(filterComplex).not.toContain(":a:");
    expect(mapArgs).toEqual(["-map", "[base_v]"]);
  });
});
