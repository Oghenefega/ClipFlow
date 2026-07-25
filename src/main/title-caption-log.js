/**
 * Title & caption training data (#183).
 *
 * One row per clip in `title_caption_rounds` recording the full round:
 * what the AI offered, what actually shipped, and how the post performed.
 *
 * The point is the gap between those first two. Before this module the app
 * threw that away — suggestions lived only in useAIStore._perClipCache
 * (in-memory, dies on app close) and the publish log stored the final title
 * but never the caption. So the single most useful signal the app generates
 * ("AI offered these six, the creator wrote their own instead, here it is")
 * was never captured.
 *
 * Write path:
 *   generate  → recordGeneration()  stores transcript + all 6 suggestions
 *   publish   → recordPublish()     stores the final text + classifies source
 *   Phase 4   → recordViews()       stores view counts for ranking
 *
 * Read path:
 *   getVoiceExamples() → the few-shot set the prompt builder uses.
 */

const database = require("./database");
const log = require("electron-log/main").scope("title-caption-log");

// ─── Text normalization & source classification ───────────────────

/** Strip hashtags, punctuation and casing so two phrasings compare fairly. */
function normalize(text) {
  return String(text || "")
    .replace(/#\S+/g, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Function words carry no voice signal and inflate overlap between titles
// that have nothing to do with each other. Dropping them is what separates
// "he edited the AI's line" from "both sentences contain the word 'the'".
const STOPWORDS = new Set(
  "a an the and or but is are was were be been am i my me you your he she it this that of to in on at for with had has have do does did just so"
    .split(" ")
);

/** Crude suffix trim so "leads"/"lead" and "feel"/"felt" compare equal. */
function stem(word) {
  return word.replace(/(ing|ed|es|s)$/, "").replace(/^(felt|feel|feels)$/, "fel");
}

function tokens(text) {
  const n = normalize(text);
  if (!n) return [];
  return n.split(" ").filter((w) => w && !STOPWORDS.has(w)).map(stem);
}

/**
 * How much of the shorter phrase's content words survive in the longer one.
 * Used to tell "he edited the AI's line" from "he wrote his own".
 * Returns 0-1.
 */
function overlapRatio(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const pool = [...longer];
  let hits = 0;
  for (const t of shorter) {
    const i = pool.indexOf(t);
    if (i !== -1) { hits++; pool.splice(i, 1); }
  }
  return hits / shorter.length;
}

/**
 * Classify where the shipped text came from.
 *
 * "ai"        — shipped verbatim (ignoring case/punctuation/hashtags)
 * "ai_edited" — clearly derived from one of the options but reworked
 * "self"      — the creator wrote their own despite having options
 * "unknown"   — no options were on the table (AI never ran for this clip)
 *
 * The ai_edited bucket is the interesting one: it's where the app learns what
 * the creator consistently cuts.
 */
function classifySource(finalText, options) {
  if (!finalText) return null;
  if (!Array.isArray(options) || options.length === 0) return "unknown";
  const finalNorm = normalize(finalText);
  if (!finalNorm) return "unknown";

  for (const opt of options) {
    if (normalize(opt) === finalNorm) return "ai";
  }
  // 0.6 sits in a wide empty gap. Measured against the creator's real edits:
  // reworked lines score 0.86-1.00 ("The pass was PERFECT and I still blew
  // it" → "The pass was PERFECT" = 1.00), while genuinely self-written titles
  // against the options they ignored score 0.00 across the board.
  for (const opt of options) {
    if (overlapRatio(finalText, opt) >= 0.6) return "ai_edited";
  }
  return "self";
}

/** Pull the flat list of option strings out of a stored suggestions blob. */
function optionTexts(suggestions, kind) {
  if (!suggestions) return [];
  const list = kind === "caption" ? suggestions.captions : suggestions.titles;
  if (!Array.isArray(list)) return [];
  return list.map((c) => (typeof c === "string" ? c : c?.[kind] || c?.text || "")).filter(Boolean);
}

// ─── Write path ───────────────────────────────────────────────────

function db() {
  return database.isReady() ? database.getDb() : null;
}

/**
 * Record what the AI produced for a clip. Called on every successful
 * generate. Re-generating overwrites the stored options (the last set shown
 * is the one the creator actually chose from or rejected) but never clears a
 * final title already recorded by a publish.
 */
function recordGeneration({ clipId, projectId, game, transcript, suggestions }) {
  const d = db();
  if (!d || !clipId) return;
  try {
    d.run(
      `INSERT INTO title_caption_rounds (clip_id, project_id, game, transcript, suggestions_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(clip_id) DO UPDATE SET
         project_id       = COALESCE(excluded.project_id, project_id),
         game             = COALESCE(excluded.game, game),
         transcript       = COALESCE(excluded.transcript, transcript),
         suggestions_json = excluded.suggestions_json,
         updated_at       = datetime('now')`,
      [clipId, projectId || null, game || null, transcript || null, JSON.stringify(suggestions || {})]
    );
    database.save();
  } catch (err) {
    log.warn("recordGeneration failed", { clipId, error: err.message });
  }
}

/**
 * Record what actually shipped. Called once per clip when every enabled
 * platform has published. Inserts a row even when the AI never ran for this
 * clip — a hand-written title is still voice data, and is in fact the most
 * valuable kind.
 */
function recordPublish({ clipId, projectId, game, title, caption, transcript, publishedAt }) {
  const d = db();
  if (!d || !clipId) return;
  try {
    const existing = database.toRows(
      d.exec("SELECT suggestions_json FROM title_caption_rounds WHERE clip_id = ?", [clipId])
    );
    let suggestions = null;
    if (existing.length > 0 && existing[0].suggestions_json) {
      try { suggestions = JSON.parse(existing[0].suggestions_json); } catch (_) { /* corrupt blob — treat as none */ }
    }

    const titleSource = classifySource(title, optionTexts(suggestions, "title"));
    const captionSource = classifySource(caption, optionTexts(suggestions, "caption"));
    const stamp = publishedAt || new Date().toISOString();

    d.run(
      `INSERT INTO title_caption_rounds
         (clip_id, project_id, game, transcript, final_title, final_caption, title_source, caption_source, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(clip_id) DO UPDATE SET
         project_id     = COALESCE(excluded.project_id, project_id),
         game           = COALESCE(excluded.game, game),
         transcript     = COALESCE(excluded.transcript, transcript),
         final_title    = excluded.final_title,
         final_caption  = excluded.final_caption,
         title_source   = excluded.title_source,
         caption_source = excluded.caption_source,
         published_at   = excluded.published_at,
         updated_at     = datetime('now')`,
      [clipId, projectId || null, game || null, transcript || null,
       title || null, caption || null, titleSource, captionSource, stamp]
    );
    database.save();
    log.info("Recorded published copy", { clipId, titleSource, captionSource });
  } catch (err) {
    log.warn("recordPublish failed", { clipId, error: err.message });
  }
}

/** Store a fetched view count for a clip (Phase 4 ranking input). */
function recordViews(clipId, views) {
  const d = db();
  if (!d || !clipId || !Number.isFinite(views)) return;
  try {
    d.run(
      `UPDATE title_caption_rounds
          SET views = ?, views_updated_at = datetime('now'), updated_at = datetime('now')
        WHERE clip_id = ?`,
      [Math.max(0, Math.round(views)), clipId]
    );
    database.save();
  } catch (err) {
    log.warn("recordViews failed", { clipId, error: err.message });
  }
}

// ─── Read path ────────────────────────────────────────────────────

/**
 * The few-shot voice set for the title/caption prompt.
 *
 * Ranking: clips with view counts come first, best-performing first — those
 * are proven. Everything else falls in behind by recency. Hand-written and
 * edited titles outrank verbatim-AI ones within each group: a title the
 * creator accepted unchanged tells us less about their voice than one they
 * wrote or rewrote, and feeding the model its own past output back as an
 * example is how a voice flattens out.
 *
 * @param {number} [limit=20]
 * @returns {Array<{title: string, caption: string, game: string, source: string, views: number|null}>}
 */
function getVoiceExamples(limit = 20) {
  const d = db();
  if (!d) return [];
  try {
    const rows = database.toRows(d.exec(
      `SELECT final_title, final_caption, game, title_source, views, published_at
         FROM title_caption_rounds
        WHERE final_title IS NOT NULL AND TRIM(final_title) != ''
        ORDER BY
          CASE WHEN views IS NULL THEN 1 ELSE 0 END,
          views DESC,
          CASE title_source WHEN 'self' THEN 0 WHEN 'ai_edited' THEN 1 ELSE 2 END,
          published_at DESC
        LIMIT ?`,
      [Math.max(1, limit)]
    ));
    return rows.map((r) => ({
      title: r.final_title,
      caption: r.final_caption || "",
      game: r.game || "",
      source: r.title_source || "unknown",
      views: Number.isFinite(r.views) ? r.views : null,
    }));
  } catch (err) {
    log.warn("getVoiceExamples failed", { error: err.message });
    return [];
  }
}

/** Rows that have a published clip but no view count yet (Phase 4 input). */
function getRowsNeedingViews() {
  const d = db();
  if (!d) return [];
  try {
    return database.toRows(d.exec(
      `SELECT clip_id, published_at FROM title_caption_rounds
        WHERE published_at IS NOT NULL
          AND (views IS NULL OR views_updated_at < datetime('now', '-7 days'))`
    ));
  } catch (err) {
    log.warn("getRowsNeedingViews failed", { error: err.message });
    return [];
  }
}

/** Summary for the Settings debug panel. */
function getStats() {
  const d = db();
  if (!d) return { total: 0, published: 0, withViews: 0, bySource: {} };
  try {
    const rows = database.toRows(d.exec(
      `SELECT title_source, COUNT(*) AS n,
              SUM(CASE WHEN published_at IS NOT NULL THEN 1 ELSE 0 END) AS pub,
              SUM(CASE WHEN views IS NOT NULL THEN 1 ELSE 0 END) AS vw
         FROM title_caption_rounds GROUP BY title_source`
    ));
    const bySource = {};
    let total = 0, published = 0, withViews = 0;
    for (const r of rows) {
      bySource[r.title_source || "none"] = r.n;
      total += r.n;
      published += r.pub || 0;
      withViews += r.vw || 0;
    }
    return { total, published, withViews, bySource };
  } catch (err) {
    return { total: 0, published: 0, withViews: 0, bySource: {} };
  }
}

// ─── Backfill ─────────────────────────────────────────────────────

/**
 * Seed the table from data the app already had lying around: the publish log
 * (every title that reached a platform) and trackerData (clip ids + platform
 * post ids). Captions can't be recovered — they were never persisted at
 * publish time, which is the gap recordPublish() closes going forward.
 *
 * Titles that match a past accepted suggestion are marked "ai"; the rest are
 * "self", which for the existing data is the overwhelming majority.
 *
 * Idempotent: only inserts clip ids not already present.
 *
 * @returns {{ inserted: number, skipped: number }}
 */
function backfill({ publishLogEntries = [], trackerData = [], titleCaptionHistory = [] } = {}) {
  const d = db();
  if (!d) return { inserted: 0, skipped: 0 };

  const aiPicks = titleCaptionHistory
    .filter((h) => h && h.type === "pick" && h.titleChosen)
    .map((h) => normalize(h.titleChosen));
  const pickSet = new Set(aiPicks);

  // clipId → { title, publishedAt, game }. trackerData carries the game tag
  // and a confirmed-complete publish; the publish log carries per-platform
  // attempts. Merge both, preferring the earliest success timestamp.
  const byClip = new Map();

  for (const e of publishLogEntries) {
    if (!e || e.status !== "success" || !e.clipId || !e.clipTitle) continue;
    const prev = byClip.get(e.clipId);
    if (!prev || (e.timestamp && e.timestamp < prev.publishedAt)) {
      byClip.set(e.clipId, {
        title: e.clipTitle,
        publishedAt: e.timestamp || prev?.publishedAt || null,
        game: prev?.game || null,
      });
    }
  }

  for (const t of trackerData) {
    if (!t || !t.clipId || !t.title) continue;
    const prev = byClip.get(t.clipId);
    byClip.set(t.clipId, {
      title: prev?.title || t.title,
      publishedAt: prev?.publishedAt || (t.date ? `${t.date}T00:00:00.000Z` : null),
      game: t.game || prev?.game || null,
    });
  }

  let inserted = 0, skipped = 0;
  for (const [clipId, rec] of byClip) {
    try {
      const existing = database.toRows(
        d.exec("SELECT id FROM title_caption_rounds WHERE clip_id = ?", [clipId])
      );
      if (existing.length > 0) { skipped++; continue; }
      d.run(
        `INSERT INTO title_caption_rounds
           (clip_id, game, final_title, title_source, published_at)
         VALUES (?, ?, ?, ?, ?)`,
        [clipId, rec.game, rec.title, pickSet.has(normalize(rec.title)) ? "ai" : "self", rec.publishedAt]
      );
      inserted++;
    } catch (err) {
      log.warn("backfill row failed", { clipId, error: err.message });
    }
  }

  if (inserted > 0) database.save();
  log.info(`Backfill complete: ${inserted} inserted, ${skipped} already present`);
  return { inserted, skipped };
}

module.exports = {
  recordGeneration,
  recordPublish,
  recordViews,
  getVoiceExamples,
  getRowsNeedingViews,
  getStats,
  backfill,
  // exported for tests / prompt builder
  normalize,
  classifySource,
};
