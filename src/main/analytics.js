/**
 * #387: cross-platform view counts for the Analytics tab.
 *
 * Generalises the #183 Phase 4 YouTube view pull to Instagram and Facebook.
 * Nothing new is collected at publish time — the post ids have been landing
 * in trackerData.platformResults on every publish since the tracker existed.
 * Counts live in clip_metrics (migration v10), one row per (clip, platform).
 *
 * Read-only, own accounts only. Each platform runs in its own try/catch so a
 * disconnected Facebook never hides YouTube's numbers; every failure comes
 * back as a per-platform message the tab prints instead of a number.
 */

const database = require("./database");
const titleCaptionLog = require("./title-caption-log");
const tokenStore = require("./token-store");
const publishLog = require("./publish-log");
const youtubeOAuth = require("./oauth/youtube");
const metaInsights = require("./oauth/meta-insights");
const { accountToPlatformKey } = require("../shared/captionResolve");
const { hasInsightsScope, buildTargets, needsRefresh } = require("./analytics-core");
const log = require("electron-log/main").scope("analytics");

const PLATFORMS = ["youtube", "instagram", "facebook"];
const LABEL = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };
const YT_BATCH = 50; // videos.list caps `id` at 50

let store = null;
let preflightAccount = null;
let lastRun = null;
let running = null;

/** `store` and `preflightAccount` live only in main.js. */
function init(deps) {
  store = deps.store;
  preflightAccount = deps.preflightAccount;
}

function db() {
  return database.isReady() ? database.getDb() : null;
}

function loadMetrics() {
  const d = db();
  if (!d) return [];
  try {
    return database.toRows(d.exec("SELECT clip_id, platform, post_id, views, likes, comments, shares, fetched_at FROM clip_metrics"));
  } catch (err) {
    log.warn("loadMetrics failed", { error: err.message });
    return [];
  }
}

function upsertMetrics(rows) {
  const d = db();
  if (!d || rows.length === 0) return;
  const fetchedAt = new Date().toISOString();
  for (const r of rows) {
    d.run(
      `INSERT INTO clip_metrics (clip_id, platform, post_id, views, likes, comments, shares, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(clip_id, platform) DO UPDATE SET
         post_id = excluded.post_id, views = excluded.views, likes = excluded.likes,
         comments = excluded.comments, shares = excluded.shares, fetched_at = excluded.fetched_at`,
      [r.clipId, r.platform, r.postId ?? null, r.views ?? null, r.likes ?? null, r.comments ?? null, r.shares ?? null, fetchedAt]
    );
  }
  database.save();
}

function findAccount(platform) {
  return (tokenStore.getAllAccounts() || []).find((a) => accountToPlatformKey(a) === platform) || null;
}

function accountError(platform, account) {
  if (!account) return `No ${LABEL[platform]} account connected`;
  if (hasInsightsScope(account) === false) return `Reconnect ${LABEL[platform]} in Settings to enable views`;
  return null;
}

async function fetchPlatform(platform, account, due) {
  if (platform === "youtube") {
    const results = {};
    for (let i = 0; i < due.length; i += YT_BATCH) {
      const batch = due.slice(i, i + YT_BATCH);
      const stats = await youtubeOAuth.fetchVideoStats(account.accessToken, batch.map((t) => t.postId));
      for (const id of Object.keys(stats)) results[id] = { views: stats[id] };
    }
    return { results, errors: [], tokenDead: false };
  }
  if (platform === "instagram") {
    return metaInsights.fetchInstagramMediaInsights(account.accessToken, due.map((t) => t.postId));
  }
  if (!account.pageAccessToken) return { results: {}, errors: [], tokenDead: true };
  return metaInsights.fetchFacebookVideoInsights(account.pageAccessToken, due.map((t) => ({ videoId: t.postId, surface: t.surface })));
}

async function runPlatform(platform, targets, existingByKey, force) {
  const out = { updated: 0, skipped: 0, failed: 0 };
  const due = force ? targets : targets.filter((t) => needsRefresh(t, existingByKey.get(`${t.clipId}:${platform}`)));
  out.skipped = targets.length - due.length;
  if (due.length === 0) return out;

  const account = findAccount(platform);
  const gate = accountError(platform, account);
  if (gate) return { ...out, skipped: targets.length, error: gate };

  const pf = await preflightAccount(account.id);
  if (!pf.ok) return { ...out, skipped: targets.length, error: pf.error || `${LABEL[platform]} token check failed` };
  const fresh = tokenStore.getAccount(account.id); // pre-flight may have rotated the token

  const { results, errors, tokenDead } = await fetchPlatform(platform, fresh, due);
  if (tokenDead) {
    tokenStore.setNeedsReconnect(account.id);
    return { ...out, skipped: targets.length, error: `${LABEL[platform]} session expired — reconnect in Settings` };
  }

  const rows = [];
  for (const t of due) {
    const r = results[t.postId];
    if (r && Number.isFinite(r.views)) {
      rows.push({ clipId: t.clipId, platform, postId: t.postId, ...r });
      // #183 Phase 4: YouTube views stay the title/caption ranking input.
      if (platform === "youtube") titleCaptionLog.recordViews(t.clipId, r.views);
    }
  }
  upsertMetrics(rows);
  out.updated = rows.length;
  out.failed = due.length - rows.length;
  if (out.failed > 0) {
    log.warn(`${LABEL[platform]}: ${out.failed} of ${due.length} ids returned no view count`, { sample: errors.slice(0, 3) });
    if (out.updated === 0 && errors[0]) out.error = errors[0].message;
  }
  return out;
}

/**
 * @param {{force?: boolean}} [opts] force ignores the per-row freshness rule
 * @returns {Promise<{ranAt: string, perPlatform: Object}>}
 */
async function refreshAllViews({ force = false } = {}) {
  if (running) return running; // a manual Refresh during the boot pull joins it
  running = (async () => {
    const targets = buildTargets(store.get("trackerData") || [], publishLog.getRecentLogs(500));
    const existingByKey = new Map(loadMetrics().map((m) => [`${m.clip_id}:${m.platform}`, m]));
    const perPlatform = {};
    for (const platform of PLATFORMS) {
      const mine = targets.filter((t) => t.platform === platform);
      try {
        perPlatform[platform] = await runPlatform(platform, mine, existingByKey, force);
      } catch (err) {
        log.warn(`${LABEL[platform]} refresh failed`, { error: err.message });
        perPlatform[platform] = { updated: 0, skipped: mine.length, failed: 0, error: err.message };
      }
    }
    lastRun = { ranAt: new Date().toISOString(), perPlatform };
    log.info("View refresh", perPlatform);
    return lastRun;
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

/** Everything the Analytics tab renders, joined in one pass. */
function getAnalytics() {
  const trackerData = store.get("trackerData") || [];
  const metrics = loadMetrics();
  const byKey = new Map(metrics.map((m) => [`${m.clip_id}:${m.platform}`, m]));

  let sources = new Map();
  const d = db();
  if (d) {
    try {
      sources = new Map(database.toRows(d.exec("SELECT clip_id, title_source FROM title_caption_rounds")).map((r) => [r.clip_id, r.title_source]));
    } catch (err) {
      log.warn("title_source lookup failed", { error: err.message });
    }
  }

  const seen = new Set();
  const clips = [];
  for (const row of trackerData) {
    if (!row?.clipId || seen.has(row.clipId)) continue;
    seen.add(row.clipId);
    const views = {};
    const hasPost = {};
    let total = 0;
    let fetchedAt = null;
    for (const p of [...PLATFORMS, "tiktok"]) {
      const pr = (row.platformResults || []).find((x) => x?.platform === p);
      hasPost[p] = !!(pr && (pr.postId || pr.url));
      const m = byKey.get(`${row.clipId}:${p}`);
      views[p] = m && Number.isFinite(m.views) ? m.views : null;
      if (views[p] != null) total += views[p];
      if (m?.fetched_at && (!fetchedAt || m.fetched_at > fetchedAt)) fetchedAt = m.fetched_at;
    }
    clips.push({
      clipId: row.clipId,
      title: row.title || "",
      game: row.game || "",
      date: row.date || "",
      type: row.type || "other",
      source: row.source || "clipflow",
      repostOf: !!row.repostOf,
      titleSource: sources.get(row.clipId) || null,
      views,
      hasPost,
      total,
      fetchedAt,
    });
  }

  const platforms = {};
  for (const p of PLATFORMS) {
    const account = findAccount(p);
    const last = metrics.filter((m) => m.platform === p).reduce((a, m) => (m.fetched_at > a ? m.fetched_at : a), "");
    platforms[p] = {
      connected: !!account,
      insightsScope: account ? hasInsightsScope(account) !== false : null,
      lastFetchedAt: last || null,
      error: lastRun?.perPlatform?.[p]?.error || accountError(p, account),
    };
  }
  platforms.tiktok = { connected: !!findAccount("tiktok"), available: false };

  return { clips, platforms, lastRun };
}

module.exports = { init, refreshAllViews, getAnalytics };
