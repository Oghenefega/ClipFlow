// #476: tags with a hyphen ("GTA6-R", "RL-R") must parse back out of a renamed
// filename, and a raw OBS name must never read as a renamed one.
jest.mock("electron-log/main", () => {
  const quiet = { info() {}, debug() {}, warn() {}, error() {} };
  return { scope: () => quiet };
});
jest.mock("../database", () => ({}));

const { parseRenamedFilename } = require("../reconcile");
const { RENAMED_FILE_PATTERN } = require("../file-migration");

describe("parseRenamedFilename", () => {
  test("hyphenated content tag", () => {
    expect(parseRenamedFilename("2026-08-27 GTA6-R Day1 Pt1.mp4")).toMatchObject({
      date: "2026-08-27", tag: "GTA6-R", dayNumber: 1, partNumber: 1, subPart: null,
    });
  });

  test("hyphenated tag on a split child", () => {
    expect(parseRenamedFilename("2026-09-29 RL-R Day1 Pt2a.mp4")).toMatchObject({
      tag: "RL-R", dayNumber: 1, partNumber: 2, subPart: "a",
    });
  });

  test("plain and digit-led tags still parse", () => {
    expect(parseRenamedFilename("2026-03-02 RL Day6 Pt1.mp4")).toMatchObject({ tag: "RL", dayNumber: 6 });
    expect(parseRenamedFilename("2026-09-06 100T Day4 Pt10.mkv")).toMatchObject({ tag: "100T", partNumber: 10 });
    expect(parseRenamedFilename("RL-R 2026-03-04 Day7 Pt1.mp4")).toMatchObject({ tag: "RL-R", date: "2026-03-04" });
  });

  test("raw OBS names are not renamed files", () => {
    expect(parseRenamedFilename("2026-03-03 18-23-40.mp4")).toBeNull();
    expect(parseRenamedFilename("2026-03-03 18-23-40-vertical.mp4")).toBeNull();
    expect(parseRenamedFilename("2026-03-03_18-23-40.mp4")).toBeNull();
  });

  test("tags longer than 8 are not read", () => {
    expect(parseRenamedFilename("2026-03-03 TOOLONGTAG Day1 Pt1.mp4")).toBeNull();
  });
});

describe("file-migration RENAMED_FILE_PATTERN", () => {
  test("hyphenated tag", () => {
    const m = "2026-08-27 GTA6-R Day1 Pt1.mp4".match(RENAMED_FILE_PATTERN);
    expect(m && m[2]).toBe("GTA6-R");
  });

  test("raw OBS name does not match", () => {
    expect("2026-03-03 18-23-40.mp4".match(RENAMED_FILE_PATTERN)).toBeNull();
  });
});
