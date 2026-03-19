const path = require("path");
const fs = require("fs");

let initSqlJs;
try {
  initSqlJs = require("sql.js");
} catch (e) {
  initSqlJs = null;
}

const DB_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DB_DIR, "feedback.db");

let db = null;
let SQL = null;

/**
 * Initialize the feedback database. Creates the table if it doesn't exist.
 */
async function init() {
  if (!initSqlJs) {
    console.warn("[feedback] sql.js not available — feedback logging disabled");
    return;
  }
  if (db) return; // already initialized

  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  SQL = await initSqlJs();

  // Load existing DB or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      game_tag TEXT NOT NULL,
      clip_start TEXT,
      clip_end TEXT,
      title TEXT,
      transcript_segment TEXT,
      peak_energy REAL,
      has_frame INTEGER DEFAULT 0,
      claude_reason TEXT,
      peak_quote TEXT,
      energy_level TEXT,
      confidence REAL,
      decision TEXT NOT NULL,
      user_note TEXT,
      timestamp INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_feedback_game_decision
    ON feedback (game_tag, decision, timestamp DESC)
  `);

  _save();
}

/** Persist database to disk */
function _save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/** Convert sql.js result to array of row objects */
function _toRows(result) {
  if (!result || result.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map((row) => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

/**
 * Log a feedback decision (approve or reject).
 */
function logFeedback(entry) {
  if (!db) return { error: "Feedback database not initialized" };

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

  _save();
  return { success: true };
}

/**
 * Get the last N approved clips for a game tag (for few-shot injection).
 */
function getApprovedClips(gameTag, limit = 20) {
  if (!db) return [];

  const result = db.exec(
    `SELECT * FROM feedback WHERE game_tag = ? AND decision = 'approved' ORDER BY timestamp DESC LIMIT ?`,
    [gameTag, limit]
  );

  return _toRows(result);
}

/**
 * Get the last N rejected clips for a game tag.
 */
function getRejectedClips(gameTag, limit = 20) {
  if (!db) return [];

  const result = db.exec(
    `SELECT * FROM feedback WHERE game_tag = ? AND decision = 'rejected' ORDER BY timestamp DESC LIMIT ?`,
    [gameTag, limit]
  );

  return _toRows(result);
}

/**
 * Get total feedback counts for a game.
 */
function getFeedbackCounts(gameTag) {
  if (!db) return { approved: 0, rejected: 0, total: 0 };

  const result = db.exec(
    `SELECT decision, COUNT(*) as count FROM feedback WHERE game_tag = ? GROUP BY decision`,
    [gameTag]
  );

  const rows = _toRows(result);
  const counts = { approved: 0, rejected: 0, total: 0 };
  for (const row of rows) {
    counts[row.decision] = row.count;
    counts.total += row.count;
  }
  return counts;
}

/**
 * Close the database connection.
 */
function close() {
  if (db) {
    _save();
    db.close();
    db = null;
  }
}

module.exports = {
  init,
  logFeedback,
  getApprovedClips,
  getRejectedClips,
  getFeedbackCounts,
  close,
  DB_PATH,
};
