/**
 * Instagram Business Login OAuth flow for ClipFlow.
 *
 * Uses an Electron BrowserWindow to intercept the OAuth redirect.
 * No local server needed — the redirect is caught before it hits the network,
 * which means HTTPS redirect URIs work without needing a real HTTPS server.
 *
 * Flow:
 *   1. Open BrowserWindow → instagram.com/oauth/authorize
 *   2. User logs in and grants permissions
 *   3. Instagram redirects to https://localhost:8084/callback?code=...
 *   4. BrowserWindow intercepts the redirect, extracts the code
 *   5. Exchange code for short-lived token (via api.instagram.com)
 *   6. Exchange for long-lived token (60 days, via graph.instagram.com)
 *   7. Fetch user profile (username, account type, profile pic)
 *   8. Return complete account data
 *
 * Scopes: instagram_business_basic, instagram_business_content_publish
 * Token host: graph.instagram.com (NOT graph.facebook.com)
 */
const https = require("https");
const { URL } = require("url");
const { BrowserWindow } = require("electron");
const log = require("electron-log/main").scope("instagram-oauth");

const IG_API_VERSION = "v21.0";
const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const IG_GRAPH_BASE = `https://graph.instagram.com/${IG_API_VERSION}`;
const REDIRECT_URI = "https://localhost:8084/callback";

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
 * Opens a BrowserWindow and intercepts the redirect to extract the auth code.
 *
 * @param {string} appId - Instagram App ID
 * @param {string} appSecret - Instagram App Secret
 * @param {number} [timeoutMs=120000]
 * @returns {Promise<object>} Account data
 */
function startOAuthFlow(appId, appSecret, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutHandle = null;

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      fn();
    };

    // Create auth window
    const authWin = new BrowserWindow({
      width: 520,
      height: 750,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
      autoHideMenuBar: true,
      title: "Connect Instagram — ClipFlow",
    });

    // Intercept ALL requests — catch the redirect before it hits the network
    authWin.webContents.session.webRequest.onBeforeRequest(
      { urls: ["https://localhost:8084/*"] },
      (details, callback) => {
        const url = new URL(details.url);
        if (url.pathname === "/callback") {
          callback({ cancel: true }); // Don't actually navigate to localhost

          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");
          const errorDescription = url.searchParams.get("error_description");

          if (error) {
            authWin.close();
            settle(() => reject(new Error(`Instagram auth error: ${errorDescription || error}`)));
            return;
          }

          if (!code) {
            authWin.close();
            settle(() => reject(new Error("No authorization code received from Instagram")));
            return;
          }

          log.info("Got auth code from redirect, exchanging for token...");
          authWin.close();

          // Exchange code for tokens
          handleAuthCode(appId, appSecret, code)
            .then((accountData) => settle(() => resolve(accountData)))
            .catch((err) => settle(() => reject(err)));
        } else {
          callback({});
        }
      }
    );

    // Handle window close before auth completes
    authWin.on("closed", () => {
      settle(() => reject(new Error("Instagram auth window was closed before completing.")));
    });

    // Build and load the auth URL
    const authUrl = new URL(AUTH_URL);
    authUrl.searchParams.set("client_id", appId);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("enable_fb_login", "0");
    authUrl.searchParams.set("force_authentication", "1");

    log.info("Opening Instagram auth window");
    authWin.loadURL(authUrl.toString());

    // Timeout
    timeoutHandle = setTimeout(() => {
      if (!authWin.isDestroyed()) authWin.close();
      settle(() => reject(new Error("Instagram authorization timed out. Please try again.")));
    }, timeoutMs);
  });
}

/**
 * Handle the auth code: exchange for tokens, fetch profile.
 */
async function handleAuthCode(appId, appSecret, code) {
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
  const expiresIn = longLived.expires_in || 5184000;
  log.info("Long-lived token obtained", { expiresIn });

  // Step 3: Fetch user profile
  log.info("Fetching profile...");
  const profile = await fetchProfile(accessToken);
  if (profile.error) {
    throw new Error(profile.error.message || "Failed to fetch profile");
  }

  log.info("Profile fetched", { username: profile.username, accountType: profile.account_type });

  return {
    platform: "Instagram",
    loginType: "instagram_business_login",
    openId: igUserId,
    accessToken,
    refreshToken: "",
    expiresAt: Date.now() + expiresIn * 1000,
    scope: SCOPES,
    displayName: profile.username || `IG ${igUserId}`,
    avatarUrl: profile.profile_picture_url || "",
    igAccountId: igUserId,
    username: profile.username || "",
    accountType: profile.account_type || "",
  };
}

/**
 * Exchange auth code for short-lived token.
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
 */
async function refreshLongLivedToken(accessToken) {
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${accessToken}`;
  return httpsGet(url);
}

module.exports = {
  startOAuthFlow,
  refreshLongLivedToken,
  REDIRECT_URI,
  IG_API_VERSION,
  IG_GRAPH_BASE,
};
