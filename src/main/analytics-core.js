/**
 * #387: the pure half of the Analytics refresh — target building, freshness
 * and the insight-scope check. No Electron, no database, no network, so the
 * jest suite can pin the contracts without booting the app.
 *
 * The other half (tokens, Graph calls, the clip_metrics table) is analytics.js.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fetch again after a day; clips older than a month only once a week. */
const FRESH_MS = DAY_MS;
const OLD_CLIP_MS = 30 * DAY_MS;
const OLD_CLIP_FRESH_MS = 7 * DAY_MS;

// The extra Graph permissions the insight endpoints need on top of what the
// publish flows already request (verified against Meta's docs, 2026-09-10).
// YouTube's videos.list?part=statistics is covered by youtube.readonly.
const INSIGHT_SCOPES = {
  Instagram: ["instagram_manage_insights"],
  Facebook: ["read_insights", "pages_manage_engagement"],
};

/**
 * true  — the stored scope string carries every insight permission
 * false — a Meta account connected before #387; Settings shows "Reconnect for views"
 * null  — the platform has no insight scope to check (TikTok)
 */
function hasInsightsScope(account) {
  const platform = account?.platform;
  if (platform === "YouTube") return true;
  const need = INSIGHT_SCOPES[platform];
  if (!need) return null;
  const have = String(account?.scope || "").split(/[\s,]+/).filter(Boolean);
  return need.every((s) => have.includes(s));
}

/**
 * Facebook's tracker `postId` is the Reels POST id (main.js picks
 * `result.postId || result.videoId`), but video_insights lives on the VIDEO id.
 * The publish flow builds the url as /reel/{videoId}, so the url is the first
 * source of truth; the publish log's `publishId` (= videoId) is the second;
 * legacy non-Reels uploads return postId: null so their tracker postId IS the
 * video id.
 */
function resolveFacebookVideo(platformResult, clipId, publishLogEntries) {
  const m = /\/reel\/(\d+)/.exec(platformResult?.url || "");
  if (m) return { videoId: m[1], surface: "reels" };
  const entry = (publishLogEntries || []).find(
    (e) => e && e.clipId === clipId && e.platform === "Facebook" && e.status === "success" && e.publishId
  );
  if (entry) return { videoId: String(entry.publishId), surface: entry.surface || "reels" };
  if (platformResult?.postId) return { videoId: String(platformResult.postId), surface: "video" };
  return null;
}

/**
 * One target per (clip, platform) that has something to query. First tracker
 * row per clipId wins (a clip shows once even when it was logged twice).
 * @returns {Array<{clipId, platform, postId, surface?, date}>}
 */
function buildTargets(trackerData, publishLogEntries) {
  const seen = new Set();
  const targets = [];
  for (const row of trackerData || []) {
    if (!row?.clipId || seen.has(row.clipId) || !Array.isArray(row.platformResults)) continue;
    seen.add(row.clipId);
    for (const pr of row.platformResults) {
      if (!pr) continue;
      if (pr.platform === "youtube" || pr.platform === "instagram") {
        if (pr.postId) targets.push({ clipId: row.clipId, platform: pr.platform, postId: String(pr.postId), date: row.date });
      } else if (pr.platform === "facebook") {
        const r = resolveFacebookVideo(pr, row.clipId, publishLogEntries);
        if (r) targets.push({ clipId: row.clipId, platform: "facebook", postId: r.videoId, surface: r.surface, date: row.date });
      }
    }
  }
  return targets;
}

/** @param {{fetched_at?: string}|undefined} existing — the clip_metrics row, if any */
function needsRefresh(target, existing, now = Date.now()) {
  const fetched = existing?.fetched_at ? Date.parse(existing.fetched_at) : NaN;
  if (!Number.isFinite(fetched)) return true;
  const age = now - fetched;
  if (age < FRESH_MS) return false;
  const published = Date.parse(target?.date || "");
  const isOld = Number.isFinite(published) && now - published > OLD_CLIP_MS;
  return isOld ? age >= OLD_CLIP_FRESH_MS : true;
}

module.exports = {
  INSIGHT_SCOPES,
  hasInsightsScope,
  resolveFacebookVideo,
  buildTargets,
  needsRefresh,
};
