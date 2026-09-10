/**
 * #387: read-only Meta Graph insight fetchers for the Analytics tab.
 *
 * Both Instagram (via Facebook Login) and Facebook Pages authenticate with a
 * Page access token against graph.facebook.com, so one batch helper serves
 * both. Everything here returns per-id results and errors — nothing throws
 * for a single bad media id, and a dead token (code 190) is reported as
 * `tokenDead` so the caller can badge the account instead of retrying.
 */

const { graphPost } = require("./facebook-publish");

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Graph's batch endpoint caps at 50 sub-requests. The gap keeps a first run
// (~340 sub-requests) well inside the per-app rate window.
const BATCH_SIZE = 50;
const BATCH_GAP_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run GET sub-requests through POST /?batch=[...].
 * @returns {Promise<Array<{ok: boolean, body?: object, error?: object}>>} aligned with relativeUrls
 */
async function graphBatch(accessToken, relativeUrls) {
  const out = [];
  for (let i = 0; i < relativeUrls.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_GAP_MS);
    const chunk = relativeUrls.slice(i, i + BATCH_SIZE);
    const res = await graphPost(`${GRAPH_BASE}/`, {
      access_token: accessToken,
      include_headers: "false",
      batch: JSON.stringify(chunk.map((u) => ({ method: "GET", relative_url: u }))),
    });
    if (!Array.isArray(res)) {
      // Top-level failure (dead token, malformed batch) — every sub-request failed.
      const error = res?.error || { message: "Unexpected Graph batch response" };
      for (let k = 0; k < chunk.length; k++) out.push({ ok: false, error });
      continue;
    }
    for (const item of res) {
      let body = null;
      try { body = item?.body ? JSON.parse(item.body) : null; } catch (_) { /* fall through as an error */ }
      if (item?.code === 200 && body && !body.error) out.push({ ok: true, body });
      else out.push({ ok: false, error: body?.error || { message: `HTTP ${item?.code ?? "?"}` } });
    }
  }
  return out;
}

/** {data:[{name, values:[{value}]}]} → {name: number} */
function parseInsights(body) {
  const metrics = {};
  for (const m of body?.data || []) {
    const v = Number(m?.values?.[0]?.value);
    if (m?.name && Number.isFinite(v)) metrics[m.name] = v;
  }
  return metrics;
}

function collect(ids, batch, toRow) {
  const results = {};
  const errors = [];
  let tokenDead = false;
  batch.forEach((r, i) => {
    if (r.ok) results[ids[i]] = toRow(parseInsights(r.body));
    else {
      if (r.error?.code === 190) tokenDead = true;
      errors.push({ id: ids[i], message: r.error?.message || "Unknown error" });
    }
  });
  return { results, errors, tokenDead };
}

const IG_METRICS = "views,reach,likes,comments,shares,saved";

/**
 * Instagram media insights. Needs instagram_manage_insights on the page token.
 * A media whose type rejects one of the engagement metrics is retried for
 * views alone, so an odd media type still contributes its view count.
 * @returns {Promise<{results: Object<string,{views,likes,comments,shares}>, errors: Array<{id,message}>, tokenDead: boolean}>}
 */
async function fetchInstagramMediaInsights(pageToken, mediaIds) {
  const ids = (mediaIds || []).filter(Boolean).map(String);
  if (ids.length === 0) return { results: {}, errors: [], tokenDead: false };
  const toRow = (m) => ({ views: m.views ?? null, likes: m.likes ?? null, comments: m.comments ?? null, shares: m.shares ?? null });

  const first = collect(ids, await graphBatch(pageToken, ids.map((id) => `${id}/insights?metric=${IG_METRICS}`)), toRow);
  if (first.tokenDead || first.errors.length === 0) return first;

  const retryIds = first.errors.map((e) => e.id);
  const retry = collect(retryIds, await graphBatch(pageToken, retryIds.map((id) => `${id}/insights?metric=views`)), toRow);
  return {
    results: { ...first.results, ...retry.results },
    errors: retry.errors,
    tokenDead: retry.tokenDead,
  };
}

/**
 * Facebook video insights on the VIDEO id (not the Reels post id). Needs
 * read_insights + pages_manage_engagement on the page token.
 * @param {Array<{videoId: string, surface: "reels"|"video"}>} videos
 */
async function fetchFacebookVideoInsights(pageToken, videos) {
  const list = (videos || []).filter((v) => v?.videoId);
  if (list.length === 0) return { results: {}, errors: [], tokenDead: false };
  const ids = list.map((v) => String(v.videoId));
  const urls = list.map((v) => `${v.videoId}/video_insights?metric=${v.surface === "reels" ? "fb_reels_total_plays" : "total_video_views"}`);
  const toRow = (m) => ({ views: m.fb_reels_total_plays ?? m.total_video_views ?? null, likes: null, comments: null, shares: null });
  return collect(ids, await graphBatch(pageToken, urls), toRow);
}

module.exports = {
  graphBatch,
  fetchInstagramMediaInsights,
  fetchFacebookVideoInsights,
  // exported for tests
  parseInsights,
};
