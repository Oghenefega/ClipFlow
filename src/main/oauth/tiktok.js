/**
 * TikTok OAuth 2.0 flow for ClipFlow.
 *
 * 1. Opens TikTok auth URL in system browser
 * 2. Spins up a temporary local HTTP server on port 8080 to catch the callback
 * 3. Exchanges the auth code for access + refresh tokens
 * 4. Fetches user profile (display name, avatar)
 * 5. Returns the complete account data
 *
 * Works with both sandbox and production TikTok APIs.
 */
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { URL } = require("url");
const { shell } = require("electron");

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const REDIRECT_URI = "http://localhost:8080/callback";
const CALLBACK_PORT = 8080;

/**
 * Make an HTTPS POST request and return parsed JSON.
 */
function httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = typeof body === "string" ? body : new URLSearchParams(body).toString();
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse TikTok response: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Make an HTTPS GET request with headers and return parsed JSON.
 */
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
          reject(new Error(`Failed to parse TikTok response: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Generate a random string for state/PKCE.
 */
function generateState(length = 32) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate PKCE code verifier and challenge (S256).
 * TikTok v2 requires PKCE for the authorization flow.
 */
function generatePKCE() {
  // code_verifier: 43-128 chars, base64url-encoded random bytes (RFC 7636)
  const verifier = crypto.randomBytes(32).toString("base64url");
  // code_challenge: base64url(sha256(verifier)) — use Node's native base64url
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  console.log("[TikTok OAuth] PKCE verifier length:", verifier.length, "challenge length:", challenge.length);
  return { verifier, challenge };
}

/**
 * Start the TikTok OAuth flow.
 * Opens browser, waits for callback, exchanges code, fetches profile.
 *
 * @param {string} clientKey - TikTok Client Key
 * @param {string} clientSecret - TikTok Client Secret
 * @param {number} [timeoutMs=120000] - Timeout for the callback (2 minutes)
 * @returns {Promise<object>} Account data: { openId, accessToken, refreshToken, expiresAt, displayName, avatarUrl, scope }
 */
function startOAuthFlow(clientKey, clientSecret, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const state = generateState();
    const pkce = generatePKCE();
    let server = null;
    let timeoutHandle = null;

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (server) {
        try { server.close(); } catch (_) { /* ignore */ }
        server = null;
      }
    };

    // Create local HTTP server to catch the callback
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      if (error) {
        const html = buildResultPage(false, `TikTok authorization failed: ${errorDescription || error}`);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        cleanup();
        reject(new Error(`TikTok auth error: ${errorDescription || error}`));
        return;
      }

      if (!code) {
        const html = buildResultPage(false, "No authorization code received from TikTok.");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        cleanup();
        reject(new Error("No authorization code received"));
        return;
      }

      if (returnedState !== state) {
        const html = buildResultPage(false, "State mismatch — possible CSRF attack. Authorization rejected.");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        cleanup();
        reject(new Error("OAuth state mismatch"));
        return;
      }

      try {
        // Exchange code for tokens (with PKCE code_verifier)
        console.log("[TikTok OAuth] Exchanging auth code for tokens...");
        const tokenData = await exchangeCode(clientKey, clientSecret, code, pkce.verifier);
        console.log("[TikTok OAuth] Token exchange response:", JSON.stringify(tokenData, null, 2));

        if (tokenData.error || !tokenData.access_token) {
          const errMsg = tokenData.error_description || tokenData.error || "Token exchange failed";
          const html = buildResultPage(false, `Token exchange failed: ${errMsg}`);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
          cleanup();
          reject(new Error(errMsg));
          return;
        }

        // Fetch user profile
        console.log("[TikTok OAuth] Fetching user profile...");
        const profile = await fetchUserProfile(tokenData.access_token);
        console.log("[TikTok OAuth] User profile response:", JSON.stringify(profile, null, 2));

        const userData = profile?.data?.user || {};
        const displayName = userData.display_name || userData.username || "TikTok User";
        const avatarUrl = userData.avatar_url || userData.avatar_url_100 || "";

        const accountData = {
          platform: "TikTok",
          openId: tokenData.open_id,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || "",
          expiresAt: Date.now() + (tokenData.expires_in || 86400) * 1000,
          scope: tokenData.scope || "user.info.basic",
          displayName,
          avatarUrl,
        };

        const html = buildResultPage(true, `Successfully connected as ${displayName}! You can close this tab.`);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        cleanup();
        resolve(accountData);
      } catch (err) {
        console.error("[TikTok OAuth] Error during token exchange:", err);
        const html = buildResultPage(false, `Error: ${err.message}`);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        cleanup();
        reject(err);
      }
    });

    server.on("error", (err) => {
      cleanup();
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${CALLBACK_PORT} is already in use. Close any other apps using it and try again.`));
      } else {
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT, () => {
      console.log(`[TikTok OAuth] Callback server listening on port ${CALLBACK_PORT}`);

      // Build the TikTok authorization URL (with PKCE)
      const authUrl = new URL(TIKTOK_AUTH_URL);
      authUrl.searchParams.set("client_key", clientKey);
      authUrl.searchParams.set("scope", "user.info.basic");
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", pkce.challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      console.log("[TikTok OAuth] Opening browser:", authUrl.toString());
      shell.openExternal(authUrl.toString());
    });

    // Timeout — user didn't complete auth in time
    timeoutHandle = setTimeout(() => {
      cleanup();
      reject(new Error("TikTok authorization timed out. Please try again."));
    }, timeoutMs);
  });
}

/**
 * Exchange authorization code for access token (with PKCE code_verifier).
 */
async function exchangeCode(clientKey, clientSecret, code, codeVerifier) {
  const body = {
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  };
  if (codeVerifier) body.code_verifier = codeVerifier;
  const response = await httpsPost(TIKTOK_TOKEN_URL, body);
  // TikTok v2 wraps response in a data object for some endpoints
  // but the token endpoint returns flat
  return response;
}

/**
 * Fetch basic user profile using access token.
 */
async function fetchUserProfile(accessToken) {
  const url = `${TIKTOK_USER_INFO_URL}?fields=open_id,display_name,avatar_url,avatar_url_100`;
  return httpsGet(url, {
    Authorization: `Bearer ${accessToken}`,
  });
}

/**
 * Refresh an expired access token.
 */
async function refreshAccessToken(clientKey, refreshToken) {
  return httpsPost(TIKTOK_TOKEN_URL, {
    client_key: clientKey,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

/**
 * Build a simple HTML page shown in the browser after OAuth callback.
 */
function buildResultPage(success, message) {
  const color = success ? "#34d399" : "#f87171";
  const icon = success ? "&#10003;" : "&#10007;";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ClipFlow — TikTok ${success ? "Connected" : "Error"}</title>
  <style>
    body {
      margin: 0; padding: 0;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
      background: #0a0b10; color: #edeef2;
      font-family: 'DM Sans', -apple-system, sans-serif;
    }
    .card {
      text-align: center; padding: 48px;
      background: #111218; border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.06);
      max-width: 420px;
    }
    .icon {
      font-size: 48px; color: ${color};
      width: 80px; height: 80px; line-height: 80px;
      border-radius: 50%; margin: 0 auto 24px;
      background: ${success ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)"};
      border: 2px solid ${color};
    }
    h2 { margin: 0 0 12px; font-size: 20px; }
    p { color: rgba(255,255,255,0.55); font-size: 14px; line-height: 1.5; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h2>${success ? "Connected!" : "Connection Failed"}</h2>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

module.exports = {
  startOAuthFlow,
  refreshAccessToken,
  REDIRECT_URI,
  CALLBACK_PORT,
};
