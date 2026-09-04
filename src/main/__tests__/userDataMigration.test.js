// #288: the ClipFlow → Corva userData rename (#268) must land even when Electron
// or a headless harness has already created an empty-of-data %APPDATA%\Corva —
// and must still refuse when that folder holds anything that looks like data.
// Real directories under the OS temp dir, so the rename semantics are the real ones.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { migrateUserData } = require("../user-data-migration");

function scratch() {
  const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "corva-migrate-"));
  return { appDataDir, oldDir: path.join(appDataDir, "clipflow"), newUserData: path.join(appDataDir, "Corva") };
}

function seedLegacy(oldDir) {
  fs.mkdirSync(path.join(oldDir, "data"), { recursive: true });
  fs.writeFileSync(path.join(oldDir, "clipflow-settings.json"), "{}");
  fs.writeFileSync(path.join(oldDir, "data", "clipflow.db"), "db");
}

function seedStrayShell(newUserData) {
  fs.mkdirSync(path.join(newUserData, "logs"), { recursive: true });
  fs.mkdirSync(path.join(newUserData, "GPUCache"), { recursive: true });
  fs.writeFileSync(path.join(newUserData, "logs", "main.log"), "harness");
  fs.writeFileSync(path.join(newUserData, "Preferences"), "{}");
}

const run = (s, fsImpl) => migrateUserData({ appDataDir: s.appDataDir, newUserData: s.newUserData, ...(fsImpl ? { fsImpl } : {}) });
const settingsIn = (dir) => fs.existsSync(path.join(dir, "clipflow-settings.json"));

describe("migrateUserData", () => {
  const made = [];
  afterEach(() => {
    for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });
  const make = () => { const s = scratch(); made.push(s.appDataDir); return s; };

  test("no legacy folder -> noop", () => {
    const s = make();
    expect(run(s)).toEqual({ outcome: "noop", oldDir: s.oldDir });
  });

  test("legacy folder and no Corva dir -> migrated, the whole tree moves", () => {
    const s = make();
    seedLegacy(s.oldDir);
    const r = run(s);
    expect(r.outcome).toBe("migrated");
    expect(r.parked).toBeUndefined();
    expect(settingsIn(s.newUserData)).toBe(true);
    expect(fs.existsSync(path.join(s.newUserData, "data", "clipflow.db"))).toBe(true);
    expect(fs.existsSync(s.oldDir)).toBe(false);
  });

  test("a Corva dir holding only Chromium scaffolding and logs is parked, then the rename lands", () => {
    const s = make();
    seedLegacy(s.oldDir);
    seedStrayShell(s.newUserData);
    const r = run(s);
    expect(r.outcome).toBe("migrated");
    expect(r.parked).toMatch(/Corva\.stray-/);
    // Parked, not deleted: the harness log is still there to read.
    expect(fs.existsSync(path.join(r.parked, "logs", "main.log"))).toBe(true);
    expect(settingsIn(s.newUserData)).toBe(true);
    expect(fs.existsSync(path.join(s.newUserData, "Preferences"))).toBe(false);
    expect(fs.existsSync(s.oldDir)).toBe(false);
  });

  test("a Corva dir with its own settings store -> noop, nothing moves", () => {
    const s = make();
    seedLegacy(s.oldDir);
    fs.mkdirSync(s.newUserData, { recursive: true });
    fs.writeFileSync(path.join(s.newUserData, "clipflow-settings.json"), "{\"newer\":true}");
    expect(run(s)).toEqual({ outcome: "noop", oldDir: s.oldDir });
    expect(settingsIn(s.oldDir)).toBe(true);
    expect(fs.readFileSync(path.join(s.newUserData, "clipflow-settings.json"), "utf8")).toBe("{\"newer\":true}");
  });

  test.each([
    ["clipflow-tokens.json", "file"],
    ["clipflow-settings.backup-2026-08-06.json", "file"],
    ["data", "dir"],
    ["runtime", "dir"],
  ])("a Corva dir with %s but no settings store -> use-old, nothing moves", (name, kind) => {
    const s = make();
    seedLegacy(s.oldDir);
    seedStrayShell(s.newUserData);
    if (kind === "dir") fs.mkdirSync(path.join(s.newUserData, name));
    else fs.writeFileSync(path.join(s.newUserData, name), "x");
    const r = run(s);
    expect(r.outcome).toBe("use-old");
    expect(r.reason).toMatch(/unrecognised data/);
    expect(r.parked).toBeUndefined();
    expect(settingsIn(s.oldDir)).toBe(true);
    expect(fs.existsSync(path.join(s.newUserData, name))).toBe(true);
  });

  test("rename failure after parking -> use-old with the error, old data untouched", () => {
    const s = make();
    seedLegacy(s.oldDir);
    seedStrayShell(s.newUserData);
    const fsImpl = {
      ...fs,
      renameSync: (from, to) => {
        if (from === s.oldDir) throw new Error("EBUSY: locked");
        return fs.renameSync(from, to);
      },
    };
    const r = run(s, fsImpl);
    expect(r.outcome).toBe("use-old");
    expect(r.error.message).toMatch(/EBUSY/);
    expect(r.parked).toMatch(/Corva\.stray-/);
    expect(settingsIn(s.oldDir)).toBe(true);
    expect(fs.existsSync(s.newUserData)).toBe(false);
  });
});
