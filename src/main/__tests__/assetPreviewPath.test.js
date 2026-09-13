// #409: a video overlay Chromium can't decode (ProRes 4444 out of DaVinci)
// played audio-only in the preview with no error event. getPreviewPath hands
// the preview a VP9-alpha stand-in for those files and null for the rest,
// cached on disk and memoised in-process so a thumbnail and an overlay asking
// together share one transcode.
const fs = require("fs");
const os = require("os");
const path = require("path");

const mockProbe = jest.fn();
jest.mock("../ffmpeg", () => ({ probe: (...a) => mockProbe(...a) }));

const mockExecFile = jest.fn();
jest.mock("child_process", () => ({ execFile: (...a) => mockExecFile(...a) }));

const { getPreviewPath } = require("../assets");

let root;
let file;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "clipflow-preview-"));
  file = path.join(root, `overlay-${Date.now()}-${Math.random()}.mov`);
  fs.writeFileSync(file, "not really a movie");
  mockProbe.mockReset();
  mockExecFile.mockReset();
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** ffmpeg stand-in: writes the .tmp the real one would, then reports success. */
function fakeFfmpegOk() {
  mockExecFile.mockImplementation((_bin, args, _opts, cb) => {
    fs.writeFileSync(args[args.length - 1], "webm bytes");
    cb(null);
  });
}

test("a codec Chromium decodes gets no stand-in and no transcode", async () => {
  mockProbe.mockResolvedValue({ videoCodec: "h264" });
  expect(await getPreviewPath(root, file)).toBeNull();
  expect(mockExecFile).not.toHaveBeenCalled();
});

test("ProRes is transcoded to a VP9-alpha webm under previews/ and the path returned", async () => {
  mockProbe.mockResolvedValue({ videoCodec: "prores" });
  fakeFfmpegOk();
  const out = await getPreviewPath(root, file);
  expect(out).toMatch(/[\\/]previews[\\/][0-9a-f]{16}\.webm$/);
  expect(fs.existsSync(out)).toBe(true);
  expect(fs.existsSync(`${out}.tmp`)).toBe(false);
  const args = mockExecFile.mock.calls[0][1];
  expect(args).toEqual(expect.arrayContaining(["libvpx-vp9", "yuva420p", "webm"]));
  expect(args[args.indexOf("-i") + 1]).toBe(file);
});

test("concurrent callers share one transcode and the cache serves a fresh process", async () => {
  mockProbe.mockResolvedValue({ videoCodec: "prores" });
  fakeFfmpegOk();
  const [a, b] = await Promise.all([getPreviewPath(root, file), getPreviewPath(root, file)]);
  expect(a).toBe(b);
  expect(mockExecFile).toHaveBeenCalledTimes(1);

  // Same file, same mtime/size, cold memo: the on-disk copy answers without ffprobe.
  let fresh;
  jest.isolateModules(() => { fresh = require("../assets"); });
  mockProbe.mockClear();
  expect(await fresh.getPreviewPath(root, file)).toBe(a);
  expect(mockProbe).not.toHaveBeenCalled();
});

test("a failed transcode resolves null and leaves no half-written file", async () => {
  mockProbe.mockResolvedValue({ videoCodec: "dnxhd" });
  mockExecFile.mockImplementation((_bin, args, _opts, cb) => {
    fs.writeFileSync(args[args.length - 1], "partial");
    cb(new Error("boom"));
  });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  expect(await getPreviewPath(root, file)).toBeNull();
  expect(fs.readdirSync(path.join(root, "previews"))).toEqual([]);
  warn.mockRestore();
});

test("a missing file resolves null without probing", async () => {
  expect(await getPreviewPath(root, path.join(root, "gone.mov"))).toBeNull();
  expect(mockProbe).not.toHaveBeenCalled();
});
