/**
 * Meta OAuth 2.0 flow for ClipFlow (Facebook Login for Business).
 *
 * Single OAuth flow covers both Instagram and Facebook publishing.
 * Uses BrowserWindow to intercept the redirect (Meta requires
 * https://www.facebook.com/connect/login_success.html for desktop apps).
 *
 * Flow:
 *   1. Opens Facebook auth dialog in a BrowserWindow
 *   2. Intercepts redirect to extract auth code
 *   3. Exchanges code for short-lived token
 *   4. Exchanges short-lived for long-lived token (60 days)
 *   5. Fetches user profile, Pages, and Instagram Business Account
 *   6. Returns complete account data
 */
const https = require("https");
const { URL } = require("url");
const { BrowserWindow } = require("electron");

const GRAPH_API_VERSION = "v21.0";
const AUTH_URL = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const REDIRECT_URI = "https://www.facebook.com/connect/login_success.html";

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
    let authWindow = null;
    let settled = false;

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (authWindow && !authWindow.isDestroyed()) {
        authWindow.close();
      }
      authWindow = null;
    };

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    // Build the authorization URL
    const authUrl = new URL(AUTH_URL);
    authUrl.searchParams.set("client_id", appId);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("response_type", "code");

    console.log("[Meta OAuth] Opening auth window...");

    // Open BrowserWindow for auth
    authWindow = new BrowserWindow({
      width: 600,
      height: 700,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    authWindow.loadURL(authUrl.toString());

    // Intercept navigation to catch the redirect
    authWindow.webContents.on("will-redirect", async (event, redirectUrl) => {
      handleRedirect(redirectUrl);
    });

    authWindow.webContents.on("will-navigate", async (event, navUrl) => {
      handleRedirect(navUrl);
    });

    async function handleRedirect(url) {
      if (!url.startsWith(REDIRECT_URI)) return;

      const parsed = new URL(url);
      const code = parsed.searchParams.get("code");
      const error = parsed.searchParams.get("error");
      const errorDescription = parsed.searchParams.get("error_description");

      if (error) {
        settle(() => reject(new Error(`Meta auth error: ${errorDescription || error}`)));
        return;
      }

      if (!code) {
        settle(() => reject(new Error("No authorization code received from Meta")));
        return;
      }

      try {
        console.log("[Meta OAuth] Got auth code, exchanging for token...");

        // Step 1: Exchange code for short-lived token
        const shortLived = await exchangeCode(appId, appSecret, code);
        if (shortLived.error) {
          throw new Error(shortLived.error.message || shortLived.error);
        }

        console.log("[Meta OAuth] Got short-lived token, exchanging for long-lived...");

        // Step 2: Exchange for long-lived token (60 days)
        const longLived = await exchangeForLongLived(appId, appSecret, shortLived.access_token);
        if (longLived.error) {
          throw new Error(longLived.error.message || longLived.error);
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

        settle(() => resolve(accountData));
      } catch (err) {
        console.error("[Meta OAuth] Error:", err);
        settle(() => reject(err));
      }
    }

    // Window closed by user
    authWindow.on("closed", () => {
      authWindow = null;
      settle(() => reject(new Error("Meta authorization window was closed")));
    });

    // Timeout
    timeoutHandle = setTimeout(() => {
      settle(() => reject(new Error("Meta authorization timed out. Please try again.")));
    }, timeoutMs);
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
