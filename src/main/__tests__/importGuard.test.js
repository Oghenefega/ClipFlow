// #472: a Recordings-tab import must never write over its own source or an
// existing file (the copy truncates its target before reading the source).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { importTargetProblem } = require("../import-guard");

function scratch() {
  const wf = fs.mkdtempSync(path.join(os.tmpdir(), "corva-import-"));
  fs.mkdirSync(path.join(wf, "2026-09"));
  return wf;
}

test("a recording already in the watch folder is refused (same path, any case)", () => {
  const wf = scratch();
  const src = path.join(wf, "2026-09", "2026-09-25 12-00-00.mp4");
  fs.writeFileSync(src, "x");
  expect(importTargetProblem(src, [src])).toMatch(/already in your recordings folder/);
  expect(importTargetProblem(src, [src.toUpperCase()])).toMatch(/already in your recordings folder/);
});

test("an existing file at the target is refused", () => {
  const wf = scratch();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "corva-src-"));
  const src = path.join(elsewhere, "2026-09-25 12-00-00.mp4");
  fs.writeFileSync(src, "new");
  const target = path.join(wf, "2026-09", "2026-09-25 12-00-00.mp4");
  fs.writeFileSync(target, "someone else's recording");
  expect(importTargetProblem(src, [target])).toMatch(/already in 2026-09\. Corva won't overwrite it/);
});

test("an MKV whose converted .mp4 would land on an existing file is refused", () => {
  const wf = scratch();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "corva-src-"));
  const src = path.join(elsewhere, "clip.mkv");
  fs.writeFileSync(src, "mkv");
  fs.writeFileSync(path.join(wf, "2026-09", "clip.mp4"), "existing mp4");
  const writes = [path.join(wf, "2026-09", "clip.mkv"), path.join(wf, "2026-09", "clip.mp4")];
  expect(importTargetProblem(src, writes)).toMatch(/"clip\.mp4" is already in 2026-09/);
});

test("a file from outside with a free target is allowed", () => {
  const wf = scratch();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "corva-src-"));
  const src = path.join(elsewhere, "2026-09-25 12-00-00.mp4");
  fs.writeFileSync(src, "x");
  expect(importTargetProblem(src, [path.join(wf, "2026-09", "2026-09-25 12-00-00.mp4")])).toBeNull();
});
