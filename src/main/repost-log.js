/**
 * reposts — one row per repost (#461).
 *
 * A repost (#306) is a fresh clip carrying `repostOf` = the clip it was copied
 * from. That link lived only in the project file and the tracker row, so "did
 * reposting pay off" had nothing to join against. Each press now lands here with
 * the FIRST post's id (a repost of a repost still points at the original), and
 * the moment each one went out. Views live per clip in clip_metrics(_history),
 * so the comparison is one join (#462):
 *
 *   SELECT r.title, r.original_posted_at, r.posted_at,
 *          o.platform, o.views AS original_views, p.views AS repost_views
 *     FROM reposts r
 *     JOIN clip_metrics o ON o.clip_id = r.original_clip_id
 *     JOIN clip_metrics p ON p.clip_id = r.repost_clip_id AND p.platform = o.platform;
 *
 * Times are local wall clock, "YYYY-MM-DD HH:MM" — the tracker's own record of
 * when a post went out (its date + slot time), never a UTC day.
 */

const database = require("./database");
const log = require("electron-log/main").scope("repost-log");

const BACKFILL = "461-reposts-backfill";

function db() {
  return database.isReady() ? database.getDb() : null;
}

const pad = (n) => String(n).padStart(2, "0");

/** A Date as local "YYYY-MM-DD HH:MM", or null. */
function localStamp(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A tracker row's date + "4:30 PM" slot as local "YYYY-MM-DD HH:MM", or null. */
function trackerStamp(row) {
  if (!row?.date) return null;
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(row.time || "").trim());
  if (!m) return `${row.date} 00:00`;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return `${row.date} ${pad(h)}:${m[2]}`;
}

/**
 * The first post a repost descends from. `parentOf(id)` answers the repostOf of
 * a known clip (undefined when unknown); a chain stops at the first id with no
 * parent, or at the last one we can see.
 */
function originalOf(clipId, parentOf) {
  let id = clipId;
  const seen = new Set([id]);
  for (;;) {
    const up = parentOf(id);
    if (!up || seen.has(up)) return id;
    seen.add(up);
    id = up;
  }
}

/**
 * Build the row for one repost clip. `clips` are the clips we can see (for the
 * chain), `trackerRows` the posted history.
 */
function rowFor(repost, { projectId, clips = [], trackerRows = [] }) {
  const parentById = new Map(clips.map((c) => [c.id, c.repostOf || null]));
  for (const r of trackerRows) if (r?.clipId && r.repostOf && !parentById.has(r.clipId)) parentById.set(r.clipId, r.repostOf);
  const originalId = originalOf(repost.repostOf, (id) => parentById.get(id));
  const postedRow = (id) => trackerRows.find((r) => r?.clipId === id);
  return {
    repostClipId: repost.id,
    originalClipId: originalId,
    parentClipId: repost.repostOf,
    projectId: projectId || null,
    title: repost.title || null,
    game: (repost.gameTag || repost.game || "").toLowerCase() || null,
    createdAt: localStamp(new Date(repost.createdAt || Date.now())),
    originalPostedAt: trackerStamp(postedRow(originalId)),
    postedAt: trackerStamp(postedRow(repost.id)),
  };
}

function insert(d, r) {
  d.run(
    `INSERT OR IGNORE INTO reposts
       (repost_clip_id, original_clip_id, parent_clip_id, project_id, title, game, created_at, original_posted_at, posted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.repostClipId, r.originalClipId, r.parentClipId, r.projectId, r.title, r.game, r.createdAt, r.originalPostedAt, r.postedAt]
  );
}

/** Repost was pressed. Never throws — logging must not fail the repost. */
function recordRepost(repost, ctx) {
  const d = db();
  if (!d || !repost?.repostOf) return;
  try {
    insert(d, rowFor(repost, ctx));
    database.save();
  } catch (err) {
    log.warn("recordRepost failed", { clipId: repost.id, error: err.message });
  }
}

/** A tracker row was written. For a repost, stamp when it went out (first time only). */
function markPosted(row) {
  const d = db();
  if (!d || !row?.repostOf || !row.clipId) return;
  try {
    d.run("UPDATE reposts SET posted_at = ? WHERE repost_clip_id = ? AND posted_at IS NULL", [trackerStamp(row), row.clipId]);
    database.save();
  } catch (err) {
    log.warn("markPosted failed", { clipId: row.clipId, error: err.message });
  }
}

/**
 * Once per DATABASE (guard row in maintenance_runs, as #458): reposts made
 * before this table existed. From the project files (every repost that still
 * exists) plus tracker rows (posted reposts whose clip was deleted since).
 *
 * @param {() => Array} loadProjects - full projects with clips
 * @param {Array} trackerRows
 */
function backfillOnce(loadProjects, trackerRows = []) {
  const d = db();
  if (!d) return { ran: false };
  const done = database.toRows(d.exec("SELECT name FROM maintenance_runs WHERE name = ?", [BACKFILL])).length > 0;
  if (done) return { ran: false };

  const projects = loadProjects() || [];
  const allClips = projects.flatMap((p) => p.clips || []);
  const rows = new Map();
  for (const p of projects) {
    for (const c of p.clips || []) {
      if (c.repostOf) rows.set(c.id, rowFor(c, { projectId: p.id, clips: allClips, trackerRows }));
    }
  }
  for (const t of trackerRows) {
    if (!t?.repostOf || !t.clipId || rows.has(t.clipId)) continue;
    const r = rowFor({ id: t.clipId, repostOf: t.repostOf, title: t.title, game: t.game }, { clips: allClips, trackerRows });
    r.createdAt = null; // the press itself was never recorded
    rows.set(t.clipId, r);
  }
  for (const r of rows.values()) insert(d, r);
  d.run("INSERT INTO maintenance_runs (name, note) VALUES (?, ?)", [BACKFILL, `${rows.size} repost(s) recorded`]);
  database.save();
  return { ran: true, count: rows.size };
}

module.exports = { recordRepost, markPosted, backfillOnce, rowFor, trackerStamp };
