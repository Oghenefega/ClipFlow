// #348: per-clip layout overrides. clip.reframe is tri-state — absent =
// inherit project.reframe, null = explicitly no layout, object = override.
// These tests pin the write paths (validated updateClipReframe, the "inherit"
// sentinel, applyReframeToAllClips stripping) and the resolver semantics.

const fs = require("fs");
const os = require("os");
const path = require("path");
const projects = require("../projects");
const { resolveClipReframe, resolveReframeStyle } = require("../../renderer/editor/utils/reframeStyle");

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

// #443: Ctrl+Z of a layout writes back what the editor's undo snapshot held.
describe("restoreLayouts (#443)", () => {
  // Stored layouts always carry a fully resolved style (the store writes them that way).
  const OTHER = { ...LAYOUT, layoutId: "layout_other", gameRect: { x: 1, y: 2, w: 30, h: 40 }, style: resolveReframeStyle(null) };
  const SECTIONS = [
    { id: "seg-a", sourceStart: 0, sourceEnd: 4, reframe: OTHER },
    { id: "seg-b", sourceStart: 4, sourceEnd: 8 },
    { id: "seg-c", sourceStart: 8, sourceEnd: 9, reframe: null },
  ];

  test("undoes 'Replace on every clip': project, clip and section layouts all come back", () => {
    const { projectId, clipIds } = seedProject();
    projects.updateReframe(WATCH, projectId, LAYOUT);
    projects.updateClipReframe(WATCH, projectId, clipIds[0], null);
    projects.updateClipReframe(WATCH, projectId, clipIds[1], OTHER);
    projects.updateClip(WATCH, projectId, clipIds[1], { nleSegments: SECTIONS });
    const before = load(projectId);

    projects.applyReframeToAllClips(WATCH, projectId, OTHER);
    const res = projects.restoreLayouts(WATCH, projectId, {
      project: LAYOUT,
      clips: [
        { id: clipIds[0], reframe: null },
        { id: clipIds[1], reframe: OTHER, sections: SECTIONS.map((s) => ({ id: s.id, reframe: s.reframe === undefined ? "inherit" : s.reframe })) },
      ],
    });
    expect(res.success).toBe(true);
    const after = load(projectId);
    expect(after.reframe).toEqual(before.reframe);
    expect(after.clips[0].reframe).toBeNull();
    expect(after.clips[1].reframe).toEqual(before.clips[1].reframe);
    expect(after.clips[1].nleSegments).toEqual(before.clips[1].nleSegments);
  });

  test("'inherit' removes the key; only layout keys are written", () => {
    const { projectId, clipIds } = seedProject();
    projects.updateReframe(WATCH, projectId, LAYOUT);
    projects.updateClipReframe(WATCH, projectId, clipIds[0], OTHER);
    projects.updateClip(WATCH, projectId, clipIds[0], { title: "Kept", nleSegments: SECTIONS });
    const before = load(projectId);

    projects.restoreLayouts(WATCH, projectId, {
      project: "inherit",
      clips: [{ id: clipIds[0], reframe: "inherit", sections: [{ id: "seg-a", reframe: "inherit" }] }],
    });
    const after = load(projectId);
    expect(after.reframe).toBeNull(); // a project with no layout always loads as null
    expect("reframe" in after.clips[0]).toBe(false);
    expect("reframe" in after.clips[0].nleSegments[0]).toBe(false);
    // Unlisted sections and every non-layout field stay exactly as they were.
    expect(after.clips[0].nleSegments.slice(1)).toEqual(before.clips[0].nleSegments.slice(1));
    const strip = (c) => { const { reframe: _r, nleSegments: _n, ...rest } = c; return rest; };
    expect(strip(after.clips[0])).toEqual(strip(before.clips[0]));
    expect(after.clips[1]).toEqual(before.clips[1]);
  });

  test("a clip listed without sections keeps its sections; no project key leaves the project layout", () => {
    const { projectId, clipIds } = seedProject();
    projects.updateReframe(WATCH, projectId, LAYOUT);
    projects.updateClip(WATCH, projectId, clipIds[0], { nleSegments: SECTIONS });
    projects.restoreLayouts(WATCH, projectId, { clips: [{ id: clipIds[0], reframe: OTHER }] });
    const after = load(projectId);
    expect(after.reframe.gameRect).toEqual(RECT);
    expect(after.clips[0].reframe.gameRect).toEqual(OTHER.gameRect);
    expect(after.clips[0].nleSegments[0].reframe.layoutId).toBe("layout_other");
    expect(after.clips[0].nleSegments[2].reframe).toBeNull();
  });

  test("an invalid layout saves nothing", () => {
    const { projectId, clipIds } = seedProject();
    projects.updateReframe(WATCH, projectId, LAYOUT);
    const before = load(projectId);
    const res = projects.restoreLayouts(WATCH, projectId, {
      project: null,
      clips: [{ id: clipIds[0], reframe: { camRect: null, gameRect: { x: 0, y: 0, w: -1, h: 5 } } }],
    });
    expect(res.error).toBeTruthy();
    expect(load(projectId)).toEqual(before);
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
