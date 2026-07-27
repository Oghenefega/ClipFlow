const database = require("./database");

/**
 * Log a feedback decision (approve or reject).
 */
function logFeedback(entry) {
  const db = database.getDb();
  if (!db) return { error: "Database not initialized" };

  db.run(
    `INSERT INTO feedback (video_id, game_tag, clip_start, clip_end, title, transcript_segment, peak_energy, has_frame, claude_reason, peak_quote, energy_level, confidence, decision, user_note, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.videoId || "",
      entry.gameTag || "",
      entry.clipStart || "",
      entry.clipEnd || "",
      entry.title || "",
      entry.transcriptSegment || "",
      entry.peakEnergy || 0,
      entry.hasFrame ? 1 : 0,
      entry.claudeReason || "",
      entry.peakQuote || "",
      entry.energyLevel || "",
      entry.confidence || 0,
      entry.decision,
      entry.userNote || "",
      Math.floor(Date.now() / 1000),
    ]
  );

  database.save();
  return { success: true };
}

/**
 * Attach or replace rejection reasons + note on the latest rejected row for a
 * clip (#198). The row is matched by identity (video, cut window) rather than a
 * stored id so chips also work on clips rejected in earlier sessions. Reasons
 * arrive as an array of keys and are stored as CSV.
 */
function updateReasons({ videoId, clipStart, clipEnd, reasons, userNote }) {
  const db = database.getDb();
  if (!db) return { error: "Database not initialized" };

  const csv = Array.isArray(reasons) ? reasons.join(",") : String(reasons || "");
  db.run(
    `UPDATE feedback SET reject_reasons = ?, user_note = ?
      WHERE id = (SELECT id FROM feedback
                   WHERE video_id = ? AND clip_start = ? AND clip_end = ? AND decision = 'rejected'
                   ORDER BY timestamp DESC, id DESC LIMIT 1)`,
    [csv, userNote || "", videoId || "", clipStart || "", clipEnd || ""]
  );

  database.save();
  return { success: true };
}

/**
 * Get the last N approved clips for a game tag (for few-shot injection).
 */
function getApprovedClips(gameTag, limit = 20) {
  const db = database.getDb();
  if (!db) return [];

  const result = db.exec(
    `SELECT * FROM feedback WHERE game_tag = ? AND decision = 'approved' ORDER BY timestamp DESC LIMIT ?`,
    [gameTag, limit]
  );

  return database.toRows(result);
}

/**
 * Get the last N rejected clips for a game tag.
 */
function getRejectedClips(gameTag, limit = 20) {
  const db = database.getDb();
  if (!db) return [];

  const result = db.exec(
    `SELECT * FROM feedback WHERE game_tag = ? AND decision = 'rejected' ORDER BY timestamp DESC LIMIT ?`,
    [gameTag, limit]
  );

  return database.toRows(result);
}

/**
 * Get total feedback counts for a game.
 */
function getFeedbackCounts(gameTag) {
  const db = database.getDb();
  if (!db) return { approved: 0, rejected: 0, total: 0 };

  const result = db.exec(
    `SELECT decision, COUNT(*) as count FROM feedback WHERE game_tag = ? GROUP BY decision`,
    [gameTag]
  );

  const rows = database.toRows(result);
  const counts = { approved: 0, rejected: 0, total: 0 };
  for (const row of rows) {
    counts[row.decision] = row.count;
    counts.total += row.count;
  }
  return counts;
}

// ── Approval-rate stats (#194) ──
// Mirrors EXCLUDED_REJECT_REASONS in ai-prompt.js (#198): reasons that carry
// no taste verdict. A reject counts as "mechanical" for the quality rate only
// when ALL its reasons are on this list — a mixed row like "duplicate,not-funny"
// still contains a taste verdict and stays in the denominator.
const MECHANICAL_REJECT_REASONS = ["duplicate", "bad-cut", "wrong-content"];
// Quality rate = picks at or above this confidence (#200: below-the-bar fills
// are expected rejects and must not drag the headline number).
const QUALITY_CONFIDENCE = 0.7;

function isMechanicalOnlyReject(row) {
  if (row.decision !== "rejected") return false;
  const reasons = String(row.reject_reasons || "").split(",").map((s) => s.trim()).filter(Boolean);
  return reasons.length > 0 && reasons.every((r) => MECHANICAL_REJECT_REASONS.includes(r));
}

function computeRates(rows) {
  const overallApproved = rows.filter((r) => r.decision === "approved").length;
  const quality = rows.filter((r) => (r.confidence || 0) >= QUALITY_CONFIDENCE && !isMechanicalOnlyReject(r));
  const qualityApproved = quality.filter((r) => r.decision === "approved").length;
  return {
    overall: { approved: overallApproved, total: rows.length },
    quality: { approved: qualityApproved, total: quality.length },
  };
}

/**
 * Per-game approval rates (#194): quality (confidence >= 0.7, mechanical-only
 * rejects excluded) and overall, each all-time and over the last N projects
 * (distinct video_id by most recent feedback). Derived entirely from feedback.
 */
function getApprovalStats(rollingProjects = 10) {
  const db = database.getDb();
  if (!db) return { games: [] };

  const result = db.exec(
    `SELECT game_tag, video_id, decision, confidence, reject_reasons, timestamp
       FROM feedback WHERE decision IN ('approved', 'rejected')`
  );
  const rows = database.toRows(result);

  const byGame = new Map();
  for (const row of rows) {
    const tag = row.game_tag || "?";
    if (!byGame.has(tag)) byGame.set(tag, []);
    byGame.get(tag).push(row);
  }

  const games = [];
  for (const [tag, gameRows] of byGame) {
    const latestByVideo = new Map();
    for (const r of gameRows) {
      const prev = latestByVideo.get(r.video_id);
      if (prev === undefined || r.timestamp > prev) latestByVideo.set(r.video_id, r.timestamp);
    }
    const recentVideos = new Set(
      [...latestByVideo.entries()].sort((a, b) => b[1] - a[1]).slice(0, rollingProjects).map(([v]) => v)
    );
    games.push({
      gameTag: tag,
      projectCount: latestByVideo.size,
      allTime: computeRates(gameRows),
      rolling: computeRates(gameRows.filter((r) => recentVideos.has(r.video_id))),
      rollingProjectCount: recentVideos.size,
    });
  }

  games.sort((a, b) => b.allTime.overall.total - a.allTime.overall.total);
  return { games };
}

module.exports = {
  logFeedback,
  updateReasons,
  getApprovedClips,
  getRejectedClips,
  getFeedbackCounts,
  getApprovalStats,
};
