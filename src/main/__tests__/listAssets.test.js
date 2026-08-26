// #314: watched-folder membership is per-list, not merged. Each root is scanned
// only for its own list's kinds, so judging membership on a merged set let one
// list vouch for files the other list never scanned — they listed as permanent
// "file missing" ghosts. ffmpeg pulls in electron at require time (logger), so
// mock it — listAssets never probes; backfillDurations does.
jest.mock("../ffmpeg", () => ({}));

const fs = require("fs");
const os = require("os");
const path = require("path");
const { listAssets } = require("../assets");

let FIX;
const LIB = () => path.join(FIX, "Lib");
const OVERLAYS = () => path.join(FIX, "Lib", "Overlays");
const AUDIO_ONLY = () => path.join(FIX, "AudioOnly");
const MEDIA_ONLY = () => path.join(FIX, "MediaOnly");

const on = (p) => [{ path: p, enabled: true }];
const off = (p) => [{ path: p, enabled: false }];

/** Just the file names, sorted — what the panel would list. */
const names = (list) => list.map((a) => path.basename(a.path)).sort();

/** A fresh, empty index so each test starts from a cold library. */
function freshIndex() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "clipflow-assets-"));
}

beforeAll(() => {
  FIX = fs.mkdtempSync(path.join(os.tmpdir(), "clipflow-fixture-"));
  const files = [
    "Lib/beep.mp3", "Lib/theme.wav", "Lib/banner.png",
    "Lib/Overlays/shot.png", "Lib/Overlays/clip.mp4", "Lib/Overlays/voice.mp3",
    "AudioOnly/hit.wav", "AudioOnly/song.mp3",
    "MediaOnly/logo.png", "MediaOnly/loop.gif",
  ];
  for (const rel of files) {
    const full = path.join(FIX, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "x");
  }
});

afterAll(() => fs.rmSync(FIX, { recursive: true, force: true }));

describe("listAssets — overlapping watched lists (#314)", () => {
  test("removing the media root drops its files, even under a still-watched audio root", async () => {
    const idx = freshIndex();
    expect(names(await listAssets(idx, on(LIB()), on(OVERLAYS())))).toEqual(
      ["beep.mp3", "clip.mp4", "shot.png", "theme.wav", "voice.mp3"]
    );
    // No ghosts: the image/video entries leave outright, not as missing-flagged rows.
    expect(names(await listAssets(idx, on(LIB()), []))).toEqual(["beep.mp3", "theme.wav", "voice.mp3"]);
  });

  test("removing the audio root drops its files, even under a still-watched media root", async () => {
    const idx = freshIndex();
    await listAssets(idx, on(LIB()), on(LIB()));
    expect(names(await listAssets(idx, [], on(LIB())))).toEqual(["banner.png", "clip.mp4", "shot.png"]);
  });

  test("same root in both lists: toggling one Off hides only that list's kinds", async () => {
    const idx = freshIndex();
    const all = ["banner.png", "beep.mp3", "clip.mp4", "shot.png", "theme.wav", "voice.mp3"];
    expect(names(await listAssets(idx, on(LIB()), on(LIB())))).toEqual(all);

    expect(names(await listAssets(idx, off(LIB()), on(LIB())))).toEqual(["banner.png", "clip.mp4", "shot.png"]);
    expect(names(await listAssets(idx, on(LIB()), off(LIB())))).toEqual(["beep.mp3", "theme.wav", "voice.mp3"]);
    // A toggle is not a removal — everything comes back, index intact (#208).
    expect(names(await listAssets(idx, on(LIB()), on(LIB())))).toEqual(all);
  });

  test("nested roots: toggling the media root Off hides its files with no ghosts", async () => {
    const idx = freshIndex();
    await listAssets(idx, on(LIB()), on(OVERLAYS()));
    const listed = await listAssets(idx, on(LIB()), off(OVERLAYS()));
    expect(names(listed)).toEqual(["beep.mp3", "theme.wav", "voice.mp3"]);
    expect(listed.some((a) => a.missing)).toBe(false);
  });
});

describe("listAssets — disjoint watched lists behave as before", () => {
  test("each list absorbs only its own kinds; remove and toggle affect only that list", async () => {
    const idx = freshIndex();
    expect(names(await listAssets(idx, on(AUDIO_ONLY()), on(MEDIA_ONLY())))).toEqual(
      ["hit.wav", "logo.png", "loop.gif", "song.mp3"]
    );
    expect(names(await listAssets(idx, on(AUDIO_ONLY()), off(MEDIA_ONLY())))).toEqual(["hit.wav", "song.mp3"]);
    expect(names(await listAssets(idx, on(AUDIO_ONLY()), []))).toEqual(["hit.wav", "song.mp3"]);
  });

  test("an unreachable root flags its files OFFLINE and keeps them listed", async () => {
    const idx = freshIndex();
    const unplug = path.join(FIX, "Unplug");
    fs.mkdirSync(unplug, { recursive: true });
    for (const n of ["far.mp3", "far.png"]) fs.writeFileSync(path.join(unplug, n), "x");
    expect(names(await listAssets(idx, on(unplug), on(unplug)))).toEqual(["far.mp3", "far.png"]);

    fs.rmSync(unplug, { recursive: true, force: true }); // drive unplugged
    const listed = await listAssets(idx, on(unplug), on(unplug));
    expect(names(listed)).toEqual(["far.mp3", "far.png"]);
    expect(listed.every((a) => a.offline && !a.missing)).toBe(true);
  });
});
