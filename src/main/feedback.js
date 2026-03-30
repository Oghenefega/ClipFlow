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

module.exports = {
  logFeedback,
  getApprovedClips,
  getRejectedClips,
  getFeedbackCounts,
};
