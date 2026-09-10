/**
 * #388: read-only TikTok Display API calls for the Analytics tab.
 *
 * Both endpoints need the video.list scope. video/list walks the account's
 * videos newest-first (20 a page) and is how a clip first finds its post id,
 * since Direct Post never hands one back; video/query refreshes counts for ids
 * the app already knows. Same contract as meta-insights: per-id results plus
 * errors, nothing throws for one bad id, and a dead token comes back as
 * `tokenDead` so the caller badges the account instead of retrying.
 */

const { apiPost } = require("./tiktok-publish");
const log = require("electron-log/main").scope("tiktok");

const FIELDS = "id,create_time,title,video_description,view_count,like_count,comment_count,share_count";
const PAGE = 20; // video/list max_count and video/query video_ids both cap at 20
const MAX_PAGES = 50; // 1,000 videos — a safety stop, not a limit anyone should reach
const PAGE_GAP_MS = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isDeadToken(error) {
  return error?.code === "access_token_invalid";
}

function toRow(v) {
  return {
    views: Number.isFinite(v.view_count) ? v.view_count : null,
    likes: Number.isFinite(v.like_count) ? v.like_count : null,
    comments: Number.isFinite(v.comment_count) ? v.comment_count : null,
    shares: Number.isFinite(v.share_count) ? v.share_count : null,
  };
}

/**
 * The account's videos, newest first, until the list runs out or reaches
 * videos created before `untilMs` (nothing older can match a target).
 * @returns {Promise<{videos: Array, error: string|null, tokenDead: boolean}>}
 */
async function listVideos(accessToken, { untilMs = 0 } = {}) {
  const videos = [];
  let cursor = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(PAGE_GAP_MS);
    const res = await apiPost(`/v2/video/list/?fields=${FIELDS}`, { max_count: PAGE, ...(cursor ? { cursor } : {}) }, accessToken);
    if (res.error?.code && res.error.code !== "ok") {
      log.warn("video/list failed", { code: res.error.code, message: res.error.message, page });
      return { videos, error: res.error.message || res.error.code, tokenDead: isDeadToken(res.error) };
    }
    const batch = res.data?.videos || [];
    videos.push(...batch);
    const oldest = batch.length ? Math.min(...batch.map((v) => v.create_time || Infinity)) * 1000 : 0;
    if (!res.data?.has_more || batch.length === 0 || oldest < untilMs) break;
    cursor = res.data.cursor;
  }
  return { videos, error: null, tokenDead: false };
}

/**
 * Counts for known video ids, 20 per call.
 * @returns {Promise<{results: Object<string,{views,likes,comments,shares}>, errors: Array<{id,message}>, tokenDead: boolean}>}
 */
async function queryVideos(accessToken, videoIds) {
  const ids = (videoIds || []).filter(Boolean).map(String);
  const results = {};
  const errors = [];
  for (let i = 0; i < ids.length; i += PAGE) {
    if (i > 0) await sleep(PAGE_GAP_MS);
    const chunk = ids.slice(i, i + PAGE);
    const res = await apiPost(`/v2/video/query/?fields=${FIELDS}`, { filters: { video_ids: chunk } }, accessToken);
    if (res.error?.code && res.error.code !== "ok") {
      log.warn("video/query failed", { code: res.error.code, message: res.error.message });
      const message = res.error.message || res.error.code;
      for (const id of chunk) errors.push({ id, message });
      if (isDeadToken(res.error)) return { results, errors, tokenDead: true };
      continue;
    }
    const seen = new Set();
    for (const v of res.data?.videos || []) {
      if (!v?.id) continue;
      results[String(v.id)] = toRow(v);
      seen.add(String(v.id));
    }
    // A deleted or private video is silently absent from the response.
    for (const id of chunk) if (!seen.has(id)) errors.push({ id, message: "Video not found on TikTok (deleted or private)" });
  }
  return { results, errors, tokenDead: false };
}

module.exports = { listVideos, queryVideos, toRow };
