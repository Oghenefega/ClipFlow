// #454: the clip's picture — where the picked moment is clamped, how a cut is checked,
// and which superseded pictures may be deleted.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { clampPickTime, cutPicture, retirePicture } = require("../clip-picture");

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "clip-picture-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("clampPickTime", () => {
  test("no pick, zero, negative or garbage is the first frame", () => {
    for (const t of [undefined, null, 0, -1, NaN, "2"]) expect(clampPickTime(t, 10)).toBe(0);
  });

  test("a pick inside the file is kept", () => {
    expect(clampPickTime(2.5, 10)).toBe(2.5);
  });

  test("a pick at or past the end moves just inside it", () => {
    expect(clampPickTime(10, 10)).toBeCloseTo(9.9);
    expect(clampPickTime(42, 10)).toBeCloseTo(9.9);
  });

  test("an unknown length keeps the pick", () => {
    expect(clampPickTime(3, undefined)).toBe(3);
    expect(clampPickTime(3, 0)).toBe(3);
  });
});

describe("cutPicture", () => {
  const writes = (bytes) => async (_video, out) => { fs.writeFileSync(out, bytes); };

  test("names the picture by clip id and a stamp, in the clips folder", async () => {
    const clipsDir = path.join(dir, "clips");
    const calls = [];
    const cut = async (video, out, time) => { calls.push({ video, out, time }); fs.writeFileSync(out, "jpg"); };
    const out = await cutPicture({ videoPath: "v.mp4", clipsDir, clipId: "clip_1", time: 2, cut, now: () => 111 });
    expect(out).toBe(path.join(clipsDir, "clip_1_111_renderthumb.jpg"));
    expect(calls).toEqual([{ video: "v.mp4", out, time: 2 }]);
    expect(fs.existsSync(out)).toBe(true);
  });

  test("an empty or missing file is a failure, and nothing is left behind", async () => {
    await expect(cutPicture({ videoPath: "v", clipsDir: dir, clipId: "c", time: 9, cut: writes(""), now: () => 1 }))
      .rejects.toThrow("no frame was written");
    await expect(cutPicture({ videoPath: "v", clipsDir: dir, clipId: "c", time: 9, cut: async () => {}, now: () => 2 }))
      .rejects.toThrow("no frame was written");
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  test("a failing cut is a failure", async () => {
    const cut = async () => { throw new Error("ffmpeg died"); };
    await expect(cutPicture({ videoPath: "v", clipsDir: dir, clipId: "c", time: 0, cut })).rejects.toThrow("ffmpeg died");
  });
});

describe("retirePicture", () => {
  const make = (name) => { const p = path.join(dir, name); fs.writeFileSync(p, "x"); return p; };
  const project = (...paths) => ({ clips: paths.map((p, i) => ({ id: `c${i}`, thumbnailPath: p })) });

  test("deletes our own superseded picture", () => {
    const old = make("clip_1_100_renderthumb.jpg");
    const neu = make("clip_1_200_renderthumb.jpg");
    expect(retirePicture(old, { newPath: neu, clipsDir: dir, project: project(neu) })).toBe(true);
    expect(fs.existsSync(old)).toBe(false);
  });

  test("keeps a picture another clip still uses (a duplicate shares its parent's)", () => {
    const old = make("clip_1_100_renderthumb.jpg");
    const neu = make("clip_1_200_renderthumb.jpg");
    expect(retirePicture(old, { newPath: neu, clipsDir: dir, project: project(neu, old) })).toBe(false);
    expect(fs.existsSync(old)).toBe(true);
  });

  test("keeps pictures it did not write", () => {
    const detection = make("clip_006_thumb.jpg");
    const repost = make("clip_1_100_renderthumb repost.jpg");
    const neu = make("clip_1_200_renderthumb.jpg");
    for (const p of [detection, repost]) {
      expect(retirePicture(p, { newPath: neu, clipsDir: dir, project: project(neu) })).toBe(false);
      expect(fs.existsSync(p)).toBe(true);
    }
  });

  test("keeps a picture outside the clip's folder", () => {
    const other = path.join(dir, "elsewhere");
    fs.mkdirSync(other);
    const old = path.join(other, "clip_1_100_renderthumb.jpg");
    fs.writeFileSync(old, "x");
    expect(retirePicture(old, { newPath: "n", clipsDir: dir, project: project("n") })).toBe(false);
    expect(fs.existsSync(old)).toBe(true);
  });

  test("keeps the file when the saved project is unknown, or nothing changed", () => {
    const old = make("clip_1_100_renderthumb.jpg");
    expect(retirePicture(old, { newPath: "n", clipsDir: dir, project: null })).toBe(false);
    expect(retirePicture(old, { newPath: old, clipsDir: dir, project: project(old) })).toBe(false);
    expect(retirePicture(null, { newPath: "n", clipsDir: dir, project: project("n") })).toBe(false);
    expect(fs.existsSync(old)).toBe(true);
  });
});
