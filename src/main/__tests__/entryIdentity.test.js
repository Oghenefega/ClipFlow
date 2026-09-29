// #475: renaming / retagging / switching the type of a game or content type
// carries its history. Settings side (pure), disk + database side (real sql.js,
// real temp folders), refusals, and reconcile honouring old tags.
const fs = require("fs");
const os = require("os");
const path = require("path");
const initSqlJs = require("sql.js");

jest.mock("electron-log/main", () => {
  const quiet = { info() {}, debug() {}, warn() {}, error() {} };
  return { scope: () => quiet };
});
let mockDb = null;
jest.mock("../database", () => ({
  isReady: () => !!mockDb,
  getDb: () => mockDb,
  save: () => {},
  toRows: (result) => {
    if (!result || result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
  },
}));

const { rewriteSettingsForIdentity, rewriteEntry, mapTag } = require("../../shared/entryIdentity");
const entryIdentity = require("../entry-identity");
const reconcile = require("../reconcile");

const slug = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const all = (sql, p) => {
  const r = mockDb.exec(sql, p);
  return r.length ? r[0].values.map((v) => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : [];
};

beforeAll(async () => {
  const SQL = await initSqlJs();
  mockDb = new SQL.Database();
  mockDb.run(`CREATE TABLE file_metadata (id TEXT PRIMARY KEY, original_filename TEXT, current_filename TEXT, original_path TEXT,
    current_path TEXT, tag TEXT, entry_type TEXT, date TEXT, day_number INTEGER, part_number INTEGER, sub_part TEXT,
    custom_label TEXT, naming_preset TEXT, duration_seconds REAL, file_size_bytes INTEGER, status TEXT,
    has_pending_rename INTEGER DEFAULT 0, pending_rename_data TEXT, is_test INTEGER DEFAULT 0, updated_at TEXT)`);
  mockDb.run(`CREATE TABLE rename_history (id TEXT PRIMARY KEY, file_metadata_id TEXT, metadata_snapshot TEXT)`);
  mockDb.run(`CREATE TABLE feedback (id INTEGER PRIMARY KEY, video_id TEXT, game_tag TEXT)`);
  mockDb.run(`CREATE TABLE custom_labels (id TEXT PRIMARY KEY, tag TEXT NOT NULL, label TEXT NOT NULL, use_count INTEGER NOT NULL DEFAULT 1, UNIQUE(tag, label))`);
  mockDb.run(`CREATE TABLE reposts (repost_clip_id TEXT PRIMARY KEY, game TEXT)`);
  mockDb.run(`CREATE TABLE title_caption_rounds (id INTEGER PRIMARY KEY, clip_id TEXT, game TEXT)`);
});

function seedDb() {
  for (const t of ["file_metadata", "rename_history", "feedback", "custom_labels", "reposts", "title_caption_rounds"]) mockDb.run(`DELETE FROM ${t}`);
  mockDb.run(`INSERT INTO file_metadata (id, current_filename, current_path, tag, entry_type, date, day_number, part_number, status, pending_rename_data)
    VALUES ('f1','2026-09-01 Val Day1 Pt1.mp4','x','Val','game','2026-09-01',1,1,'done','{"partNumber":2}'),
           ('f2','2026-09-02 Val Day2 Pt1.mp4','x','Val','game','2026-09-02',2,1,'done',NULL),
           ('f3','2026-09-02 RL Day9 Pt1.mp4','x','RL','game','2026-09-02',9,1,'done',NULL)`);
  mockDb.run(`INSERT INTO rename_history VALUES ('h1','f1','{"tag":"Val","entry_type":"game","day_number":1}')`);
  mockDb.run(`INSERT INTO feedback (video_id, game_tag) VALUES ('2026-09-01 Val Day1 Pt1','Val'),('2026-09-01 Val Day1 Pt1','Val'),('x','RL')`);
  mockDb.run(`INSERT INTO custom_labels VALUES ('l1','Val','ranked',3),('l2','Val','clutch',1),('l3','VAL','ranked',2)`);
  mockDb.run(`INSERT INTO reposts VALUES ('r1','val'),('r2','rl')`);
  mockDb.run(`INSERT INTO title_caption_rounds (clip_id, game) VALUES ('c1','val'),('c2','Valorant'),('c3','rl')`);
}

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "corva-identity-"));
  const lib = path.join(root, "lib");
  const projDir = path.join(lib, ".clipflow", "projects", "proj_1");
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(path.join(projDir, "project.json"), JSON.stringify({
    id: "proj_1", name: "2026-09-01 Val Day1 Pt1", game: "Valorant", gameTag: "Val",
    clips: [{ id: "a", gameTag: "Val", gameName: "Valorant" }, { id: "b", gameTag: "val" }, { id: "c", gameTag: "RL", gameName: "Rocket League" }],
  }));
  fs.mkdirSync(path.join(lib, ".clipflow", "assets"), { recursive: true });
  fs.writeFileSync(path.join(lib, ".clipflow", "assets", "assets.json"), JSON.stringify({ assets: [{ id: "s1", gameTag: "Val" }, { id: "s2", gameTag: "universal" }] }));
  const dataDir = path.join(root, "data");
  const artDir = path.join(dataDir, "game-art");
  fs.mkdirSync(artDir, { recursive: true });
  fs.writeFileSync(path.join(artDir, "valorant.jpg"), "art");
  const profilesPath = path.join(dataDir, "game_profiles.json");
  fs.writeFileSync(profilesPath, JSON.stringify({ Val: { gameTag: "Val", gameName: "Valorant", playStyle: "aggro", updateThreshold: 7 } }));
  const dbPath = path.join(dataDir, "clipflow.db");
  fs.writeFileSync(dbPath, "db");
  const settingsPath = path.join(root, "clipflow-settings.json");
  fs.writeFileSync(settingsPath, "{}");
  return {
    root, lib, projDir, artDir, profilesPath,
    ctx: { db: mockDb, saveDb: () => {}, dbPath, settingsPath, profilesPath, artDir, slug, libraryRoot: lib, backupDir: path.join(dataDir, "backup-test") },
  };
}

const RETAG = { oldName: "Valorant", newName: "Valorant", oldTag: "Val", newTag: "VAL", oldType: "game", newType: "game" };

describe("settings rewrite (shared)", () => {
  const slices = () => ({
    gamesDb: [
      { name: "Valorant", tag: "Val", entryType: "game", dayCount: 7, lastDayDate: "2026-09-20", previousTags: [] },
      { name: "100T Valorant Reacts", tag: "100T", entryType: "content", reactsTo: "Val" },
      { name: "Rocket League", tag: "RL" },
    ],
    ytDescriptions: { Valorant: { desc: "v" }, "Rocket League": { desc: "r" } },
    mainGame: "Valorant",
    mainPool: ["Valorant", "Rocket League"],
    trackerData: [{ game: "val", mainGameAtTime: "Valorant" }, { game: "rl", mainGameAtTime: "Valorant" }, { game: "valorant" }],
    weekMeta: { "2026-09-14": { nowPlaying: "Valorant" }, "2026-09-21": { nowPlaying: "Rocket League" } },
    mediaFolders: [{ path: "a", gameTag: "Val" }, { path: "b", gameTag: "RL" }],
    renameHistory: [{ game: "Valorant", tag: "Val" }],
    pendingRenames: [{ id: 1, game: "Valorant", tag: "Val", color: "#f00" }],
    mainGameHistory: [{ date: "2026-09-01", from: "Rocket League", to: "Valorant" }],
  });

  test("a case-only tag change moves every tag slice and remembers the old tag", () => {
    const out = rewriteSettingsForIdentity(slices(), RETAG, { color: "#123" });
    const val = out.gamesDb.find((g) => g.name === "Valorant");
    // Filename lookups are case-insensitive, so a case-only change needs no old tag.
    expect(val).toMatchObject({ tag: "VAL", previousTags: [], dayCount: 7, lastDayDate: "2026-09-20", color: "#123" });
    expect(out.gamesDb[1].reactsTo).toBe("VAL");
    expect(out.trackerData.map((r) => r.game)).toEqual(["val", "rl", "valorant"]); // lowercased rows stay lowercased
    expect(out.mediaFolders[0].gameTag).toBe("VAL");
    expect(out.renameHistory[0].tag).toBe("VAL");
    expect(out.pendingRenames[0].tag).toBe("VAL");
  });

  test("a rename moves every name-keyed slice", () => {
    const change = { ...RETAG, newTag: "Val", newName: "Valorant PC" };
    const out = rewriteSettingsForIdentity(slices(), change, {});
    expect(out.gamesDb[0].name).toBe("Valorant PC");
    expect(out.gamesDb[0].previousTags).toEqual([]);
    expect(Object.keys(out.ytDescriptions)).toEqual(["Valorant PC", "Rocket League"]);
    expect(out.mainGame).toBe("Valorant PC");
    expect(out.mainPool).toEqual(["Valorant PC", "Rocket League"]);
    expect(out.trackerData[0].mainGameAtTime).toBe("Valorant PC");
    expect(out.weekMeta["2026-09-14"].nowPlaying).toBe("Valorant PC");
    expect(out.weekMeta["2026-09-21"].nowPlaying).toBe("Rocket League");
    expect(out.renameHistory[0].game).toBe("Valorant PC");
    expect(out.pendingRenames[0].game).toBe("Valorant PC");
    expect(out.mainGameHistory[0]).toMatchObject({ from: "Rocket League", to: "Valorant PC" });
  });

  test("tagging back to an old tag doesn't list it twice", () => {
    const e = rewriteEntry({ name: "X", tag: "B", previousTags: ["A", "a"] }, { oldName: "X", newName: "X", oldTag: "B", newTag: "A" });
    expect(e.previousTags).toEqual(["B"]);
  });

  test("a type switch keeps the Day counter only when there are recordings", () => {
    const base = { name: "VCT", tag: "VCT", entryType: "game", dayCount: 1, lastDayDate: null };
    const sw = { oldName: "VCT", newName: "VCT", oldTag: "VCT", newTag: "VCT", oldType: "game", newType: "content" };
    expect(rewriteEntry(base, { ...sw, hasRecordings: false })).toMatchObject({ entryType: "content", dayCount: 0 });
    expect(rewriteEntry({ ...base, dayCount: 4, lastDayDate: "2026-09-01" }, { ...sw, hasRecordings: true }))
      .toMatchObject({ entryType: "content", dayCount: 4, lastDayDate: "2026-09-01" });
  });

  test("mapTag leaves other tags alone", () => {
    expect(mapTag("RL", "Val", "VAL")).toBe("RL");
    expect(mapTag(undefined, "Val", "VAL")).toBe(undefined);
  });
});

describe("disk and database move", () => {
  test("preview counts without writing, apply moves everything", () => {
    seedDb();
    const s = scratch();
    const change = { ...RETAG, newTag: "VALO", newName: "Valorant Main" };

    const p = entryIdentity.preview(s.ctx, change);
    expect(p.counts).toMatchObject({ recordings: 2, feedback: 2, labels: 2, reposts: 1, titleRounds: 2, projects: 1, clips: 2, assets: 1, profile: true, art: true });
    expect(all("SELECT count(*) AS n FROM file_metadata WHERE tag='Val'")[0].n).toBe(2); // untouched

    const r = entryIdentity.apply(s.ctx, change);
    expect(all("SELECT count(*) AS n FROM file_metadata WHERE tag='Val'")[0].n).toBe(0);
    expect(all("SELECT count(*) AS n FROM file_metadata WHERE tag='VALO'")[0].n).toBe(2);
    expect(all("SELECT count(*) AS n FROM file_metadata WHERE tag='RL'")[0].n).toBe(1);
    expect(JSON.parse(all("SELECT metadata_snapshot FROM rename_history WHERE id='h1'")[0].metadata_snapshot).tag).toBe("VALO");
    expect(all("SELECT game_tag FROM feedback ORDER BY id").map((x) => x.game_tag)).toEqual(["VALO", "VALO", "RL"]);
    expect(all("SELECT video_id FROM feedback WHERE id=1")[0].video_id).toBe("2026-09-01 Val Day1 Pt1"); // project name kept
    expect(all("SELECT tag, label, use_count FROM custom_labels ORDER BY label, tag")).toEqual([
      { tag: "VALO", label: "clutch", use_count: 1 },
      { tag: "VAL", label: "ranked", use_count: 2 }, // other entry's label, untouched
      { tag: "VALO", label: "ranked", use_count: 3 },
    ]);
    expect(all("SELECT game FROM reposts ORDER BY repost_clip_id").map((x) => x.game)).toEqual(["valo", "rl"]);
    expect(all("SELECT game FROM title_caption_rounds ORDER BY id").map((x) => x.game)).toEqual(["valo", "Valorant Main", "rl"]);

    const profiles = JSON.parse(fs.readFileSync(s.profilesPath, "utf8"));
    expect(Object.keys(profiles)).toEqual(["VALO"]);
    expect(profiles.VALO).toMatchObject({ gameTag: "VALO", gameName: "Valorant Main", playStyle: "aggro", updateThreshold: 7 });

    const proj = JSON.parse(fs.readFileSync(path.join(s.projDir, "project.json"), "utf8"));
    expect(proj).toMatchObject({ name: "2026-09-01 Val Day1 Pt1", game: "Valorant Main", gameTag: "VALO" });
    expect(proj.clips.map((c) => [c.gameTag, c.gameName])).toEqual([["VALO", "Valorant Main"], ["valo", undefined], ["RL", "Rocket League"]]);
    const assets = JSON.parse(fs.readFileSync(path.join(s.lib, ".clipflow", "assets", "assets.json"), "utf8")).assets;
    expect(assets.map((a) => a.gameTag)).toEqual(["VALO", "universal"]);

    expect(fs.existsSync(path.join(s.artDir, "valorant-main.jpg"))).toBe(true);
    expect(fs.existsSync(path.join(s.artDir, "valorant.jpg"))).toBe(false);
    for (const f of ["clipflow.db", "clipflow-settings.json", "game_profiles.json"]) {
      expect(fs.existsSync(path.join(s.ctx.backupDir, f))).toBe(true);
    }
    expect(r.moved).toMatchObject({ recordings: 2, feedback: 2, profile: true, art: true, projects: 1, assets: 1, problems: [] });
  });

  test("a file step that fails after the database moved is reported, and the rest still moves", () => {
    seedDb();
    const s = scratch();
    // A folder where the atomic write puts its temp file makes the project save throw.
    fs.mkdirSync(path.join(s.projDir, "project.json.tmp"));
    const r = entryIdentity.apply(s.ctx, { ...RETAG, newTag: "VALO", newName: "Valorant Main" });
    expect(r.moved.recordings).toBe(2);
    expect(r.moved.profile).toBe(true);
    expect(r.moved.art).toBe(true);
    expect(r.moved.projects).toBe(0);
    expect(r.moved.problems).toHaveLength(1);
    expect(r.moved.problems[0]).toMatch(/^project proj_1:/);
  });

  test("a type switch updates entry_type on the recordings and in snapshots", () => {
    seedDb();
    const s = scratch();
    entryIdentity.apply(s.ctx, { ...RETAG, newTag: "Val", newType: "content" });
    expect(all("SELECT DISTINCT entry_type FROM file_metadata WHERE tag='Val'")).toEqual([{ entry_type: "content" }]);
    expect(all("SELECT entry_type FROM file_metadata WHERE tag='RL'")[0].entry_type).toBe("game");
  });
});

describe("refusals", () => {
  const db = [{ name: "Valorant", tag: "Val" }, { name: "Rocket League", tag: "RL" }];
  test("name and tag clashes are case-insensitive", () => {
    expect(entryIdentity.refusal(db, { ...RETAG, newName: "rocket league" })).toMatch(/already called/);
    expect(entryIdentity.refusal(db, { ...RETAG, newTag: "rl" })).toMatch(/already uses the tag/);
    expect(entryIdentity.refusal(db, RETAG)).toBeNull(); // its own tag in another case is fine
  });
  test("an entry with clips generating is refused", () => {
    expect(entryIdentity.refusal(db, RETAG, ["val"])).toMatch(/being generated/);
  });
});

describe("reconcile", () => {
  test("a file named with an old tag is adopted under the entry's current tag", async () => {
    seedDb();
    mockDb.run("DELETE FROM file_metadata");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "corva-reconcile-"));
    fs.mkdirSync(path.join(root, "2026-03"));
    fs.writeFileSync(path.join(root, "2026-03", "2026-03-03 Val Day7 Pt1.mp4"), "");
    const store = { get: (k) => ({ gamesDb: [{ name: "Valorant", tag: "VALO", entryType: "game", previousTags: ["Val"] }] }[k]), set() {} };
    const res = await reconcile.run({ store, roots: [root] });
    expect(res.adopted).toBe(1);
    expect(all("SELECT tag, day_number FROM file_metadata")).toEqual([{ tag: "VALO", day_number: 7 }]);
  });
});
