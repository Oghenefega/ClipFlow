// #458: an approved clip's taste row follows the clip. Approving in the
// Projects tab and THEN re-cutting in the editor used to leave the row
// teaching the AI's original cut forever.
const fs = require("fs");
const os = require("os");
const path = require("path");
const initSqlJs = require("sql.js");

let mockDb = null;
const mockSaves = { count: 0 };
const mockDbPath = path.join(os.tmpdir(), `feedback-refresh-${process.pid}.db`);
jest.mock("../database", () => ({
  getDb: () => mockDb,
  save: () => { mockSaves.count++; },
  toRows: (result) => {
    if (!result || result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
  },
  DB_PATH: mockDbPath,
}));

const feedback = require("../feedback");

const sub = (text, startSec, endSec) => ({ text, startSec, endSec, words: [] });
const clipAt = (extra) => ({
  id: "c1",
  startTime: 938, // 00:15:38
  endTime: 972, //   00:16:12
  status: "approved",
  title: "Clip 4",
  subtitles: { sub1: [sub("what the AI cut", 938, 940)], sub2: [] },
  ...extra,
});
const rows = () => {
  const r = mockDb.exec("SELECT decision, title, transcript_segment FROM feedback ORDER BY id");
  return r.length ? r[0].values.map(([decision, title, words]) => ({ decision, title, words })) : [];
};

beforeAll(async () => {
  const SQL = await initSqlJs();
  mockDb = new SQL.Database();
  mockDb.run(`CREATE TABLE feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT, video_id TEXT NOT NULL, game_tag TEXT NOT NULL,
    clip_start TEXT, clip_end TEXT, title TEXT, transcript_segment TEXT, peak_energy REAL,
    has_frame INTEGER DEFAULT 0, claude_reason TEXT, peak_quote TEXT, energy_level TEXT,
    confidence REAL, decision TEXT NOT NULL, user_note TEXT, timestamp INTEGER NOT NULL,
    reject_reasons TEXT)`);
  mockDb.run(`CREATE TABLE maintenance_runs (name TEXT PRIMARY KEY, ran_at TEXT NOT NULL DEFAULT (datetime('now')), note TEXT)`);
  fs.writeFileSync(mockDbPath, Buffer.from(mockDb.export()));
});
beforeEach(() => {
  mockDb.run("DELETE FROM feedback");
  mockDb.run("DELETE FROM maintenance_runs");
  mockSaves.count = 0;
});
afterAll(() => {
  for (const f of [mockDbPath, mockDbPath + ".bak-pre458"]) { try { fs.unlinkSync(f); } catch (_) {} }
});

const project = { name: "2026-09-18 MC Day3 Pt1", gameTag: "MC" };
const approve = (clip) => feedback.handleStatusTransition(project, "none", clip);

describe("refreshApproved — the row follows the saved clip", () => {
  test("approve first, then edit: the row takes the edited words and the real title", () => {
    approve(clipAt());
    expect(rows()).toEqual([{ decision: "approved", title: "Clip 4", words: "what the AI cut" }]);

    const edited = clipAt({ title: "HE WAS IN FRONT OF ME", subtitles: { sub1: [sub("what I actually kept", 930, 935)], _format: "source-absolute" } });
    expect(feedback.refreshApproved(project.name, edited)).toEqual({ refreshed: true });
    expect(rows()).toEqual([{ decision: "approved", title: "HE WAS IN FRONT OF ME", words: "what I actually kept" }]);
  });

  test("a save that changes nothing writes nothing", () => {
    approve(clipAt());
    mockSaves.count = 0;
    expect(feedback.refreshApproved(project.name, clipAt())).toEqual({ refreshed: false });
    expect(mockSaves.count).toBe(0);
  });

  test("empty subtitles never wipe the words (they mean 'no saved edits')", () => {
    approve(clipAt());
    feedback.refreshApproved(project.name, clipAt({ title: "New title", subtitles: { sub1: [], sub2: [] } }));
    expect(rows()[0]).toEqual({ decision: "approved", title: "New title", words: "what the AI cut" });
  });

  test("rejected rows are never touched, and a rejected clip refreshes nothing", () => {
    feedback.handleStatusTransition(project, "none", clipAt({ status: "rejected" }));
    const r = feedback.refreshApproved(project.name, clipAt({ status: "rejected", subtitles: { sub1: [sub("changed", 938, 939)] } }));
    expect(r).toEqual({ refreshed: false });
    expect(rows()).toEqual([{ decision: "rejected", title: "Clip 4", words: "what the AI cut" }]);
  });

  test("imports and silent-fallback windows stay fenced out", () => {
    for (const source of ["import", "silent-fallback"]) {
      mockDb.run(`INSERT INTO feedback (video_id, game_tag, clip_start, clip_end, title, transcript_segment, decision, timestamp)
        VALUES (?, 'MC', '00:15:38', '00:16:12', 'x', 'old', 'approved', 1)`, [project.name]);
      expect(feedback.refreshApproved(project.name, clipAt({ source }))).toEqual({ refreshed: false });
      expect(rows()[0].words).toBe("old");
      mockDb.run("DELETE FROM feedback");
    }
  });
});

describe("repairApprovedRowsOnce — the catch-up for rows written before this", () => {
  test("refreshes stale rows once, keeps a copy of the file, then never runs again", () => {
    approve(clipAt());
    const finished = clipAt({ title: "Posted title", subtitles: { sub1: [sub("the finished cut", 930, 934)] } });
    const load = jest.fn(() => [{ name: project.name, clips: [finished] }]);

    const first = feedback.repairApprovedRowsOnce(load);
    expect(first).toMatchObject({ ran: true, changed: 1, backup: mockDbPath + ".bak-pre458" });
    expect(fs.existsSync(mockDbPath + ".bak-pre458")).toBe(true);
    expect(rows()[0]).toEqual({ decision: "approved", title: "Posted title", words: "the finished cut" });

    expect(feedback.repairApprovedRowsOnce(load)).toEqual({ ran: false });
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("nothing stale: no copy is made, but the run is still recorded", () => {
    try { fs.unlinkSync(mockDbPath + ".bak-pre458"); } catch (_) {}
    approve(clipAt());
    const r = feedback.repairApprovedRowsOnce(() => [{ name: project.name, clips: [clipAt()] }]);
    expect(r).toEqual({ ran: true, changed: 0, backup: null });
    expect(fs.existsSync(mockDbPath + ".bak-pre458")).toBe(false);
    expect(feedback.repairApprovedRowsOnce(() => [])).toEqual({ ran: false });
  });
});
