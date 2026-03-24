/**
 * Meta OAuth 2.0 flow for ClipFlow (Facebook Login for Business).
 *
 * Single OAuth flow covers both Instagram and Facebook publishing.
 * Uses localhost callback server + system browser (same pattern as YouTube).
 *
 * Flow:
 *   1. Start local HTTP server on port 8083
 *   2. Open Facebook auth dialog in system browser
 *   3. Intercept callback to extract auth code
 *   4. Exchange code for short-lived token
 *   5. Exchange short-lived for long-lived token (60 days)
 *   6. Fetch user profile, Pages, and Instagram Business Account
 *   7. Return complete account data
 */
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { shell } = require("electron");

const GRAPH_API_VERSION = "v21.0";
const AUTH_URL = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const CALLBACK_PORT = 8083;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;

// Scopes for both Instagram + Facebook Page publishing
const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
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

/**
 * Start the Meta OAuth flow.
 * Opens BrowserWindow, intercepts redirect, exchanges code, fetches profile + pages.
 *
 * @param {string} appId - Meta App ID
 * @param {string} appSecret - Meta App Secret
 * @param {number} [timeoutMs=120000] - Timeout for auth (2 minutes)
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

    // Start local callback server
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
        settle(() => reject(new Error(`Meta auth error: ${errorDescription || error}`)));
        return;
      }

      if (!code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(buildCallbackPage(false, "No authorization code received"));
        settle(() => reject(new Error("No authorization code received from Meta")));
        return;
      }

      try {
        console.log("[Meta OAuth] Got auth code, exchanging for token...");

        // Step 1: Exchange code for short-lived token
        const shortLived = await exchangeCode(appId, appSecret, code);
        if (shortLived.error) {
          throw new Error(shortLived.error.message || JSON.stringify(shortLived.error));
        }

        console.log("[Meta OAuth] Got short-lived token, exchanging for long-lived...");

        // Step 2: Exchange for long-lived token (60 days)
        const longLived = await exchangeForLongLived(appId, appSecret, shortLived.access_token);
        if (longLived.error) {
          throw new Error(longLived.error.message || JSON.stringify(longLived.error));
        }

        const accessToken = longLived.access_token;
        const expiresIn = longLived.expires_in || 5184000; // 60 days default
        console.log(`[Meta OAuth] Long-lived token obtained, expires in ${expiresIn}s`);

        // Step 3: Fetch user profile
        console.log("[Meta OAuth] Fetching user profile...");
        const profile = await fetchProfile(accessToken);
        console.log(`[Meta OAuth] User: ${profile.name} (ID: ${profile.id})`);

        // Step 4: Fetch Pages and Instagram Business Account
        console.log("[Meta OAuth] Fetching Pages and Instagram accounts...");
        const pagesData = await fetchPages(accessToken);
        const pages = pagesData.data || [];
        console.log(`[Meta OAuth] Found ${pages.length} Page(s)`);

        let igAccountId = null;
        let pageId = null;
        let pageName = null;
        let pageAccessToken = null;

        for (const page of pages) {
          pageId = page.id;
          pageName = page.name;
          pageAccessToken = page.access_token;

          // Check for linked Instagram Business Account
          const igData = await fetchInstagramAccount(pageId, accessToken);
          if (igData.instagram_business_account) {
            igAccountId = igData.instagram_business_account.id;
            console.log(`[Meta OAuth] Instagram Business Account: ${igAccountId} (via Page: ${pageName})`);
            break;
          }
        }

        if (!igAccountId) {
          console.log("[Meta OAuth] No Instagram Business Account found. Facebook Page publishing will still work.");
        }

        const accountData = {
          platform: "Meta",
          openId: profile.id,
          accessToken,
          refreshToken: "", // Meta long-lived tokens don't have refresh tokens — they're re-exchanged
          expiresAt: Date.now() + expiresIn * 1000,
          scope: SCOPES,
          displayName: profile.name,
          avatarUrl: profile.picture?.data?.url || "",
          // Meta-specific fields stored alongside
          igAccountId: igAccountId || "",
          pageId: pageId || "",
          pageName: pageName || "",
          pageAccessToken: pageAccessToken || "",
        };

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(buildCallbackPage(true, `Connected as ${profile.name}!`));
        settle(() => resolve(accountData));
      } catch (err) {
        console.error("[Meta OAuth] Error:", err);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(buildCallbackPage(false, err.message));
        settle(() => reject(err));
      }
    });

    server.listen(CALLBACK_PORT, "127.0.0.1", () => {
      console.log(`[Meta OAuth] Callback server listening on port ${CALLBACK_PORT}`);

      // Build the authorization URL and open in system browser
      const authUrl = new URL(AUTH_URL);
      authUrl.searchParams.set("client_id", appId);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("response_type", "code");

      console.log("[Meta OAuth] Opening system browser for auth...");
      shell.openExternal(authUrl.toString());
    });

    server.on("error", (err) => {
      settle(() => reject(new Error(`Meta OAuth server error: ${err.message}`)));
    });

    // Timeout
    timeoutHandle = setTimeout(() => {
      settle(() => reject(new Error("Meta authorization timed out. Please try again.")));
    }, timeoutMs);
  });
}

/**
 * Build the HTML page shown after OAuth callback.
 */
function buildCallbackPage(success, message) {
  const color = success ? "#10B981" : "#EF4444";
  const icon = success
    ? '<circle cx="50" cy="50" r="45" stroke="#10B981" stroke-width="3" fill="none"/><path d="M30 50 L45 65 L70 35" stroke="#10B981" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<circle cx="50" cy="50" r="45" stroke="#EF4444" stroke-width="3" fill="none"/><path d="M35 35 L65 65 M65 35 L35 65" stroke="#EF4444" stroke-width="3" fill="none" stroke-linecap="round"/>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ClipFlow — Meta</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e0e0e0}
.card{background:#1a1a1a;border:1px solid #333;border-radius:16px;padding:48px;text-align:center;max-width:400px}
svg{width:80px;height:80px;margin-bottom:16px}
h1{font-size:24px;color:${color};margin:0 0 8px}
p{font-size:14px;color:#888;margin:0}</style></head>
<body><div class="card"><svg viewBox="0 0 100 100">${icon}</svg>
<h1>${success ? "Connected!" : "Connection Failed"}</h1>
<p>${message}${success ? " You can close this tab." : ""}</p></div></body></html>`;
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
 * Check if a Page has a linked Instagram Business Account.
 */
async function fetchInstagramAccount(pageId, accessToken) {
  return httpsGet(`${GRAPH_BASE}/${pageId}?fields=instagram_business_account&access_token=${accessToken}`);
}

/**
 * Refresh a long-lived token (must be done before 60-day expiry).
 * Returns a new long-lived token.
 */
async function refreshLongLivedToken(appId, appSecret, currentToken) {
  const url = `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`;
  return httpsGet(url);
}

module.exports = {
  startOAuthFlow,
  refreshLongLivedToken,
  REDIRECT_URI,
  GRAPH_API_VERSION,
};
