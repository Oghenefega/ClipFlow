// #348: per-clip layout overrides. clip.reframe is tri-state — absent =
// inherit project.reframe, null = explicitly no layout, object = override.
// These tests pin the write paths (validated updateClipReframe, the "inherit"
// sentinel, applyReframeToAllClips stripping) and the resolver semantics.

const fs = require("fs");
const os = require("os");
const path = require("path");
const projects = require("../projects");
const { resolveClipReframe } = require("../../renderer/editor/utils/reframeStyle");

let WATCH;

const RECT = { x: 10, y: 20, w: 300, h: 400 };
const LAYOUT = { layoutId: "layout_test", camRect: { x: 0, y: 0, w: 100, h: 100 }, gameRect: RECT, style: null };

/** Fresh project with two clips; returns { projectId, clipIds }. */
function seedProject() {
  const { project } = projects.createProject(WATCH, {
    sourceFile: path.join(WATCH, "rec.mp4"),
    name: "Test Recording",
    sourceWidth: 2560,
    sourceHeight: 2880,
  });
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const { clip } = projects.addClip(WATCH, project.id, { title: `Clip ${i + 1}`, startTime: i * 10, endTime: i * 10 + 8 });
    ids.push(clip.id);
  }
  return { projectId: project.id, clipIds: ids };
}

const load = (projectId) => projects.loadProject(WATCH, projectId);

beforeAll(() => {
  WATCH = fs.mkdtempSync(path.join(os.tmpdir(), "clipflow-reframe-"));
});

afterAll(() => {
  fs.rmSync(WATCH, { recursive: true, force: true });
});

describe("updateClipReframe (#348)", () => {
  test("override lands on the one clip; the sibling and project stay untouched", () => {
    const { projectId, clipIds } = seedProject();
    const res = projects.updateClipReframe(WATCH, projectId, clipIds[0], LAYOUT);
    expect(res.success).toBe(true);
    const proj = load(projectId);
    expect(proj.clips[0].reframe.gameRect).toEqual(RECT);
    expect(proj.clips[0].reframe.style).toBeTruthy(); // garbage style resolves to defaults
    expect("reframe" in proj.clips[1]).toBe(false);
    expect(proj.reframe).toBeNull();
  });

  test("null = explicitly no layout; 'inherit' deletes the key", () => {
    const { projectId, clipIds } = seedProject();
    projects.updateClipReframe(WATCH, projectId, clipIds[0], null);
    expect(load(projectId).clips[0].reframe).toBeNull();
    projects.updateClipReframe(WATCH, projectId, clipIds[0], "inherit");
    expect("reframe" in load(projectId).clips[0]).toBe(false);
  });

  test("invalid rects are rejected and nothing is written", () => {
    const { projectId, clipIds } = seedProject();
    const bad = projects.updateClipReframe(WATCH, projectId, clipIds[0], { camRect: null, gameRect: { x: 0, y: 0, w: -5, h: 10 } });
    expect(bad.error).toBeTruthy();
    expect("reframe" in load(projectId).clips[0]).toBe(false);
    expect(projects.updateClipReframe(WATCH, projectId, "clip_nope", LAYOUT).error).toBeTruthy();
  });

  test("camRect null (game-only layout) survives the whitelist", () => {
    const { projectId, clipIds } = seedProject();
    projects.updateClipReframe(WATCH, projectId, clipIds[0], { ...LAYOUT, camRect: null });
    expect(load(projectId).clips[0].reframe.camRect).toBeNull();
  });
});

describe("applyReframeToAllClips (#348)", () => {
  test("sets project.reframe and strips every clip override in one save", () => {
    const { projectId, clipIds } = seedProject();
    projects.updateClipReframe(WATCH, projectId, clipIds[0], LAYOUT);
    projects.updateClipReframe(WATCH, projectId, clipIds[1], null);
    const res = projects.applyReframeToAllClips(WATCH, projectId, LAYOUT);
    expect(res.success).toBe(true);
    const proj = load(projectId);
    expect(proj.reframe.gameRect).toEqual(RECT);
    for (const c of proj.clips) expect("reframe" in c).toBe(false);
  });

  test("null removes the layout everywhere", () => {
    const { projectId, clipIds } = seedProject();
    projects.updateReframe(WATCH, projectId, LAYOUT);
    projects.updateClipReframe(WATCH, projectId, clipIds[0], null);
    projects.applyReframeToAllClips(WATCH, projectId, null);
    const proj = load(projectId);
    expect(proj.reframe).toBeNull();
    for (const c of proj.clips) expect("reframe" in c).toBe(false);
  });
});

describe("resolveClipReframe", () => {
  const projReframe = { layoutId: "p", camRect: null, gameRect: RECT, style: {} };
  test("absent key inherits the project layout (same reference — render parity)", () => {
    const project = { reframe: projReframe };
    expect(resolveClipReframe({ id: "c1" }, project)).toBe(projReframe);
    expect(resolveClipReframe(null, project)).toBe(projReframe);
  });
  test("null override wins over a project layout", () => {
    expect(resolveClipReframe({ reframe: null }, { reframe: projReframe })).toBeNull();
  });
  test("object override wins; nothing anywhere resolves to null", () => {
    const own = { ...projReframe, layoutId: "own" };
    expect(resolveClipReframe({ reframe: own }, { reframe: projReframe })).toBe(own);
    expect(resolveClipReframe({ id: "c1" }, { reframe: null })).toBeNull();
    expect(resolveClipReframe(null, null)).toBeNull();
  });
});
