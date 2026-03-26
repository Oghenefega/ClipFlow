/**
 * Instagram Business Login OAuth flow for ClipFlow.
 *
 * Separate from Facebook Login — lets users connect Instagram Business/Creator
 * accounts directly without needing a linked Facebook Page.
 *
 * Flow:
 *   1. Start local HTTP server on port 8084
 *   2. Open Instagram auth dialog in system browser
 *   3. Intercept callback to extract auth code
 *   4. Exchange code for short-lived token (via api.instagram.com)
 *   5. Exchange for long-lived token (60 days, via graph.instagram.com)
 *   6. Fetch user profile (username, account type, profile pic)
 *   7. Return complete account data
 *
 * Scopes: instagram_business_basic, instagram_business_content_publish
 * Token host: graph.instagram.com (NOT graph.facebook.com)
 */
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { shell } = require("electron");
const log = require("electron-log/main").scope("instagram-oauth");

const IG_API_VERSION = "v21.0";
const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const IG_GRAPH_BASE = `https://graph.instagram.com/${IG_API_VERSION}`;
const CALLBACK_PORT = 8084;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;

const SCOPES = "instagram_business_basic,instagram_business_content_publish";

// ── HTTP helpers ──

function httpsPost(url, formData) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = new URLSearchParams(formData).toString();
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Instagram token response: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Instagram response: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Start the Instagram Business Login OAuth flow.
 *
 * @param {string} appId - Meta App ID (same app, different login product)
 * @param {string} appSecret - Meta App Secret
 * @param {number} [timeoutMs=120000]
 * @returns {Promise<object>} Account data
 */
function startOAuthFlow(appId, appSecret, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let timeoutHandle = null;
    let server = null;
    let settled = false;

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
      const error = reqUrl.searchParams.get("error");
      const errorDescription = reqUrl.searchParams.get("error_description");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(buildCallbackPage(false, `Error: ${errorDescription || error}`));
        settle(() => reject(new Error(`Instagram auth error: ${errorDescription || error}`)));
        return;
      }

      if (!code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(buildCallbackPage(false, "No authorization code received"));
        settle(() => reject(new Error("No authorization code received from Instagram")));
        return;
      }

      try {
        log.info("Got auth code, exchanging for short-lived token...");

        // Step 1: Exchange code for short-lived token
        const shortLived = await exchangeCode(appId, appSecret, code);
        if (shortLived.error_type || shortLived.error_message) {
          throw new Error(shortLived.error_message || shortLived.error_type);
        }
        if (!shortLived.access_token) {
          throw new Error("No access token in response");
        }

        const igUserId = String(shortLived.user_id);
        log.info("Got short-lived token", { igUserId });

        // Step 2: Exchange for long-lived token (60 days)
        log.info("Exchanging for long-lived token...");
        const longLived = await exchangeForLongLived(appSecret, shortLived.access_token);
        if (longLived.error) {
          throw new Error(longLived.error.message || JSON.stringify(longLived.error));
        }

        const accessToken = longLived.access_token;
        const expiresIn = longLived.expires_in || 5184000; // 60 days default
        log.info("Long-lived token obtained", { expiresIn });

        // Step 3: Fetch user profile
        log.info("Fetching profile...");
        const profile = await fetchProfile(accessToken);
        if (profile.error) {
          throw new Error(profile.error.message || "Failed to fetch profile");
        }

        log.info("Profile fetched", { username: profile.username, accountType: profile.account_type });

        const accountData = {
          platform: "Instagram",
          loginType: "instagram_business_login", // distinguishes from FB Login IG accounts
          openId: igUserId,
          accessToken,
          refreshToken: "", // IG long-lived tokens are refreshed, not via refresh_token
          expiresAt: Date.now() + expiresIn * 1000,
          scope: SCOPES,
          displayName: profile.username || `IG ${igUserId}`,
          avatarUrl: profile.profile_picture_url || "",
          igAccountId: igUserId, // same as user_id for IG Business Login
          username: profile.username || "",
          accountType: profile.account_type || "",
        };

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(buildCallbackPage(true, `Connected as @${profile.username || igUserId}!`));
        settle(() => resolve(accountData));
      } catch (err) {
        log.error("OAuth error", { error: err.message });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(buildCallbackPage(false, err.message));
        settle(() => reject(err));
      }
    });

    server.listen(CALLBACK_PORT, "127.0.0.1", () => {
      log.info("Callback server listening", { port: CALLBACK_PORT });

      const authUrl = new URL(AUTH_URL);
      authUrl.searchParams.set("client_id", appId);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("enable_fb_login", "0");
      authUrl.searchParams.set("force_authentication", "1");

      log.info("Opening system browser for Instagram auth");
      shell.openExternal(authUrl.toString());
    });

    server.on("error", (err) => {
      settle(() => reject(new Error(`Instagram OAuth server error: ${err.message}`)));
    });

    timeoutHandle = setTimeout(() => {
      settle(() => reject(new Error("Instagram authorization timed out. Please try again.")));
    }, timeoutMs);
  });
}

/**
 * Exchange auth code for short-lived token.
 * POST to api.instagram.com/oauth/access_token
 */
async function exchangeCode(appId, appSecret, code) {
  return httpsPost(TOKEN_URL, {
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    code,
  });
}

/**
 * Exchange short-lived token for long-lived token (60 days).
 * GET graph.instagram.com/access_token
 */
async function exchangeForLongLived(appSecret, shortLivedToken) {
  const url = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`;
  return httpsGet(url);
}

/**
 * Fetch Instagram user profile.
 */
async function fetchProfile(accessToken) {
  return httpsGet(`${IG_GRAPH_BASE}/me?fields=user_id,username,account_type,profile_picture_url&access_token=${accessToken}`);
}

/**
 * Refresh a long-lived Instagram token (must be done before 60-day expiry).
 * Returns a new long-lived token valid for another 60 days.
 */
async function refreshLongLivedToken(accessToken) {
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${accessToken}`;
  return httpsGet(url);
}

function buildCallbackPage(success, message) {
  const color = success ? "#10B981" : "#EF4444";
  const icon = success
    ? '<circle cx="50" cy="50" r="45" stroke="#10B981" stroke-width="3" fill="none"/><path d="M30 50 L45 65 L70 35" stroke="#10B981" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<circle cx="50" cy="50" r="45" stroke="#EF4444" stroke-width="3" fill="none"/><path d="M35 35 L65 65 M65 35 L35 65" stroke="#EF4444" stroke-width="3" fill="none" stroke-linecap="round"/>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ClipFlow — Instagram</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e0e0e0}
.card{background:#1a1a1a;border:1px solid #333;border-radius:16px;padding:48px;text-align:center;max-width:400px}
svg{width:80px;height:80px;margin-bottom:16px}
h1{font-size:24px;color:${color};margin:0 0 8px}
p{font-size:14px;color:#888;margin:0}</style></head>
<body><div class="card"><svg viewBox="0 0 100 100">${icon}</svg>
<h1>${success ? "Connected!" : "Connection Failed"}</h1>
<p>${message}${success ? " You can close this tab." : ""}</p></div></body></html>`;
}

module.exports = {
  startOAuthFlow,
  refreshLongLivedToken,
  REDIRECT_URI,
  IG_API_VERSION,
  IG_GRAPH_BASE,
};
