// #461: every repost is a row linked to the FIRST post, with both post times.
const initSqlJs = require("sql.js");

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

const repostLog = require("../repost-log");

const rows = () => {
  const r = mockDb.exec("SELECT * FROM reposts ORDER BY repost_clip_id");
  return r.length ? r[0].values.map((v) => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : [];
};

beforeAll(async () => {
  const SQL = await initSqlJs();
  mockDb = new SQL.Database();
  mockDb.run(`CREATE TABLE reposts (
    repost_clip_id TEXT PRIMARY KEY, original_clip_id TEXT NOT NULL, parent_clip_id TEXT NOT NULL,
    project_id TEXT, title TEXT, game TEXT, created_at TEXT, original_posted_at TEXT, posted_at TEXT)`);
  mockDb.run(`CREATE TABLE maintenance_runs (name TEXT PRIMARY KEY, ran_at TEXT NOT NULL DEFAULT (datetime('now')), note TEXT)`);
});
beforeEach(() => {
  mockDb.run("DELETE FROM reposts");
  mockDb.run("DELETE FROM maintenance_runs");
});

const orig = { id: "o1", title: "BRO", gameTag: "MC" };
const tracked = [{ clipId: "o1", date: "2026-09-18", time: "4:30 PM" }];

test("a tracker slot reads as local wall clock", () => {
  expect(repostLog.trackerStamp({ date: "2026-09-22", time: "12:05 AM" })).toBe("2026-09-22 00:05");
  expect(repostLog.trackerStamp({ date: "2026-09-22", time: "12:30 PM" })).toBe("2026-09-22 12:30");
  expect(repostLog.trackerStamp({ date: "2026-09-22", time: "9:30 PM" })).toBe("2026-09-22 21:30");
});

test("a repost is recorded with the original's post time", () => {
  const r1 = { id: "r1", repostOf: "o1", title: "BRO", gameTag: "MC", createdAt: "2026-09-20T15:00:00.000Z" };
  repostLog.recordRepost(r1, { projectId: "p1", clips: [orig, r1], trackerRows: tracked });
  const [row] = rows();
  expect(row).toMatchObject({ repost_clip_id: "r1", original_clip_id: "o1", parent_clip_id: "o1", project_id: "p1", game: "mc", original_posted_at: "2026-09-18 16:30", posted_at: null });
  expect(row.created_at).toMatch(/^2026-09-20 \d\d:00$/);
});

test("a repost of a repost points at the first post", () => {
  const r1 = { id: "r1", repostOf: "o1" };
  const r2 = { id: "r2", repostOf: "r1" };
  repostLog.recordRepost(r2, { projectId: "p1", clips: [orig, r1, r2], trackerRows: tracked });
  expect(rows()[0]).toMatchObject({ repost_clip_id: "r2", original_clip_id: "o1", parent_clip_id: "r1", original_posted_at: "2026-09-18 16:30" });
});

test("going out stamps posted_at once", () => {
  repostLog.recordRepost({ id: "r1", repostOf: "o1" }, { clips: [orig], trackerRows: tracked });
  repostLog.markPosted({ clipId: "r1", repostOf: "o1", date: "2026-09-22", time: "4:30 PM" });
  repostLog.markPosted({ clipId: "r1", repostOf: "o1", date: "2026-09-23", time: "1:00 PM" });
  expect(rows()[0].posted_at).toBe("2026-09-22 16:30");
});

test("an original going out is not a repost and writes nothing", () => {
  repostLog.markPosted({ clipId: "o1", date: "2026-09-18", time: "4:30 PM" });
  expect(rows()).toHaveLength(0);
});

test("the backfill covers existing reposts and deleted-but-posted ones, once", () => {
  const projects = [{ id: "p1", clips: [orig, { id: "r1", repostOf: "o1", createdAt: "2026-09-20T15:00:00.000Z" }, { id: "r2", repostOf: "o1" }] }];
  const trackerRows = [...tracked,
    { clipId: "r1", repostOf: "o1", date: "2026-09-22", time: "4:30 PM" },
    { clipId: "gone", repostOf: "o1", title: "BRO", game: "mc", date: "2026-09-10", time: "1:30 PM" }];
  expect(repostLog.backfillOnce(() => projects, trackerRows)).toEqual({ ran: true, count: 3 });
  const byId = Object.fromEntries(rows().map((r) => [r.repost_clip_id, r]));
  expect(byId.r1).toMatchObject({ original_clip_id: "o1", project_id: "p1", posted_at: "2026-09-22 16:30", original_posted_at: "2026-09-18 16:30" });
  expect(byId.r2).toMatchObject({ posted_at: null });
  expect(byId.gone).toMatchObject({ original_clip_id: "o1", project_id: null, created_at: null, posted_at: "2026-09-10 13:30" });
  expect(repostLog.backfillOnce(() => projects, trackerRows)).toEqual({ ran: false });
});
