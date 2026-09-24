/**
 * ai_calls — one row per title/caption model call (#424), and per game
 * research call (kind "research_game", #464; its cost includes web searches).
 *
 * Before this table the app could not answer "how often is Rephrase used",
 * "what did the stills fallback cost this month" or "how many Gemini calls
 * failed and why". Generate wrote a training row (title_caption_rounds) and,
 * on the Gemini path only, a cost log; the stills fallback and the single-card
 * buttons wrote nothing at all.
 *
 * Every call now lands here — Generate, the approve-time auto path (#420),
 * Regenerate and Rephrase — with the path that actually ran, the tokens
 * (thinking broken out), the dollar cost, the wall time, and the fallback
 * reason when Gemini could not run. applied_at is stamped when the creator
 * applies a card that this call produced, so "offered vs used" is queryable
 * per kind, not only per published clip.
 *
 * One query answers the monthly questions:
 *   SELECT kind, path, COUNT(*) calls, SUM(cost_usd) usd,
 *          SUM(fallback_reason IS NOT NULL) fallbacks,
 *          SUM(applied_at IS NOT NULL) applied
 *     FROM ai_calls WHERE ts >= date('now', 'start of month')
 *    GROUP BY kind, path;
 */

const database = require("../database");
const log = require("electron-log/main").scope("ai-call-log");

function db() {
  return database.isReady() ? database.getDb() : null;
}

/**
 * Insert one row. Returns the new row id (null when the DB is not up or the
 * write failed — logging must never fail the call it describes).
 */
function record({
  kind, cardKind, cardIdx, clipId, projectId, provider, model, path, fallbackReason,
  usage, costUsd, durationMs, ok, error,
}) {
  const d = db();
  if (!d) return null;
  try {
    d.run(
      `INSERT INTO ai_calls
         (kind, card_kind, card_idx, clip_id, project_id, provider, model, path, fallback_reason,
          tokens_in, tokens_out, tokens_thinking, cost_usd, duration_ms, ok, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        kind, cardKind || null, Number.isInteger(cardIdx) ? cardIdx : null, clipId || null, projectId || null,
        provider || null, model || null, path || null, fallbackReason || null,
        usage?.inputTokens ?? null, usage?.outputTokens ?? null, usage?.thoughtTokens ?? null,
        Number.isFinite(costUsd) ? costUsd : null, Number.isFinite(durationMs) ? durationMs : null,
        ok ? 1 : 0, error || null,
      ]
    );
    const rows = database.toRows(d.exec("SELECT last_insert_rowid() AS id"));
    database.save();
    return rows[0]?.id ?? null;
  } catch (err) {
    log.warn("record failed", { kind, clipId, error: err.message });
    return null;
  }
}

/** The creator applied a card this call produced. */
function markApplied(id) {
  const d = db();
  if (!d || !Number.isInteger(id)) return;
  try {
    d.run("UPDATE ai_calls SET applied_at = datetime('now') WHERE id = ? AND applied_at IS NULL", [id]);
    database.save();
  } catch (err) {
    log.warn("markApplied failed", { id, error: err.message });
  }
}

module.exports = { record, markApplied };
