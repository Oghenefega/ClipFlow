const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const log = require("electron-log/main").scope("database");
const { writeFileAtomicSync } = require("./atomic-write");

let initSqlJs;
try {
  initSqlJs = require("sql.js");
} catch (e) {
  initSqlJs = null;
}

// DB location depends on context (#80):
//   packaged exe (any profile)        → %APPDATA%\<profile>\data   (repo not bundled)
//   source-running, dev profile       → %APPDATA%\clipflow-dev\data
//   source-running, prod (npm start)  → <repo>/data                 (legacy, unchanged)
const DB_DIR =
  app.isPackaged || process.env.CLIPFLOW_PROFILE === "dev"
    ? path.join(app.getPath("userData"), "data")
    : path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DB_DIR, "clipflow.db");
// #299: one rolling copy of the last good write, left behind by save()'s rename.
const BAK_PATH = DB_PATH + ".bak";
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
  {
    version: 4,
    description: "Add is_test flag to file_metadata for test watch folder files",
    up(database) {
      database.run(`ALTER TABLE file_metadata ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0`);
      database.run(`CREATE INDEX idx_file_is_test ON file_metadata(is_test)`);
    },
  },
  {
    version: 5,
    description: "Create title_caption_rounds table for AI copy training data (#183)",
    up(database) {
      // One row per clip: what the AI offered, what actually shipped, and how
      // it performed. This is the training set the title/caption prompt reads
      // its few-shot examples from — see src/main/title-caption-log.js.
      database.run(`
        CREATE TABLE title_caption_rounds (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          clip_id           TEXT NOT NULL UNIQUE,
          project_id        TEXT,
          game              TEXT,
          transcript        TEXT,
          suggestions_json  TEXT,
          final_title       TEXT,
          final_caption     TEXT,
          title_source      TEXT,
          caption_source    TEXT,
          views             INTEGER,
          views_updated_at  TEXT,
          published_at      TEXT,
          created_at        TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      database.run(`CREATE UNIQUE INDEX idx_tcr_clip ON title_caption_rounds(clip_id)`);
      database.run(`CREATE INDEX idx_tcr_published ON title_caption_rounds(published_at DESC)`);
      database.run(`CREATE INDEX idx_tcr_views ON title_caption_rounds(views DESC)`);
    },
  },
  {
    version: 6,
    description: "Add reject_reasons to feedback for rejection reason chips (#198)",
    up(database) {
      // CSV of reason keys (duplicate, bad-cut, not-funny, nothing-happens,
      // needs-context, wrong-content). Empty/NULL = no reason given, which the
      // detection prompt treats as a generic negative, same as before.
      database.run(`ALTER TABLE feedback ADD COLUMN reject_reasons TEXT`);
    },
  },
  {
    version: 7,
    description: "One-time data fix (#197): move approved world-cup rows from RL to JC",
    up(database) {
      // Three clips of world-cup talk approved during a Rocket League session
      // (2026-07-26) were polluting RL's few-shot taste examples. They belong
      // under Just Chatting. Guarded by id + decision + content so this is a
      // no-op on fresh installs and on any DB where these ids hold other rows.
      // The rejected world-cup rows deliberately STAY under RL — they are
      // correct "don't clip chatting tangents mid-game" negative examples.
      database.run(`
        UPDATE feedback SET game_tag = 'JC'
        WHERE id IN (179, 181, 182)
          AND game_tag = 'RL'
          AND decision = 'approved'
          AND (transcript_segment LIKE '%rgentina%'
            OR transcript_segment LIKE '%essi%'
            OR transcript_segment LIKE '%hate watch%')
      `);
    },
  },
  {
    version: 8,
    description: "Add gen_source to title_caption_rounds: which input the suggestions were generated from (#193)",
    up(database) {
      // 'gemini-video' (model watched the clip) vs 'frames' (stills only).
      // Distinct from title_source, which classifies where the FINAL published
      // title came from (ai / ai_edited / self) — comparing acceptance rates
      // between the two generation paths needs both axes.
      database.run(`ALTER TABLE title_caption_rounds ADD COLUMN gen_source TEXT`);
    },
  },
  {
    version: 9,
    description: "Add sub_part to file_metadata: letter suffix for split children (#264)",
    up(database) {
      // Split children keep the parent's numeric part_number (so MAX(part_number)
      // accounting still hands the next whole file the next slot) and carry the
      // letter ('a', 'b', ... then 'aa') here. NULL = not a split child.
      database.run(`ALTER TABLE file_metadata ADD COLUMN sub_part TEXT`);
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
  db = _openOrRecover();

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

/**
 * Persist database to disk.
 *
 * #299: sql.js holds the whole database in memory and flushes all of it, so the
 * write window grows with the corpus. Writing in place meant a crash mid-flush
 * left a truncated file, which bricked the next launch and took the entire
 * approve/reject training history with it. Temp file + rename instead, keeping
 * the file it replaced as the .bak that init() falls back to.
 */
function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileAtomicSync(DB_PATH, buffer, BAK_PATH);
}

/**
 * Open a database file, proving it is actually readable before accepting it.
 * A truncated file can survive `new SQL.Database()` and only throw on the
 * first real read, so every candidate gets a query put through it.
 */
function _openFile(filePath) {
  const candidate = new SQL.Database(fs.readFileSync(filePath));
  candidate.exec("SELECT count(*) FROM sqlite_master");
  return candidate;
}

/**
 * #299: recover rather than throw. A throw here escapes into the bootstrap
 * chain and leaves the app invisible and unstartable (#298), so a damaged file
 * falls back to the rolling backup, and a damaged backup falls back to empty.
 * The damaged file is kept — it is the user's data and may be salvageable.
 */
function _openOrRecover() {
  if (fs.existsSync(DB_PATH)) {
    try {
      return _openFile(DB_PATH);
    } catch (err) {
      log.error(`Database at ${DB_PATH} is unreadable: ${err.message}`);
      const quarantine = `${DB_PATH}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(DB_PATH, quarantine);
        log.error(`Damaged database kept at ${quarantine}`);
      } catch (e) {
        log.warn(`Could not set the damaged database aside: ${e.message}`);
      }
    }
  } else if (!fs.existsSync(BAK_PATH)) {
    return new SQL.Database();
  } else {
    // The only way the primary goes missing while a backup exists is a crash
    // inside save()'s swap. Starting empty here would drop the whole corpus and
    // then overwrite the backup on the next save.
    log.error("Primary database is missing but a backup is present.");
  }

  if (fs.existsSync(BAK_PATH)) {
    try {
      const recovered = _openFile(BAK_PATH);
      log.warn(`Recovered from ${BAK_PATH} — anything written since the last good save is gone.`);
      return recovered;
    } catch (e) {
      log.error(`Backup at ${BAK_PATH} is also unreadable: ${e.message}`);
    }
  }
  log.error("Starting with an empty database.");
  return new SQL.Database();
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
