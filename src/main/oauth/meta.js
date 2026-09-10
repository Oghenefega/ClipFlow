/**
 * Meta OAuth 2.0 flows for ClipFlow.
 *
 * Two public entry points share a single OAuth dance against facebook.com:
 *
 *   startFacebookOAuthFlow  — requests Page-publishing scopes, returns a Facebook
 *                             Page account record (saved as "fb_<pageId>" upstream).
 *
 *   startInstagramOAuthFlow — requests Instagram-publishing scopes, resolves the
 *                             IG Business Account linked to the user's Facebook
 *                             Page, returns an Instagram account record using the
 *                             page access token. Saved as "ig_<igAccountId>"
 *                             upstream. The IG publish handler routes these
 *                             accounts through graph.facebook.com (resumable
 *                             upload) because loginType === "facebook_login".
 *
 * Why two flows: users explicitly opt into FB-Page-publishing or IG-publishing.
 * Each flow requests only the scopes it needs (no pages_manage_posts in the IG
 * flow, no IG scopes in the FB flow) and saves only the account it produced.
 *
 * Resumable upload to Instagram requires Facebook Login per Meta docs — the
 * Instagram Login direct path (graph.instagram.com) does not expose it. Hence
 * the Instagram flow here, despite its name, authenticates the user via
 * facebook.com and uses the Page-linked IG Business Account ID.
 */
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { URL } = require("url");
const { shell } = require("electron");
const log = require("electron-log/main").scope("meta");
const { renderResultPage } = require("./result-page");

const GRAPH_API_VERSION = "v21.0";
const AUTH_URL = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const CALLBACK_PORT = 8083;
// #391: the Meta app is Live (a Development-mode app hides its posts from the
// public) and Facebook Login for Business locks "Enforce HTTPS" on, so the
// return address cannot be localhost. facebook.com sends the result to this
// hosted page (scripts/hosted/meta-callback.html, published to R2 by
// scripts/publish-callback.ps1), which forwards it to the local server below.
// Registered on the Meta dashboard under Valid OAuth Redirect URIs and baked
// into every installed copy — changing it breaks sign-in for all of them.
const REDIRECT_URI = "https://engine.flowve.app/auth/meta/callback";

// #387: read_insights + pages_manage_engagement are what /{video}/video_insights
// requires (both, per Meta's docs) — the Analytics tab's Facebook view counts.
// Accounts connected before this carry the shorter scope string; Settings
// shows "Reconnect for views" on them (analytics-core.hasInsightsScope).
const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "read_insights",
  "pages_manage_engagement",
].join(",");

// IG-via-FB needs page lookup scopes to resolve the linked IG Business Account,
// plus the IG publishing scopes. Deliberately omits pages_manage_posts.
// #387: instagram_manage_insights unlocks /{media}/insights (view counts).
const INSTAGRAM_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
  "instagram_manage_insights",
].join(",");

// ── HTTP helpers ──

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers,
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Meta response: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// The result now round-trips through a public page, so the local server only
// accepts the answer to the request it actually made (same check as tiktok.js).
function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Run the OAuth dance against facebook.com, then hand the long-lived user token
 * to the supplied finalizer which returns the platform-specific account record.
 */
function runOAuthFlow({ appId, appSecret, timeoutMs, scopes, finalizer, scopeName }) {
  return new Promise((resolve, reject) => {
    let timeoutHandle = null;
    let server = null;
    let settled = false;
    const state = generateState();
    const platform = scopeName === "facebook" ? "Facebook" : "Instagram";

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (server) {
        try { server.close(); } catch (_) {}
        server = null;
      }
    };

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    server = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      if (reqUrl.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = reqUrl.searchParams.get("code");
      const returnedState = reqUrl.searchParams.get("state");
      const error = reqUrl.searchParams.get("error");
      const errorDescription = reqUrl.searchParams.get("error_description");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderResultPage({ ok: false, platform, reason: errorDescription || error }));
        settle(() => reject(new Error(`Meta auth error: ${errorDescription || error}`)));
        return;
      }

      if (!code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderResultPage({ ok: false, platform, reason: "Meta did not send back a sign-in code." }));
        settle(() => reject(new Error("No authorization code received from Meta")));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderResultPage({ ok: false, platform, reason: "The sign-in that came back was not the one Corva started. Nothing was saved." }));
        settle(() => reject(new Error("OAuth state mismatch")));
        return;
      }

      try {
        log.info(`Got auth code (${scopeName}), exchanging for token...`);

        const shortLived = await exchangeCode(appId, appSecret, code);
        if (shortLived.error) {
          throw new Error(shortLived.error.message || JSON.stringify(shortLived.error));
        }

        log.info("Got short-lived token, exchanging for long-lived...");
        const longLived = await exchangeForLongLived(appId, appSecret, shortLived.access_token);
        if (longLived.error) {
          throw new Error(longLived.error.message || JSON.stringify(longLived.error));
        }

        const accessToken = longLived.access_token;
        const expiresIn = longLived.expires_in || 5184000; // 60 days default
        log.info("Long-lived token obtained", { expiresIn });

        const accountData = await finalizer({ accessToken, expiresIn, scopes });

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderResultPage({ ok: true, platform, account: accountData.displayName }));
        settle(() => resolve(accountData));
      } catch (err) {
        log.error(`${scopeName} OAuth error`, { error: err.message });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderResultPage({ ok: false, platform, reason: err.message }));
        settle(() => reject(err));
      }
    });

    server.listen(CALLBACK_PORT, "127.0.0.1", () => {
      log.info(`Callback server listening (${scopeName})`, { port: CALLBACK_PORT });

      const authUrl = new URL(AUTH_URL);
      authUrl.searchParams.set("client_id", appId);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("scope", scopes);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("state", state);

      log.info("Opening system browser for auth");
      shell.openExternal(authUrl.toString());
    });

    server.on("error", (err) => {
      // Both Meta flows share one callback port, so a second click while the
      // first sign-in is still open in the browser lands here (s249: eleven
      // EADDRINUSE alerts in four minutes). Say what is actually going on.
      const msg = err.code === "EADDRINUSE"
        ? "A Facebook or Instagram sign-in is already open in your browser. Finish that one first (or wait for it to time out), then try again."
        : `Meta OAuth server error: ${err.message}`;
      settle(() => reject(new Error(msg)));
    });

    timeoutHandle = setTimeout(() => {
      settle(() => reject(new Error("Meta authorization timed out. Please try again.")));
    }, timeoutMs);
  });
}

/**
 * Finalizer for the Facebook Page flow. Picks the user's first Page and returns
 * an FB Page account record (the publish handler uses pageAccessToken to publish).
 */
async function facebookFinalizer({ accessToken, expiresIn, scopes }) {
  const profile = await fetchProfile(accessToken);
  log.info("FB user fetched", { name: profile.name, id: profile.id });

  const pagesData = await fetchPages(accessToken);
  const pages = pagesData.data || [];
  log.info("Pages found", { count: pages.length });

  if (pages.length === 0) {
    throw new Error("No Facebook Pages found. You need to manage at least one Page to connect.");
  }

  // TODO: let user pick when multiple pages exist
  const page = pages[0];
  log.info("Using page", { pageId: page.id, pageName: page.name });

  let avatarUrl = profile.picture?.data?.url || "";
  try {
    const pageAvatarUrl = `${GRAPH_BASE}/${page.id}/picture?type=large&redirect=false&access_token=${page.access_token}`;
    const pagePic = await httpsGet(pageAvatarUrl);
    if (pagePic.data?.url) avatarUrl = pagePic.data.url;
  } catch (e) {
    log.warn("Failed to fetch page picture, using user profile pic", { error: e.message });
  }

  return {
    platform: "Facebook",
    loginType: "facebook_login",
    openId: profile.id,
    accessToken,
    refreshToken: "",
    expiresAt: Date.now() + expiresIn * 1000,
    scope: scopes,
    displayName: page.name || profile.name,
    avatarUrl,
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token,
  };
}

/**
 * Finalizer for the Instagram (via FB Login) flow. Resolves the IG Business
 * Account linked to one of the user's Pages and returns an IG account record
 * using the page access token. The downstream publish handler routes this
 * record through graph.facebook.com/{ig-user-id}/media (resumable upload).
 */
async function instagramFinalizer({ accessToken, expiresIn, scopes }) {
  const profile = await fetchProfile(accessToken);
  log.info("FB user fetched (IG flow)", { name: profile.name, id: profile.id });

  const pagesData = await fetchPages(accessToken);
  const pages = pagesData.data || [];
  log.info("Pages found (IG flow)", { count: pages.length });

  if (pages.length === 0) {
    throw new Error("No Facebook Pages found. Your Instagram account must be linked to a Facebook Page to publish via this app.");
  }

  // Walk pages looking for the first one with a linked IG Business Account.
  let igAccount = null;
  let linkedPage = null;
  for (const page of pages) {
    try {
      const result = await httpsGet(
        `${GRAPH_BASE}/${page.id}?fields=instagram_business_account{id,username,profile_picture_url}&access_token=${page.access_token}`
      );
      if (result.instagram_business_account?.id) {
        igAccount = result.instagram_business_account;
        linkedPage = page;
        break;
      }
    } catch (e) {
      log.warn("Page IG lookup failed", { pageId: page.id, error: e.message });
    }
  }

  if (!igAccount || !linkedPage) {
    throw new Error("No Instagram Business Account is linked to any of your Facebook Pages. Link your Instagram account to a Page in Meta Business Suite first.");
  }

  log.info("Found linked IG account", { igId: igAccount.id, username: igAccount.username, pageId: linkedPage.id });

  return {
    platform: "Instagram",
    loginType: "facebook_login",
    openId: profile.id,
    accessToken: linkedPage.access_token, // page token authenticates IG publishing
    refreshToken: "",
    expiresAt: Date.now() + expiresIn * 1000,
    scope: scopes,
    displayName: igAccount.username || profile.name,
    avatarUrl: igAccount.profile_picture_url || profile.picture?.data?.url || "",
    igAccountId: igAccount.id,
    pageId: linkedPage.id,
    pageName: linkedPage.name,
  };
}

/**
 * Start the Facebook Page OAuth flow.
 */
// 5 minutes, not the 2 the other platforms use: the Meta dialog walks through
// page selection, the linked Instagram account and a permission review — with
// the #387 insight scopes it is several screens, and a timeout mid-way closes
// the callback port under the user (s249).
function startFacebookOAuthFlow(appId, appSecret, timeoutMs = 300000) {
  return runOAuthFlow({
    appId, appSecret, timeoutMs,
    scopes: FACEBOOK_SCOPES,
    finalizer: facebookFinalizer,
    scopeName: "facebook",
  });
}

/**
 * Start the Instagram (via Facebook Login) OAuth flow.
 */
function startInstagramOAuthFlow(appId, appSecret, timeoutMs = 300000) {
  return runOAuthFlow({
    appId, appSecret, timeoutMs,
    scopes: INSTAGRAM_SCOPES,
    finalizer: instagramFinalizer,
    scopeName: "instagram",
  });
}

/**
 * Exchange auth code for short-lived access token.
 */
async function exchangeCode(appId, appSecret, code) {
  const url = `${GRAPH_BASE}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${appSecret}&code=${code}`;
  return httpsGet(url);
}

/**
 * Exchange short-lived token for long-lived token (60 days).
 */
async function exchangeForLongLived(appId, appSecret, shortLivedToken) {
  const url = `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
  return httpsGet(url);
}

/**
 * Fetch user profile.
 */
async function fetchProfile(accessToken) {
  return httpsGet(`${GRAPH_BASE}/me?fields=id,name,picture&access_token=${accessToken}`);
}

/**
 * Fetch user's Facebook Pages (with page access tokens).
 */
async function fetchPages(accessToken) {
  return httpsGet(`${GRAPH_BASE}/me/accounts?access_token=${accessToken}`);
}

/**
 * Refresh a long-lived token (must be done before 60-day expiry).
 */
async function refreshLongLivedToken(appId, appSecret, currentToken) {
  const url = `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`;
  return httpsGet(url);
}

module.exports = {
  startFacebookOAuthFlow,
  startInstagramOAuthFlow,
  refreshLongLivedToken,
  fetchPages,
  REDIRECT_URI,
  GRAPH_API_VERSION,
};
