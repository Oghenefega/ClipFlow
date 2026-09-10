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

// #388: TikTok view counts come from the Display API (video.list scope). The
// developer app is approved for posting only; asking for a scope the app does
// not hold fails every TikTok sign-in, so this stays off until TikTok approves
// the Display API revision. Flip it (or set CLIPFLOW_TIKTOK_VIEWS=1 against the
// sandbox), cut an installer, and Settings offers "Reconnect for views".
const TIKTOK_VIEWS_ENABLED = process.env.CLIPFLOW_TIKTOK_VIEWS === "1";
const TIKTOK_VIEWS_SCOPE = "video.list";
const TIKTOK_AUTH_SCOPE = ["user.info.basic", "video.publish", ...(TIKTOK_VIEWS_ENABLED ? [TIKTOK_VIEWS_SCOPE] : [])].join(",");
const TIKTOK_VIEWS_PENDING = "TikTok views arrive once TikTok approves the app";

// The extra Graph permissions the insight endpoints need on top of what the
// publish flows already request (verified against Meta's docs, 2026-09-10).
// YouTube's videos.list?part=statistics is covered by youtube.readonly.
const INSIGHT_SCOPES = {
  Instagram: ["instagram_manage_insights"],
  Facebook: ["read_insights", "pages_manage_engagement"],
  ...(TIKTOK_VIEWS_ENABLED ? { TikTok: [TIKTOK_VIEWS_SCOPE] } : {}),
};

/**
 * true  — the stored scope string carries every insight permission
 * false — an account connected before its insight scope existed; Settings shows "Reconnect for views"
 * null  — the platform has no insight scope to check (TikTok while views are switched off)
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

/**
 * #388: TikTok never hands back a post id at publish time (0 of 170 clips have
 * one), so a TikTok target is the clip's title plus the moment it was posted;
 * the refresh matches those against the account's video list. The publish log
 * carries the exact completion time; the tracker's date + time (local) is the
 * fallback for clips that have aged out of the 500-entry log.
 * @returns {Array<{clipId, platform: "tiktok", title, publishedAt: number|null, date}>}
 */
function buildTikTokTargets(trackerData, publishLogEntries) {
  const completedAt = new Map();
  for (const e of publishLogEntries || []) {
    if (e && e.clipId && e.platform === "TikTok" && e.status === "success" && e.timestamp && !completedAt.has(e.clipId)) {
      completedAt.set(e.clipId, Date.parse(e.timestamp));
    }
  }
  const seen = new Set();
  const targets = [];
  for (const row of trackerData || []) {
    if (!row?.clipId || seen.has(row.clipId) || !Array.isArray(row.platformResults)) continue;
    seen.add(row.clipId);
    if (!row.platformResults.some((pr) => pr && pr.platform === "tiktok")) continue;
    let publishedAt = completedAt.get(row.clipId);
    if (!Number.isFinite(publishedAt)) publishedAt = Date.parse(`${row.date || ""} ${row.time || ""}`);
    targets.push({
      clipId: row.clipId,
      platform: "tiktok",
      title: row.title || "",
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
      date: row.date,
    });
  }
  return targets;
}

const MATCH_WINDOW_MS = 45 * 60 * 1000;
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Pair TikTok targets with Display API videos. A video is a candidate when it
 * was created within 45 minutes of the clip's publish moment; a candidate whose
 * caption starts with the clip's title wins over one that merely lands close in
 * time, and among equals the closest wins. Each video is used once, so two clips
 * posted an hour apart cannot both claim the same video.
 * @param {Array<{clipId, title, publishedAt}>} targets
 * @param {Array<{id, create_time: number, title?, video_description?}>} videos
 * @returns {Map<string, object>} clipId → video
 */
function matchTikTokVideos(targets, videos) {
  const pairs = [];
  for (const t of targets || []) {
    if (!Number.isFinite(t?.publishedAt)) continue;
    const title = norm(t.title);
    for (const v of videos || []) {
      if (!v?.id || !Number.isFinite(v.create_time)) continue;
      const dt = Math.abs(v.create_time * 1000 - t.publishedAt);
      if (dt > MATCH_WINDOW_MS) continue;
      const caption = norm(v.video_description || v.title);
      const titleHit = title.length > 0 && caption.startsWith(title);
      pairs.push({ t, v, dt, titleHit });
    }
  }
  pairs.sort((a, b) => (a.titleHit === b.titleHit ? a.dt - b.dt : a.titleHit ? -1 : 1));
  const matched = new Map();
  const used = new Set();
  for (const { t, v } of pairs) {
    if (matched.has(t.clipId) || used.has(v.id)) continue;
    matched.set(t.clipId, v);
    used.add(v.id);
  }
  return matched;
}

/**
 * #398: the LOCAL calendar day a snapshot belongs to, as YYYY-MM-DD — the
 * tracker's date format. Never toISOString (UTC shifts EST evenings a day).
 */
function localDayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  TIKTOK_VIEWS_ENABLED,
  TIKTOK_AUTH_SCOPE,
  TIKTOK_VIEWS_PENDING,
  hasInsightsScope,
  resolveFacebookVideo,
  buildTargets,
  buildTikTokTargets,
  matchTikTokVideos,
  needsRefresh,
  localDayKey,
};
