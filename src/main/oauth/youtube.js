/**
 * YouTube / Google OAuth 2.0 flow for ClipFlow.
 *
 * Uses loopback redirect (http://127.0.0.1:{port}) with PKCE (S256).
 * Google supports this natively for desktop apps.
 *
 * Flow:
 *   1. Start local HTTP server on a random port
 *   2. Open Google auth URL in system browser
 *   3. Intercept callback, exchange code for tokens
 *   4. Fetch YouTube channel info
 *   5. Return account data
 */
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { URL } = require("url");
const { shell } = require("electron");
const log = require("electron-log/main").scope("youtube");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const YT_API_BASE = "https://www.googleapis.com/youtube/v3";
const CALLBACK_PORT = 8082;

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

// ── HTTP helpers ──

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
          reject(new Error(`Failed to parse Google response: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

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
          reject(new Error(`Failed to parse Google response: ${data.substring(0, 500)}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Generate PKCE code verifier and challenge (S256, standard base64url per RFC 7636).
 */
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  log.debug("PKCE generated", { verifierLength: verifier.length, challengeLength: challenge.length });
  return { verifier, challenge };
}

function generateState(length = 32) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Start the YouTube/Google OAuth flow.
 *
 * @param {string} clientId - Google OAuth Client ID
 * @param {string} clientSecret - Google OAuth Client Secret
 * @param {number} [timeoutMs=120000] - Timeout (2 minutes)
 * @returns {Promise<object>} Account data
 */
function startOAuthFlow(clientId, clientSecret, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const state = generateState();
    const pkce = generatePKCE();
    let server = null;
    let timeoutHandle = null;

    const redirectUri = `http://127.0.0.1:${CALLBACK_PORT}`;

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (server) {
        try { server.close(); } catch (_) { /* ignore */ }
        server = null;
      }
    };

    server = http.createServer(async (req, res) => {
      const url = new URL(req.url, redirectUri);

      // Ignore favicon and other requests
      if (url.pathname !== "/" && url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        const html = buildResultPage(false, `Google authorization failed: ${error}`);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        cleanup();
        reject(new Error(`Google auth error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(buildResultPage(false, "No authorization code received."));
        cleanup();
        reject(new Error("No authorization code received"));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(buildResultPage(false, "State mismatch — possible CSRF attack."));
        cleanup();
        reject(new Error("OAuth state mismatch"));
        return;
      }

      try {
        log.info("Exchanging auth code for tokens...");
        const tokenData = await exchangeCode(clientId, clientSecret, code, pkce.verifier, redirectUri);
        log.debug("Token exchange response", { tokenData });

        if (tokenData.error || !tokenData.access_token) {
          throw new Error(tokenData.error_description || tokenData.error || "Token exchange failed");
        }

        // Fetch YouTube channel info
        log.info("Fetching channel info...");
        const channelData = await fetchChannelInfo(tokenData.access_token);
        const channel = channelData.items?.[0];
        if (!channel) {
          throw new Error("No YouTube channel found for this account");
        }

        const displayName = channel.snippet?.title || "YouTube Channel";
        const avatarUrl = channel.snippet?.thumbnails?.default?.url || "";
        const channelId = channel.id;

        log.info("Channel found", { displayName, channelId });

        const accountData = {
          platform: "YouTube",
          openId: channelId,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || "",
          expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
          scope: tokenData.scope || SCOPES,
          displayName,
          avatarUrl,
          channelId,
        };

        const html = buildResultPage(true, `Connected as ${displayName}! You can close this tab.`);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        cleanup();
        resolve(accountData);
      } catch (err) {
        log.error("OAuth error", { error: err.message });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(buildResultPage(false, `Error: ${err.message}`));
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

    server.listen(CALLBACK_PORT, "127.0.0.1", () => {
      log.info("Callback server listening", { host: "127.0.0.1", port: CALLBACK_PORT });

      const authUrl = new URL(AUTH_URL);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", pkce.challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");

      log.info("Opening browser for auth");
      shell.openExternal(authUrl.toString());
    });

    timeoutHandle = setTimeout(() => {
      cleanup();
      reject(new Error("YouTube authorization timed out. Please try again."));
    }, timeoutMs);
  });
}

/**
 * Exchange auth code for tokens.
 */
async function exchangeCode(clientId, clientSecret, code, codeVerifier, redirectUri) {
  return httpsPost(TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
}

/**
 * Fetch authenticated user's YouTube channel info.
 */
async function fetchChannelInfo(accessToken) {
  return httpsGet(`${YT_API_BASE}/channels?part=snippet&mine=true`, {
    Authorization: `Bearer ${accessToken}`,
  });
}

/**
 * Refresh an expired access token using the refresh token.
 */
async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  return httpsPost(TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

/**
 * Build HTML result page (same styling as TikTok).
 */
function buildResultPage(success, message) {
  const color = success ? "#34d399" : "#f87171";
  const icon = success ? "&#10003;" : "&#10007;";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ClipFlow — YouTube ${success ? "Connected" : "Error"}</title>
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
  CALLBACK_PORT,
};
