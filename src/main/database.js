const path = require("path");
const fs = require("fs");
const log = require("electron-log/main").scope("database");

let initSqlJs;
try {
  initSqlJs = require("sql.js");
} catch (e) {
  initSqlJs = null;
}

const DB_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DB_DIR, "clipflow.db");
const OLD_FEEDBACK_PATH = path.join(DB_DIR, "feedback.db");

let db = null;
let SQL = null;
let initialized = false;

// ── Schema Migrations ──
// Each migration runs once, tracked by the schema_version table.
// Add new migrations to the end of this array. Never reorder or remove entries.
const MIGRATIONS = [
  {
    version: 1,
    description: "Create feedback table",
    up(database) {
      database.run(`
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
      database.run(`
        CREATE INDEX IF NOT EXISTS idx_feedback_game_decision
        ON feedback (game_tag, decision, timestamp DESC)
      `);
    },
  },
  {
    version: 2,
    description: "Create file_metadata, custom_labels, rename_history tables",
    up(database) {
      database.run(`
        CREATE TABLE file_metadata (
          id                TEXT PRIMARY KEY,
          original_filename TEXT NOT NULL,
          current_filename  TEXT NOT NULL,
          original_path     TEXT NOT NULL,
          current_path      TEXT NOT NULL,
          tag               TEXT NOT NULL,
          entry_type        TEXT NOT NULL DEFAULT 'game',
          date              TEXT,
          day_number        INTEGER,
          part_number       INTEGER,
          custom_label      TEXT,
          naming_preset     TEXT NOT NULL,
          duration_seconds  REAL,
          file_size_bytes   INTEGER,
          status            TEXT NOT NULL DEFAULT 'renamed',
          has_pending_rename INTEGER NOT NULL DEFAULT 0,
          pending_rename_data TEXT,
          renamed_at        TEXT NOT NULL DEFAULT (datetime('now')),
          created_at        TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      database.run(`CREATE INDEX idx_file_tag ON file_metadata(tag)`);
      database.run(`CREATE INDEX idx_file_date ON file_metadata(date)`);
      database.run(`CREATE INDEX idx_file_tag_date ON file_metadata(tag, date)`);
      database.run(`CREATE INDEX idx_file_tag_label ON file_metadata(tag, custom_label)`);
      database.run(`CREATE INDEX idx_file_status ON file_metadata(status)`);

      database.run(`
        CREATE TABLE custom_labels (
          id          TEXT PRIMARY KEY,
          tag         TEXT NOT NULL,
          label       TEXT NOT NULL,
          use_count   INTEGER NOT NULL DEFAULT 1,
          last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(tag, label)
        )
      `);
      database.run(`CREATE INDEX idx_labels_tag ON custom_labels(tag, use_count DESC)`);

      database.run(`
        CREATE TABLE rename_history (
          id                TEXT PRIMARY KEY,
          file_metadata_id  TEXT NOT NULL,
          action            TEXT NOT NULL,
          triggered_by      TEXT,
          previous_filename TEXT NOT NULL,
          previous_path     TEXT NOT NULL,
          new_filename      TEXT NOT NULL,
          new_path          TEXT NOT NULL,
          metadata_snapshot TEXT,
          undone            INTEGER NOT NULL DEFAULT 0,
          created_at        TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (file_metadata_id) REFERENCES file_metadata(id),
          FOREIGN KEY (triggered_by) REFERENCES rename_history(id)
        )
      `);
      database.run(`CREATE INDEX idx_history_file ON rename_history(file_metadata_id)`);
      database.run(`CREATE INDEX idx_history_date ON rename_history(created_at DESC)`);
      database.run(`CREATE INDEX idx_history_triggered ON rename_history(triggered_by)`);
    },
  },
  {
    version: 3,
    description: "Add split lineage tracking columns to file_metadata",
    up(database) {
      database.run(`ALTER TABLE file_metadata ADD COLUMN split_from_id TEXT REFERENCES file_metadata(id)`);
      database.run(`ALTER TABLE file_metadata ADD COLUMN split_timestamp_start REAL`);
      database.run(`ALTER TABLE file_metadata ADD COLUMN split_timestamp_end REAL`);
      database.run(`ALTER TABLE file_metadata ADD COLUMN is_split_source INTEGER NOT NULL DEFAULT 0`);
      database.run(`ALTER TABLE file_metadata ADD COLUMN import_source_path TEXT`);
      database.run(`CREATE INDEX idx_file_split_from ON file_metadata(split_from_id)`);
    },
  },
];

/**
 * Initialize the shared database. Handles migration from old feedback.db.
 */
async function init() {
  if (!initSqlJs) {
    log.warn("sql.js not available — database disabled");
    return;
  }
  if (initialized) return;

  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  SQL = await initSqlJs();

  // Migration path: if old feedback.db exists but clipflow.db doesn't, copy it over
  if (fs.existsSync(OLD_FEEDBACK_PATH) && !fs.existsSync(DB_PATH)) {
    log.info("Migrating feedback.db → clipflow.db");
    fs.copyFileSync(OLD_FEEDBACK_PATH, DB_PATH);
    fs.renameSync(OLD_FEEDBACK_PATH, OLD_FEEDBACK_PATH + ".bak");
    log.info("Old feedback.db renamed to feedback.db.bak");
  }

  // Load existing DB or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Ensure schema_version table exists
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      description TEXT,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Run pending migrations
  _runMigrations();

  save();
  initialized = true;
  log.info(`Database initialized at ${DB_PATH} (schema v${_getCurrentVersion()})`);
}

/** Get the current schema version */
function _getCurrentVersion() {
  const result = db.exec("SELECT MAX(version) as v FROM schema_version");
  if (!result || result.length === 0 || result[0].values[0][0] === null) return 0;
  return result[0].values[0][0];
}

/** Run all pending migrations in order */
function _runMigrations() {
  const currentVersion = _getCurrentVersion();

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    log.info(`Running migration v${migration.version}: ${migration.description}`);
    try {
      migration.up(db);
      db.run(
        "INSERT INTO schema_version (version, description) VALUES (?, ?)",
        [migration.version, migration.description]
      );
      log.info(`Migration v${migration.version} complete`);
    } catch (err) {
      log.error(`Migration v${migration.version} failed: ${err.message}`);
      throw err;
    }
  }
}

/** Persist database to disk */
function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/** Get the raw sql.js database instance (for modules that need direct access) */
function getDb() {
  return db;
}

/** Check if database is ready */
function isReady() {
  return initialized && db !== null;
}

/** Convert sql.js result to array of row objects */
function toRows(result) {
  if (!result || result.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map((row) => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

/** Close the database connection and persist to disk */
function close() {
  if (db) {
    save();
    db.close();
    db = null;
    initialized = false;
    log.info("Database closed");
  }
}

module.exports = {
  init,
  save,
  close,
  getDb,
  isReady,
  toRows,
  DB_PATH,
};
