// #310: image/GIF overlay compositing in the render filter graph.
// buildNleFilterComplex is the exported seam (#164). subtitle-overlay-renderer
// pulls in electron at require time — mock it so render.js loads under jest.
jest.mock("../subtitle-overlay-renderer", () => ({}));

const { buildNleFilterComplex } = require("../render");

const SEGS_2 = [
  { id: "a", sourceStart: 0, sourceEnd: 5 },
  { id: "b", sourceStart: 10, sourceEnd: 15 },
];

const IMG = {
  inputIndex: 3, mediaType: "image", tlStart: 1.5, tlEnd: 4.5,
  xPct: 25, yPct: 80, wPct: 40, opacity: 1,
};

describe("buildNleFilterComplex — #310 media overlays", () => {
  test("no mediaAssets: graph is byte-identical to the pre-#310 output", () => {
    const plain = buildNleFilterComplex(SEGS_2, true, null);
    const withEmpty = buildNleFilterComplex(SEGS_2, true, null, undefined, undefined, {
      mediaAssets: [], outputWidth: 1080,
    });
    expect(withEmpty.filterComplex).toBe(plain.filterComplex);
    expect(withEmpty.mapArgs).toEqual(plain.mapArgs);
  });

  test("one still: scaled to a percentage of the output width, centred on x/y", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, true, null, undefined, undefined, {
      mediaAssets: [IMG], outputWidth: 1920,
    });
    // 40% of 1920 = 768. x/y stay expressions so the overlay's own height
    // never has to be probed.
    expect(filterComplex).toContain("[3:v]format=rgba,scale=768:-1[movl0]");
    expect(filterComplex).toContain(
      "[base_v][movl0]overlay=x='(main_w*25/100)-(overlay_w/2)':" +
      "y='(main_h*80/100)-(overlay_h/2)':enable='between(t,1.5,4.5)':eof_action=pass[movid0]"
    );
  });

  test("overlays sit UNDER the subtitle composite", () => {
    const { filterComplex, mapArgs } = buildNleFilterComplex(SEGS_2, true, null, undefined, undefined, {
      mediaAssets: [IMG], outputWidth: 1920,
    });
    expect(filterComplex).toContain("[movid0][sub]overlay=0:0:eof_action=pass[out]");
    expect(mapArgs).toEqual(["-map", "[out]", "-map", "[base_a]"]);
  });

  test("reframe forces the 1080-wide output regardless of outputWidth", () => {
    const reframe = { camRect: null, gameRect: { x: 0, y: 0, w: 2560, h: 1440 } };
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, reframe, 2560, 2880, {
      mediaAssets: [{ ...IMG, inputIndex: 2, wPct: 50 }], outputWidth: 2560,
    });
    expect(filterComplex).toContain("scale=540:-1[movl0]"); // 50% of 1080
    expect(filterComplex).toContain("[base_out][movl0]overlay=");
  });

  test("a GIF's animation is shifted to start when its block does", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      mediaAssets: [{ ...IMG, mediaType: "gif", inputIndex: 2, tlStart: 2, tlEnd: 5 }],
      outputWidth: 1080,
    });
    expect(filterComplex).toContain("[2:v]setpts=PTS-STARTPTS+2/TB,format=rgba,scale=432:-1[movl0]");
  });

  test("a GIF at timeline 0 needs no setpts shift", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      mediaAssets: [{ ...IMG, mediaType: "gif", inputIndex: 2, tlStart: 0, tlEnd: 3 }],
      outputWidth: 1080,
    });
    expect(filterComplex).not.toContain("setpts=PTS-STARTPTS+");
  });

  test("opacity below 1 adds an alpha stage; opacity 1 leaves the chain clean", () => {
    const dim = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      mediaAssets: [{ ...IMG, inputIndex: 2, opacity: 0.5 }], outputWidth: 1080,
    }).filterComplex;
    const solid = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      mediaAssets: [{ ...IMG, inputIndex: 2 }], outputWidth: 1080,
    }).filterComplex;
    expect(dim).toContain("colorchannelmixer=aa=0.5");
    expect(solid).not.toContain("colorchannelmixer");
  });

  test("several overlays chain in the order given — the last one drawn is on top", () => {
    const { filterComplex, mapArgs } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      mediaAssets: [
        { ...IMG, inputIndex: 2, tlStart: 0, tlEnd: 3 },
        { ...IMG, inputIndex: 3, tlStart: 2, tlEnd: 5 },
      ],
      outputWidth: 1080,
    });
    expect(filterComplex).toContain("[base_v][movl0]overlay=");
    expect(filterComplex).toContain("[movid0][movl1]overlay=");
    expect(mapArgs).toEqual(["-map", "[movid1]", "-map", "[base_a]"]);
  });

  test("overlays and sounds coexist without either touching the other's graph", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      audioAssets: [{ inputIndex: 2, kind: "sfx", volume: 0.8, delaySec: 2.5 }],
      mediaAssets: [{ ...IMG, inputIndex: 3 }],
      outputWidth: 1080,
    });
    expect(filterComplex).toContain("[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.8,adelay=2500:all=1[mixin0]");
    expect(filterComplex).toContain("[3:v]format=rgba,scale=432:-1[movl0]");
  });

  test("outputWidth missing falls back to 1080 rather than producing a bad scale", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      mediaAssets: [{ ...IMG, inputIndex: 2, wPct: 50 }],
    });
    expect(filterComplex).toContain("scale=540:-1[movl0]");
  });
});
