// #471: removing an imported clip — which file it came from, what gets forgotten,
// and the boot repair for imports stranded before #471.
jest.mock("electron", () => ({ app: { getPath: () => require("os").tmpdir() } }));
jest.mock("../logger", () => ({ info: () => {}, warn: () => {}, MODULES: { system: "system" } }));
jest.mock("../ffmpeg", () => ({}));
jest.mock("../ai/providers/gemini", () => ({}));
jest.mock("../ai/title-caption-prompt", () => ({}));
jest.mock("../ai-prompt", () => ({}));
jest.mock("../pipeline-logger", () => ({}));

const fs = require("fs");
const os = require("os");
const path = require("path");
const projects = require("../projects");
const { fingerprintFile, fingerprintForClip, removeImport, repairStuckImports } = require("../queue-imports");

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "queue-imports-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const makeStore = (init) => {
  const data = { ...init };
  return { get: (k) => data[k], set: (k, v) => { data[k] = v; } };
};
const write = (name, content) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
};

/** An import project holding `clips`, under a scratch library root. */
function library(clips) {
  const root = path.join(dir, "library");
  fs.mkdirSync(root, { recursive: true });
  const { project } = projects.createProject(root, { name: "Imports — Test", sourceFile: null, game: "Test", gameTag: "tt", kind: "import" });
  project.clips = clips;
  projects.saveProject(root, project);
  return { root, projectId: project.id };
}

describe("fingerprintForClip", () => {
  test("a stored fingerprint wins", () => {
    expect(fingerprintForClip({ importFingerprint: "abc", renderPath: "x" }, {})).toBe("abc");
  });

  test("without one, the copy answers — then the original", () => {
    const copy = write("copy.mp4", "same bytes");
    const orig = write("orig.mp4", "same bytes");
    const fp = fingerprintFile(orig);
    expect(fingerprintForClip({ renderPath: copy, importedFrom: orig }, {})).toBe(fp);
    expect(fingerprintForClip({ renderPath: path.join(dir, "gone.mp4"), importedFrom: orig }, {})).toBe(fp);
  });

  test("with both files gone, the one imported entry under the original's name", () => {
    const clip = { renderPath: path.join(dir, "gone.mp4"), importedFrom: "D:\\Clips\\#3 funny.mp4" };
    expect(fingerprintForClip(clip, { fp1: { status: "imported", file: "#3 funny.mp4" }, fp2: { status: "imported", file: "other.mp4" } })).toBe("fp1");
  });

  test("an ambiguous name answers nothing", () => {
    const clip = { importedFrom: "D:\\Clips\\clip.mp4" };
    expect(fingerprintForClip(clip, { a: { status: "imported", file: "clip.mp4" }, b: { status: "imported", file: "clip.mp4" } })).toBeNull();
  });
});

describe("removeImport", () => {
  test("deletes the clip and its copy, forgets the file, leaves the original", () => {
    const orig = write("orig.mp4", "original");
    const copy = write("copy.mp4", "original");
    const { root, projectId } = library([{ id: "clip_import_1", source: "import", status: "approved", renderPath: copy, importedFrom: orig, importFingerprint: "fp1" }]);
    const store = makeStore({ importMemory: { fp1: { status: "imported" }, fp2: { status: "imported" } } });

    const res = removeImport({ store, watchFolder: root, projectId, clipId: "clip_import_1" });

    expect(res).toEqual({ success: true, forgotten: true });
    expect(projects.loadProject(root, projectId).clips).toHaveLength(0);
    expect(fs.existsSync(copy)).toBe(false);
    expect(fs.existsSync(orig)).toBe(true);
    expect(store.get("importMemory")).toEqual({ fp2: { status: "imported" } });
  });

  test("a repost of an import is removed but its file stays remembered", () => {
    const copy = write("copy repost.mp4", "original");
    const { root, projectId } = library([{ id: "clip_2", source: "import", repostOf: "clip_import_1", status: "approved", renderPath: copy, importFingerprint: "fp1" }]);
    const store = makeStore({ importMemory: { fp1: { status: "imported" } } });

    const res = removeImport({ store, watchFolder: root, projectId, clipId: "clip_2" });

    expect(res).toEqual({ success: true, forgotten: false });
    expect(fs.existsSync(copy)).toBe(false);
    expect(store.get("importMemory")).toEqual({ fp1: { status: "imported" } });
  });

  test("refuses a clip that isn't an import", () => {
    const { root, projectId } = library([{ id: "clip_3", status: "approved" }]);
    const store = makeStore({ importMemory: {} });
    expect(removeImport({ store, watchFolder: root, projectId, clipId: "clip_3" }).error).toBeTruthy();
    expect(projects.loadProject(root, projectId).clips).toHaveLength(1);
  });
});

describe("repairStuckImports", () => {
  test("forgets and drops dequeued imports, keeps the rest and every file", () => {
    const orig = write("stuck.mp4", "stuck bytes");
    const leftCopy = write("left copy.mp4", "other bytes");
    const fp = fingerprintFile(orig);
    const { root, projectId } = library([
      { id: "stuck", source: "import", status: "dequeued", renderPath: null, importedFrom: orig },
      { id: "stuck2", source: "import", status: "dequeued", renderPath: leftCopy, importFingerprint: "fpLeft" },
      { id: "repost", source: "import", status: "dequeued", repostOf: "x", importFingerprint: "fpRepost" },
      { id: "live", source: "import", status: "approved", importFingerprint: "fpLive" },
    ]);
    const store = makeStore({ importMemory: { [fp]: { status: "imported" }, fpLeft: { status: "imported" }, fpRepost: { status: "imported" }, fpLive: { status: "imported" } } });

    expect(repairStuckImports({ store, watchFolder: root })).toEqual({ repaired: 2 });

    expect(projects.loadProject(root, projectId).clips.map((c) => c.id)).toEqual(["repost", "live"]);
    expect(Object.keys(store.get("importMemory")).sort()).toEqual(["fpLive", "fpRepost"]);
    expect(fs.existsSync(orig)).toBe(true);
    expect(fs.existsSync(leftCopy)).toBe(true);
    // Idempotent: nothing left to repair on the next boot.
    expect(repairStuckImports({ store, watchFolder: root })).toEqual({ repaired: 0 });
  });
});
