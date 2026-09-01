// #349: per-section layouts. segment.reframe on an nleSegments entry is the
// same tri-state as clip.reframe one level down — absent = inherit the clip's
// effective layout, null = raw section, object = section override. These tests
// pin the resolver cascade, "same look" comparison, the edit ops that must
// carry the field through, the playhead → section lookup, and the on-disk
// strip that "Apply to all clips" performs.

const fs = require("fs");
const os = require("os");
const path = require("path");
const projects = require("../projects");
const {
  resolveSegmentReframe,
  sameReframeLook,
  fitToScreenReframe,
  REFRAME_STYLE_DEFAULTS,
} = require("../../renderer/editor/utils/reframeStyle");
const {
  splitAtSource,
  trimSegmentLeft,
  trimSegmentRight,
  extendSegmentRight,
  moveSegment,
  deleteSegment,
} = require("../../renderer/editor/models/segmentOps");
const { segmentIdAtTimeline } = require("../../renderer/editor/models/timeMapping");

const RECT = { x: 10, y: 20, w: 300, h: 400 };
const CAM = { x: 0, y: 0, w: 100, h: 100 };
const PROJECT_LAYOUT = { layoutId: "proj", camRect: CAM, gameRect: RECT, style: null };
const CLIP_LAYOUT = { layoutId: "clip", camRect: null, gameRect: RECT, style: null };
const SECTION_LAYOUT = { layoutId: "sec", camRect: CAM, gameRect: { x: 0, y: 0, w: 50, h: 50 }, style: null };

describe("resolveSegmentReframe — cascade", () => {
  const project = { reframe: PROJECT_LAYOUT };

  test("absent key inherits the clip's effective layout (clip override, then project)", () => {
    expect(resolveSegmentReframe({ id: "s" }, { reframe: CLIP_LAYOUT }, project)).toBe(CLIP_LAYOUT);
    expect(resolveSegmentReframe({ id: "s" }, {}, project)).toBe(PROJECT_LAYOUT);
    expect(resolveSegmentReframe({ id: "s" }, { reframe: null }, project)).toBeNull();
  });

  test("null is a real value — the section is raw even under a clip layout", () => {
    expect(resolveSegmentReframe({ id: "s", reframe: null }, { reframe: CLIP_LAYOUT }, project)).toBeNull();
  });

  test("an object wins over everything", () => {
    expect(resolveSegmentReframe({ id: "s", reframe: SECTION_LAYOUT }, { reframe: null }, project)).toBe(SECTION_LAYOUT);
    expect(resolveSegmentReframe({ id: "s", reframe: SECTION_LAYOUT }, {}, { reframe: null })).toBe(SECTION_LAYOUT);
  });

  test("no segment at all falls through to the clip resolver", () => {
    expect(resolveSegmentReframe(undefined, {}, project)).toBe(PROJECT_LAYOUT);
    expect(resolveSegmentReframe(null, {}, {})).toBeNull();
  });
});

describe("sameReframeLook — value comparison, layoutId ignored", () => {
  test("two nulls are the same (raw) look; null vs a layout is not", () => {
    expect(sameReframeLook(null, null)).toBe(true);
    expect(sameReframeLook(null, CLIP_LAYOUT)).toBe(false);
    expect(sameReframeLook(CLIP_LAYOUT, undefined)).toBe(false);
  });

  test("same geometry under different library ids is the same look", () => {
    expect(sameReframeLook({ ...CLIP_LAYOUT, layoutId: "x" }, { ...CLIP_LAYOUT, layoutId: "y" })).toBe(true);
  });

  test("a missing style equals the default style", () => {
    expect(sameReframeLook({ ...CLIP_LAYOUT, style: null }, { ...CLIP_LAYOUT, style: { ...REFRAME_STYLE_DEFAULTS } })).toBe(true);
    expect(sameReframeLook({ ...CLIP_LAYOUT, style: null }, { ...CLIP_LAYOUT, style: { blur: 0 } })).toBe(false);
  });

  test("a different rect, or cam vs no cam, is a different look", () => {
    expect(sameReframeLook(CLIP_LAYOUT, { ...CLIP_LAYOUT, gameRect: { ...RECT, w: 301 } })).toBe(false);
    expect(sameReframeLook(CLIP_LAYOUT, { ...CLIP_LAYOUT, camRect: CAM })).toBe(false);
  });
});

test("fitToScreenReframe letterboxes the whole frame with the borrowed style", () => {
  const rf = fitToScreenReframe(2560, 2880, { blur: 20 });
  expect(rf.camRect).toBeNull();
  expect(rf.gameRect).toEqual({ x: 0, y: 0, w: 2560, h: 2880 });
  expect(rf.style.blur).toBe(20);
  expect(rf.style.darken).toBe(REFRAME_STYLE_DEFAULTS.darken);
});

describe("segment edit ops carry reframe through", () => {
  const segs = [
    { id: "a", sourceStart: 0, sourceEnd: 10, reframe: SECTION_LAYOUT },
    { id: "b", sourceStart: 20, sourceEnd: 30, reframe: null },
    { id: "c", sourceStart: 40, sourceEnd: 50 },
  ];

  test("split: both halves keep the parent's override, and a parent without the key yields halves without it", () => {
    const out = splitAtSource(segs, 5);
    expect(out).toHaveLength(4);
    expect(out[0].id).toBe("a");
    expect(out[0].reframe).toBe(SECTION_LAYOUT);
    expect(out[1].id).not.toBe("a");
    expect(out[1].reframe).toBe(SECTION_LAYOUT);
    expect(out[1].sourceStart).toBe(5);
    expect(out[1].sourceEnd).toBe(10);

    const nullSplit = splitAtSource(segs, 25);
    expect(nullSplit[1].reframe).toBeNull();
    expect(nullSplit[2].reframe).toBeNull();

    const bare = splitAtSource(segs, 45);
    expect("reframe" in bare[2]).toBe(false);
    expect("reframe" in bare[3]).toBe(false);
  });

  test("trim / extend / move / delete keep the field", () => {
    expect(trimSegmentLeft(segs, "a", 2)[0].reframe).toBe(SECTION_LAYOUT);
    expect(trimSegmentRight(segs, "b", 25)[1].reframe).toBeNull();
    expect(extendSegmentRight(segs, "a", 15, 100)[0].reframe).toBe(SECTION_LAYOUT);
    const moved = moveSegment(segs, "a", 2);
    expect(moved[2].id).toBe("a");
    expect(moved[2].reframe).toBe(SECTION_LAYOUT);
    expect(deleteSegment(segs, "b").find((s) => s.id === "a").reframe).toBe(SECTION_LAYOUT);
  });
});

describe("segmentIdAtTimeline — the section under the playhead", () => {
  const segs = [
    { id: "a", sourceStart: 0, sourceEnd: 10 },
    { id: "b", sourceStart: 20, sourceEnd: 30 },
  ];

  test("inside a section", () => {
    expect(segmentIdAtTimeline(3, segs)).toBe("a");
    expect(segmentIdAtTimeline(13, segs)).toBe("b");
  });

  test("on a join the NEXT section is meant", () => {
    expect(segmentIdAtTimeline(10, segs)).toBe("b");
  });

  test("the very end stays on the last section; past the end too; empty is null", () => {
    expect(segmentIdAtTimeline(20, segs)).toBe("b");
    expect(segmentIdAtTimeline(99, segs)).toBe("b");
    expect(segmentIdAtTimeline(0, [])).toBeNull();
  });
});

describe("applyReframeToAllClips strips section overrides on disk", () => {
  let WATCH;
  beforeAll(() => { WATCH = fs.mkdtempSync(path.join(os.tmpdir(), "clipflow-secreframe-")); });
  afterAll(() => { fs.rmSync(WATCH, { recursive: true, force: true }); });

  test("every clip's nleSegments lose their reframe keys in the same save", () => {
    const { project } = projects.createProject(WATCH, {
      sourceFile: path.join(WATCH, "rec.mp4"), name: "Rec", sourceWidth: 2560, sourceHeight: 2880,
    });
    const { clip } = projects.addClip(WATCH, project.id, { title: "Clip 1", startTime: 0, endTime: 30 });
    projects.updateClip(WATCH, project.id, clip.id, {
      nleSegments: [
        { id: "s1", sourceStart: 0, sourceEnd: 10, reframe: SECTION_LAYOUT },
        { id: "s2", sourceStart: 10, sourceEnd: 20, reframe: null },
        { id: "s3", sourceStart: 20, sourceEnd: 30 },
      ],
    });
    expect(projects.updateClipReframe(WATCH, project.id, clip.id, CLIP_LAYOUT).success).toBe(true);

    const res = projects.applyReframeToAllClips(WATCH, project.id, PROJECT_LAYOUT);
    expect(res.success).toBe(true);

    const saved = projects.loadProject(WATCH, project.id);
    const c = saved.clips.find((x) => x.id === clip.id);
    expect(c.reframe).toBeUndefined();
    expect(c.nleSegments).toHaveLength(3);
    for (const s of c.nleSegments) expect("reframe" in s).toBe(false);
    expect(saved.reframe.layoutId).toBe("proj");
  });
});
