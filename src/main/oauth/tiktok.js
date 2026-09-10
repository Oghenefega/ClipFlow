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
const log = require("electron-log/main").scope("tiktok");
const { renderResultPage } = require("./result-page");
const { TIKTOK_AUTH_SCOPE } = require("../analytics-core");

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
  // TikTok uses HEX-encoded SHA256 for code_challenge (non-standard, differs from RFC 7636)
  const challenge = crypto.createHash("sha256").update(verifier).digest("hex");
  log.debug("PKCE generated", { verifierLength: verifier.length, challengeLength: challenge.length });
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
        const html = renderResultPage({ ok: false, platform: "TikTok", reason: errorDescription || error });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        cleanup();
        reject(new Error(`TikTok auth error: ${errorDescription || error}`));
        return;
      }

      if (!code) {
        const html = renderResultPage({ ok: false, platform: "TikTok", reason: "TikTok did not send back a sign-in code." });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        cleanup();
        reject(new Error("No authorization code received"));
        return;
      }

      if (returnedState !== state) {
        const html = renderResultPage({ ok: false, platform: "TikTok", reason: "The sign-in that came back was not the one Corva started. Nothing was saved." });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        cleanup();
        reject(new Error("OAuth state mismatch"));
        return;
      }

      try {
        // Exchange code for tokens (with PKCE code_verifier)
        log.info("Exchanging auth code for tokens...");
        const tokenData = await exchangeCode(clientKey, clientSecret, code, pkce.verifier);
        log.debug("Token exchange response", { tokenData });

        if (tokenData.error || !tokenData.access_token) {
          const errMsg = tokenData.error_description || tokenData.error || "Token exchange failed";
          const html = renderResultPage({ ok: false, platform: "TikTok", reason: `Token exchange failed: ${errMsg}` });
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
          cleanup();
          reject(new Error(errMsg));
          return;
        }

        // Fetch user profile
        log.info("Fetching user profile...");
        const profile = await fetchUserProfile(tokenData.access_token);
        log.debug("User profile response", { profile });

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

        const html = renderResultPage({ ok: true, platform: "TikTok", account: displayName });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        cleanup();
        resolve(accountData);
      } catch (err) {
        log.error("Error during token exchange", { error: err.message });
        const html = renderResultPage({ ok: false, platform: "TikTok", reason: err.message });
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
      log.info("Callback server listening", { port: CALLBACK_PORT });

      // Build the TikTok authorization URL (with PKCE)
      const authUrl = new URL(TIKTOK_AUTH_URL);
      authUrl.searchParams.set("client_key", clientKey);
      authUrl.searchParams.set("scope", TIKTOK_AUTH_SCOPE); // #388: adds video.list once TikTok views are switched on
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", pkce.challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      log.info("Opening browser for auth");
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
 * TikTok's /v2/oauth/token/ requires client_secret for every grant type, including refresh_token.
 */
async function refreshAccessToken(clientKey, clientSecret, refreshToken) {
  return httpsPost(TIKTOK_TOKEN_URL, {
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}


module.exports = {
  startOAuthFlow,
  refreshAccessToken,
  REDIRECT_URI,
  CALLBACK_PORT,
};
