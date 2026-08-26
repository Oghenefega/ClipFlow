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
    // never has to be probed. eof_action=repeat so a non-looping GIF freezes
    // on its last frame (like the preview's <img>) instead of vanishing.
    expect(filterComplex).toContain("[3:v]format=rgba,scale=768:-1[movl0]");
    expect(filterComplex).toContain(
      "[base_v][movl0]overlay=x='(main_w*25/100)-(overlay_w/2)':" +
      "y='(main_h*80/100)-(overlay_h/2)':enable='between(t,1.5,4.5)':eof_action=repeat[movid0]"
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

// #311: video overlays. The picture joins the same overlay chain images use;
// the sound joins the same amix chain an SFX uses. Both are additive — a clip
// with no video overlays must produce the exact graph it did before.
const VID = {
  inputIndex: 3, mediaType: "video", tlStart: 2, tlEnd: 6,
  trimStart: 1, trimEnd: 5, volume: 0.6, muted: false, hasAudio: true,
  xPct: 50, yPct: 50, wPct: 40, opacity: 1,
};

describe("buildNleFilterComplex — #311 video overlays", () => {
  test("picture: the file window is cut out, then rebased to its timeline moment", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      mediaAssets: [VID], outputWidth: 1080,
    });
    expect(filterComplex).toContain(
      "[3:v]trim=1:5,setpts=PTS-STARTPTS+2/TB,format=rgba,scale=432:-1[movl0]"
    );
    expect(filterComplex).toContain(
      "[base_v][movl0]overlay=x='(main_w*50/100)-(overlay_w/2)':" +
      "y='(main_h*50/100)-(overlay_h/2)':enable='between(t,2,6)':eof_action=repeat[movid0]"
    );
  });

  test("sound: mixed in exactly like an SFX, off the SAME input as the picture", () => {
    const { filterComplex, mapArgs } = buildNleFilterComplex(SEGS_2, true, null, undefined, undefined, {
      mediaAssets: [VID], outputWidth: 1080,
    });
    // atrim cuts the same window the picture uses; adelay puts it at tlStart.
    expect(filterComplex).toContain(
      "[3:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=1:5,asetpts=PTS-STARTPTS," +
      "volume=0.6,adelay=2000:all=1[mixin0]"
    );
    expect(filterComplex).toContain("amix=inputs=2:duration=first:normalize=0[mix_a]");
    expect(mapArgs).toEqual(["-map", "[out]", "-map", "[mix_a]"]);
  });

  test("a video at timeline 0 still rebases — trim leaves the source timestamps behind", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      mediaAssets: [{ ...VID, tlStart: 0, tlEnd: 4 }], outputWidth: 1080,
    });
    expect(filterComplex).toContain("[3:v]trim=1:5,setpts=PTS-STARTPTS+0/TB,");
  });

  test("muted: the picture still plays, the audio graph is untouched", () => {
    const muted = buildNleFilterComplex(SEGS_2, true, null, undefined, undefined, {
      mediaAssets: [{ ...VID, muted: true }], outputWidth: 1080,
    });
    const noOverlay = buildNleFilterComplex(SEGS_2, true, null);
    expect(muted.filterComplex).toContain("[3:v]trim=1:5,");
    expect(muted.filterComplex).not.toContain("amix");
    expect(muted.mapArgs).toEqual(["-map", "[out]", "-map", "[base_a]"]);
    // The audio half is byte-identical to a clip with no overlays at all.
    expect(muted.filterComplex.split(";").filter((f) => f.includes(":a]") || f.includes("[base_a]")))
      .toEqual(noOverlay.filterComplex.split(";").filter((f) => f.includes(":a]") || f.includes("[base_a]")));
  });

  test("a silent file is dropped from the mix rather than referencing [N:a]", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, true, null, undefined, undefined, {
      mediaAssets: [{ ...VID, hasAudio: false }], outputWidth: 1080,
    });
    expect(filterComplex).not.toContain("[3:a]");
    expect(filterComplex).not.toContain("amix");
  });

  test("video sound mixes AFTER the sound placements, so no mixin index shifts", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, true, null, undefined, undefined, {
      audioAssets: [{ inputIndex: 2, kind: "sfx", volume: 0.8, delaySec: 2.5 }],
      mediaAssets: [VID], outputWidth: 1080,
    });
    expect(filterComplex).toContain("[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.8,adelay=2500:all=1[mixin0]");
    expect(filterComplex).toContain("[3:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=1:5,asetpts=PTS-STARTPTS,volume=0.6,adelay=2000:all=1[mixin1]");
    expect(filterComplex).toContain("amix=inputs=3:duration=first:normalize=0[mix_a]");
  });

  test("thumbnails (audio:false) never reach for a video overlay's sound", () => {
    const { filterComplex, mapArgs } = buildNleFilterComplex(
      [{ id: "t", sourceStart: 3, sourceEnd: 4 }], false, null, undefined, undefined,
      { audio: false, mediaAssets: [{ ...VID, inputIndex: 1 }], outputWidth: 1080 }
    );
    expect(filterComplex).not.toContain("[1:a]");
    expect(mapArgs).toEqual(["-map", "[movid0]"]);
  });

  test("images and GIFs never grow a trim stage", () => {
    const { filterComplex } = buildNleFilterComplex(SEGS_2, false, null, undefined, undefined, {
      mediaAssets: [IMG, { ...IMG, mediaType: "gif", inputIndex: 4, tlStart: 1 }],
      outputWidth: 1080,
    });
    expect(filterComplex).not.toContain("trim=");
  });
});
