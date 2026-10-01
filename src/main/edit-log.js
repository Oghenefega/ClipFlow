/**
 * #479: how much each AI clip gets edited before it publishes.
 *
 *   edit_sessions  one row per editor visit (editTracker.js in the renderer)
 *   edit_outcomes  one row per clip on its first publish: the finished clip
 *                  against the AI's draft (edit-outcome.js) plus its sessions
 *
 * The two numbers that say whether Corva is becoming the editor:
 *   SELECT COUNT(*) clips, AVG(active_ms) / 60000.0 edit_min, AVG(untouched) untouched_share
 *     FROM edit_outcomes WHERE published_at >= datetime('now', '-30 days');
 */

const database = require("./database");
const { computeEditOutcome } = require("./edit-outcome");
const log = require("electron-log/main").scope("edit-log");

function db() {
  return database.isReady() ? database.getDb() : null;
}

/** Logging must never fail the editor or a publish: every write swallows its error. */
function recordSession({ clipId, projectId, game, openedAt, closedAt, activeMs, editsTotal, edits } = {}) {
  const d = db();
  if (!d || !clipId || !openedAt || !closedAt) return false;
  try {
    d.run(
      `INSERT INTO edit_sessions (clip_id, project_id, game, opened_at, closed_at, active_ms, edits_total, edits)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clipId, projectId || null, game || null, openedAt, closedAt,
        Number.isFinite(activeMs) ? Math.round(activeMs) : 0,
        Number.isFinite(editsTotal) ? editsTotal : 0,
        edits ? JSON.stringify(edits) : null,
      ]
    );
    database.save();
    return true;
  } catch (err) {
    log.warn("recordSession failed", { clipId, error: err.message });
    return false;
  }
}

function sessionsFor(d, clipId) {
  const rows = database.toRows(d.exec(
    "SELECT active_ms, edits_total, edits FROM edit_sessions WHERE clip_id = ?", [clipId]
  ));
  return rows.map((r) => {
    let edits = {};
    try { edits = r.edits ? JSON.parse(r.edits) : {}; } catch (_) { /* a bad row counts as no kinds */ }
    return { activeMs: r.active_ms || 0, editsTotal: r.edits_total || 0, edits };
  });
}

/**
 * The clip just published for the first time. Written once per clip (a retry
 * or a later platform keeps the first row). Callers pass only clips that are
 * eligible to teach: no imports, no reposts.
 */
function recordOutcome(clip, { project, projectId, game } = {}) {
  const d = db();
  if (!d || !clip?.id) return false;
  try {
    const o = computeEditOutcome(clip, sessionsFor(d, clip.id), project);
    if (!o) return false;
    d.run(
      `INSERT OR IGNORE INTO edit_outcomes
         (clip_id, project_id, game, ai_seconds, kept_seconds, start_moved_s, end_moved_s, sections,
          subtitle_words_ai, subtitle_words_changed, layout_changed, sounds, overlays, levels_changed,
          sessions, active_ms, edits_total, edits, untouched)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clip.id, projectId || null, game || null, o.aiSeconds, o.keptSeconds, o.startMovedS, o.endMovedS,
        o.sections, o.subtitleWordsAi, o.subtitleWordsChanged, o.layoutChanged ? 1 : 0, o.sounds, o.overlays,
        o.levelsChanged ? 1 : 0, o.sessions, o.activeMs, o.editsTotal, JSON.stringify(o.edits), o.untouched ? 1 : 0,
      ]
    );
    database.save();
    return true;
  } catch (err) {
    log.warn("recordOutcome failed", { clipId: clip.id, error: err.message });
    return false;
  }
}

/** Settings → Diagnostics: the last `days` of first publishes. */
function summary(days = 30) {
  const d = db();
  if (!d) return { clips: 0 };
  try {
    const [r] = database.toRows(d.exec(
      `SELECT COUNT(*) clips, AVG(active_ms) avg_ms, SUM(untouched) untouched
         FROM edit_outcomes WHERE published_at >= datetime('now', ?)`,
      [`-${Math.max(1, Math.round(days))} days`]
    ));
    const clips = r?.clips || 0;
    return {
      clips,
      days,
      avgEditMinutes: clips ? Math.round((r.avg_ms / 60000) * 10) / 10 : null,
      untouchedPct: clips ? Math.round((r.untouched / clips) * 100) : null,
    };
  } catch (err) {
    log.warn("summary failed", { error: err.message });
    return { clips: 0 };
  }
}

module.exports = { recordSession, recordOutcome, summary };
