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

// ── #239: clip status transitions are the single source of feedback rows ────
// Every surface that can approve/reject a clip (Pending tab, editor Queue
// button, anything future) funnels through the project:updateClip IPC handler,
// which calls handleStatusTransition after the merge. Teaching happens there —
// no per-surface renderer writes, so no path can flip a decision silently.

// Matches the renderer's fmtHMS exactly — reject-reason chips (#198) and the
// replay harness (#233) match rows by these exact strings.
function fmtHMS(sec) {
  if (!sec || isNaN(sec)) return "00:00:00";
  const h = Math.floor(sec / 3600).toString().padStart(2, "0");
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

const isApprovedStatus = (s) => s === "approved" || s === "ready";
const isClearedStatus = (s) => !s || s === "none";

function decisionRowExists({ videoId, clipStart, clipEnd, decision }) {
  const db = database.getDb();
  if (!db) return false;
  const result = db.exec(
    `SELECT id FROM feedback WHERE video_id = ? AND clip_start = ? AND clip_end = ? AND decision = ? LIMIT 1`,
    [videoId, clipStart, clipEnd, decision]
  );
  return database.toRows(result).length > 0;
}

/**
 * Delete the latest row matching a clip's cut window + decision (mirror of
 * updateReasons' identity matching). Used when a decision is retracted.
 */
function deleteDecision({ videoId, clipStart, clipEnd, decision }) {
  const db = database.getDb();
  if (!db) return { error: "Database not initialized" };

  db.run(
    `DELETE FROM feedback
      WHERE id = (SELECT id FROM feedback
                   WHERE video_id = ? AND clip_start = ? AND clip_end = ? AND decision = ?
                   ORDER BY timestamp DESC, id DESC LIMIT 1)`,
    [videoId, clipStart, clipEnd, decision]
  );

  database.save();
  return { success: true };
}

function entryFromClip(project, clip, decision) {
  return {
    videoId: project?.name || "",
    // #197: learning follows the clip's content tag, not the session's
    gameTag: clip.gameTag || project?.gameTag || "",
    clipStart: fmtHMS(clip.startTime),
    clipEnd: fmtHMS(clip.endTime),
    title: clip.title || "",
    transcriptSegment: (clip.subtitles?.sub1 || []).map((s) => s.text).join(" ").substring(0, 500),
    peakEnergy: clip.confidence || clip.highlightScore / 100 || 0,
    hasFrame: !!clip.hasFrame,
    energyLevel: clip.energyLevel || "",
    confidence: clip.confidence || 0,
    decision,
    userNote: "",
  };
}

/**
 * React to a clip's status change with the right feedback writes (#239):
 * gaining approved/rejected teaches once (dedupe on the exact cut window, so
 * re-approving the same cut is a no-op while re-approving an edited cut records
 * a decision on the new window); clearing back to none untaught it; flipping
 * approve↔reject retracts the old row and writes the new one. "dequeued" and
 * other statuses are scheduling state, not taste — no feedback action.
 */
function handleStatusTransition(project, prevStatus, clip) {
  // #240 fence: imported (pre-ClipFlow) clips never enter taste calibration.
  if (clip.source === "import") return { skipped: "import" };
  const next = clip.status;
  if (prevStatus === next) return { skipped: "no-change" };
  const key = {
    videoId: project?.name || "",
    clipStart: fmtHMS(clip.startTime),
    clipEnd: fmtHMS(clip.endTime),
  };

  if (isApprovedStatus(next) && !isApprovedStatus(prevStatus)) {
    if (prevStatus === "rejected") deleteDecision({ ...key, decision: "rejected" });
    if (!decisionRowExists({ ...key, decision: "approved" })) {
      logFeedback(entryFromClip(project, clip, "approved"));
    }
    return { logged: "approved" };
  }
  if (next === "rejected" && prevStatus !== "rejected") {
    if (isApprovedStatus(prevStatus)) deleteDecision({ ...key, decision: "approved" });
    if (!decisionRowExists({ ...key, decision: "rejected" })) {
      logFeedback(entryFromClip(project, clip, "rejected"));
    }
    return { logged: "rejected" };
  }
  if (isClearedStatus(next) && isApprovedStatus(prevStatus)) {
    deleteDecision({ ...key, decision: "approved" });
    return { deleted: "approved" };
  }
  if (isClearedStatus(next) && prevStatus === "rejected") {
    deleteDecision({ ...key, decision: "rejected" });
    return { deleted: "rejected" };
  }
  return { skipped: "not-a-decision" };
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
const MECHANICAL_REJECT_REASONS = ["duplicate", "bad-cut", "wrong-content", "repetitive"];
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
  handleStatusTransition,
  updateReasons,
  getApprovedClips,
  getRejectedClips,
  getFeedbackCounts,
  getApprovalStats,
};
