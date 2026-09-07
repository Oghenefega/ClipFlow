// #365: "apply to all clips" must be able to leave edited clips alone.
// applyReframeToAllClips / applyAudioMixToAllClips take { keepOverrides,
// dropClipId }: with keepOverrides only the project default changes (clips
// without their own pick it up by inheritance), the source clip's own copy is
// dropped, and every other clip's own layout / levels / section layouts stay.

const fs = require("fs");
const os = require("os");
const path = require("path");
const projects = require("../projects");

let WATCH;

const RECT = { x: 10, y: 20, w: 300, h: 400 };
const LAYOUT_A = { layoutId: "layout_a", camRect: { x: 0, y: 0, w: 100, h: 100 }, gameRect: RECT, style: null };
const LAYOUT_B = { layoutId: "layout_b", camRect: null, gameRect: { x: 5, y: 5, w: 200, h: 300 }, style: null };

/** Fresh project with three clips; returns { projectId, clipIds }. */
function seedProject() {
  const { project } = projects.createProject(WATCH, {
    sourceFile: path.join(WATCH, "rec.mp4"),
    name: "Test Recording",
    sourceWidth: 2560,
    sourceHeight: 2880,
  });
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const { clip } = projects.addClip(WATCH, project.id, { title: `Clip ${i + 1}`, startTime: i * 10, endTime: i * 10 + 8 });
    ids.push(clip.id);
  }
  return { projectId: project.id, clipIds: ids };
}

const load = (projectId) => projects.loadProject(WATCH, projectId);

beforeAll(() => {
  WATCH = fs.mkdtempSync(path.join(os.tmpdir(), "clipflow-unedited-"));
});

afterAll(() => {
  fs.rmSync(WATCH, { recursive: true, force: true });
});

describe("applyReframeToAllClips with keepOverrides (#365)", () => {
  test("sets the default, drops only the source clip's own, keeps the others", () => {
    const { projectId, clipIds } = seedProject();
    const [src, edited, plain] = clipIds;
    projects.updateClipReframe(WATCH, projectId, src, LAYOUT_A);
    projects.updateClipReframe(WATCH, projectId, edited, LAYOUT_B);
    // a per-section layout on the edited clip (#349)
    projects.updateClip(WATCH, projectId, edited, { nleSegments: [{ id: "s1", reframe: LAYOUT_B }, { id: "s2" }] });

    const res = projects.applyReframeToAllClips(WATCH, projectId, LAYOUT_A, { keepOverrides: true, dropClipId: src });
    expect(res.success).toBe(true);

    const proj = load(projectId);
    const byId = Object.fromEntries(proj.clips.map((c) => [c.id, c]));
    expect(proj.reframe.layoutId).toBe("layout_a");
    expect("reframe" in byId[src]).toBe(false); // source now inherits (same picture)
    expect(byId[edited].reframe.layoutId).toBe("layout_b"); // untouched
    expect(byId[edited].nleSegments[0].reframe.layoutId).toBe("layout_b"); // section kept
    expect("reframe" in byId[plain]).toBe(false); // still inherits → gets layout_a
  });

  test("a clip that chose 'no layout' keeps that choice", () => {
    const { projectId, clipIds } = seedProject();
    projects.updateClipReframe(WATCH, projectId, clipIds[1], null);
    projects.applyReframeToAllClips(WATCH, projectId, LAYOUT_A, { keepOverrides: true, dropClipId: clipIds[0] });
    expect(load(projectId).clips[1].reframe).toBeNull();
  });

  test("without keepOverrides the old wipe still happens", () => {
    const { projectId, clipIds } = seedProject();
    projects.updateClipReframe(WATCH, projectId, clipIds[1], LAYOUT_B);
    projects.applyReframeToAllClips(WATCH, projectId, LAYOUT_A);
    for (const c of load(projectId).clips) expect("reframe" in c).toBe(false);
  });
});

describe("applyAudioMixToAllClips with keepOverrides (#365)", () => {
  test("sets the default, drops only the source clip's own, keeps the others", () => {
    const { projectId, clipIds } = seedProject();
    const [src, edited, plain] = clipIds;
    projects.updateClip(WATCH, projectId, src, { audioMix: { 1: -6 } });
    projects.updateClip(WATCH, projectId, edited, { audioMix: { 1: 3, 2: -12 } });

    const res = projects.applyAudioMixToAllClips(WATCH, projectId, { 1: -6 }, { keepOverrides: true, dropClipId: src });
    expect(res.success).toBe(true);

    const proj = load(projectId);
    const byId = Object.fromEntries(proj.clips.map((c) => [c.id, c]));
    expect(proj.audioMix).toEqual({ 1: -6 });
    expect("audioMix" in byId[src]).toBe(false);
    expect(byId[edited].audioMix).toEqual({ 1: 3, 2: -12 });
    expect("audioMix" in byId[plain]).toBe(false);
  });

  test("without keepOverrides every clip's own levels go", () => {
    const { projectId, clipIds } = seedProject();
    projects.updateClip(WATCH, projectId, clipIds[1], { audioMix: { 1: 3 } });
    projects.applyAudioMixToAllClips(WATCH, projectId, { 1: -6 });
    for (const c of load(projectId).clips) expect("audioMix" in c).toBe(false);
  });
});
