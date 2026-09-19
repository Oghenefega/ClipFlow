// #448: gameplay/camera screenshots. Which layout box a capture cuts (and why
// it refuses), which section the playhead's instant belongs to, and the name a
// crop is saved under.
jest.mock("../subtitle-overlay-renderer", () => ({}));

const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveCaptureInstant } = require("../render");
const { croppedFileBase } = require("../projects");
const { captureRegionRect } = require("../../renderer/editor/utils/reframeStyle");

const CAM = { x: 0, y: 0, w: 2560, h: 1440 };
const GAME = { x: 0, y: 1440, w: 2560, h: 1440 };
const FULL = { layoutId: "full", camRect: CAM, gameRect: GAME, style: null };
const GAME_ONLY = { layoutId: "g", camRect: null, gameRect: { x: 200, y: 0, w: 1620, h: 2880 }, style: null };

describe("captureRegionRect", () => {
  test("gameplay and camera take their own boxes", () => {
    expect(captureRegionRect(FULL, "gameplay")).toEqual({ rect: GAME, reason: null });
    expect(captureRegionRect(FULL, "camera")).toEqual({ rect: CAM, reason: null });
  });

  test("a game-only layout has gameplay but no camera", () => {
    expect(captureRegionRect(GAME_ONLY, "gameplay").rect).toEqual(GAME_ONLY.gameRect);
    expect(captureRegionRect(GAME_ONLY, "camera")).toEqual({ rect: null, reason: "This part's layout has no camera box" });
  });

  test("no layout, or one the export would ignore, refuses both", () => {
    const noLayout = { rect: null, reason: "This part of the clip has no layout" };
    for (const rf of [null, undefined, { camRect: CAM }, { camRect: { x: 0, y: 0, w: 0, h: 10 }, gameRect: GAME }]) {
      expect(captureRegionRect(rf, "gameplay")).toEqual(noLayout);
      expect(captureRegionRect(rf, "camera")).toEqual(noLayout);
    }
  });
});

describe("resolveCaptureInstant", () => {
  let dir;
  let src;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cap448-"));
    src = path.join(dir, "rec.mp4");
    fs.writeFileSync(src, "x");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  // Section B reuses the project layout; A overrides it; C is raw.
  const segs = () => [
    { id: "a", sourceStart: 100, sourceEnd: 105, reframe: GAME_ONLY },
    { id: "b", sourceStart: 200, sourceEnd: 210 },
    { id: "c", sourceStart: 300, sourceEnd: 305, reframe: null },
  ];
  const project = () => ({ sourceFile: src, reframe: FULL });

  test("the playhead's section decides the layout and the source moment", () => {
    const a = resolveCaptureInstant({ id: "c1", nleSegments: segs() }, project(), 2);
    expect(a.sourceTime).toBeCloseTo(102);
    expect(a.reframe).toBe(GAME_ONLY);

    const b = resolveCaptureInstant({ id: "c1", nleSegments: segs() }, project(), 8);
    expect(b.sourceTime).toBeCloseTo(203);
    expect(b.reframe).toBe(FULL);
  });

  test("a raw section reports no layout (not the thumbnail's letterbox stand-in)", () => {
    const c = resolveCaptureInstant({ id: "c1", nleSegments: segs() }, project(), 17);
    expect(c.sourceTime).toBeCloseTo(302);
    expect(c.reframe).toBeNull();
    expect(captureRegionRect(c.reframe, "gameplay").rect).toBeNull();
  });

  test("the playhead past the end is clamped inside the clip", () => {
    const end = resolveCaptureInstant({ id: "c1", nleSegments: segs() }, project(), 999);
    expect(end.t).toBeCloseTo(19.95);
    expect(end.sourceTime).toBeCloseTo(304.95);
  });

  test("a missing recording is refused", () => {
    expect(() => resolveCaptureInstant({ id: "c1", nleSegments: segs() }, { sourceFile: path.join(dir, "gone.mp4") }, 1))
      .toThrow("Cannot capture: source recording not found");
  });
});

describe("croppedFileBase", () => {
  test("adds one (cropped) suffix", () => {
    expect(croppedFileBase("C:\\out\\Clip_gameplay_ab12.png")).toBe("Clip_gameplay_ab12 (cropped)");
  });

  test("a crop of a crop doesn't stack the suffix", () => {
    expect(croppedFileBase("C:\\out\\Clip_gameplay_ab12 (cropped).png")).toBe("Clip_gameplay_ab12 (cropped)");
    expect(croppedFileBase("C:\\out\\Clip_gameplay_ab12 (cropped) (3).png")).toBe("Clip_gameplay_ab12 (cropped)");
  });

  test("a numbered capture keeps its number", () => {
    expect(croppedFileBase("C:\\out\\Clip_thumbnail_ab12 (2).png")).toBe("Clip_thumbnail_ab12 (2) (cropped)");
  });
});
