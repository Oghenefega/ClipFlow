/**
 * Encrypted token storage for OAuth credentials.
 * Uses Electron's safeStorage (DPAPI on Windows) to encrypt tokens at rest.
 * Stored in a separate electron-store file from general app settings.
 *
 * init() must be awaited during main-process bootstrap before any exported
 * function is called. All exported functions close over `tokenStore` and
 * are only invoked from IPC handlers that fire after bootstrap finishes.
 */
const { createStore } = require("./store-factory");
const { safeStorage } = require("electron");

const PLATFORM_ABBR = {
  TikTok: "TT",
  YouTube: "YT",
  Instagram: "IG",
  Facebook: "FB",
  X: "X",
  Kick: "KK",
};

let tokenStore = null;

async function init() {
  tokenStore = await createStore({
    name: "clipflow-tokens",
    defaults: {
      accounts: {},
    },
  });
}

/**
 * Encrypt a string using safeStorage (OS-level encryption).
 * Falls back to base64 if safeStorage isn't available.
 */
function encrypt(value) {
  if (!value) return "";
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString("base64");
  }
  // Fallback: base64 (not truly secure, but better than plaintext)
  return Buffer.from(value).toString("base64");
}

/**
 * Decrypt a string encrypted with safeStorage.
 */
function decrypt(value) {
  if (!value) return "";
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value, "base64"));
    } catch {
      // If decryption fails (e.g., key rotated), return empty
      return "";
    }
  }
  // Fallback: base64 decode
  try {
    return Buffer.from(value, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * Save an OAuth account with encrypted tokens.
 * @param {string} id - Unique account ID (e.g., "tiktok_<openId>")
 * @param {object} data - { platform, openId, accessToken, refreshToken, expiresAt, scope, displayName, avatarUrl }
 */
function saveAccount(id, data) {
  const accounts = tokenStore.get("accounts") || {};
  const entry = {
    platform: data.platform,
    openId: data.openId || "",
    accessToken: encrypt(data.accessToken),
    refreshToken: encrypt(data.refreshToken || ""),
    expiresAt: data.expiresAt || 0,
    scope: data.scope || "",
    displayName: data.displayName || "",
    avatarUrl: data.avatarUrl || "",
    connectedAt: data.connectedAt || new Date().toISOString(),
  };
  // Meta-specific fields (Instagram + Facebook)
  if (data.igAccountId) entry.igAccountId = data.igAccountId;
  if (data.pageId) entry.pageId = data.pageId;
  if (data.pageName) entry.pageName = data.pageName;
  if (data.pageAccessToken) entry.pageAccessToken = encrypt(data.pageAccessToken);
  // YouTube-specific fields
  if (data.channelId) entry.channelId = data.channelId;
  accounts[id] = entry;
  tokenStore.set("accounts", accounts);
}

/**
 * Get a single account with decrypted tokens.
 */
function getAccount(id) {
  const accounts = tokenStore.get("accounts") || {};
  const acct = accounts[id];
  if (!acct) return null;
  return {
    ...acct,
    id,
    accessToken: decrypt(acct.accessToken),
    refreshToken: decrypt(acct.refreshToken),
    pageAccessToken: acct.pageAccessToken ? decrypt(acct.pageAccessToken) : "",
  };
}

/**
 * Get all accounts (tokens decrypted).
 */
function getAllAccounts() {
  const accounts = tokenStore.get("accounts") || {};
  return Object.entries(accounts).map(([id, acct]) => ({
    ...acct,
    id,
    accessToken: decrypt(acct.accessToken),
    refreshToken: decrypt(acct.refreshToken),
  }));
}

/**
 * Get all accounts as platform entries (for UI — no tokens exposed).
 * Returns array compatible with the platforms[] shape used by QueueView.
 */
function getAccountsForUI() {
  const accounts = tokenStore.get("accounts") || {};
  return Object.entries(accounts).map(([id, acct]) => ({
    key: id,
    platform: acct.platform,
    abbr: PLATFORM_ABBR[acct.platform] || acct.platform.substring(0, 2).toUpperCase(),
    name: acct.displayName || "Unknown",
    displayName: acct.displayName || "Unknown",
    avatarUrl: acct.avatarUrl || "",
    connected: true,
    openId: acct.openId || "",
    connectedAt: acct.connectedAt || "",
    // Meta-specific (no tokens exposed)
    igAccountId: acct.igAccountId || "",
    pageId: acct.pageId || "",
    pageName: acct.pageName || "",
    // YouTube-specific
    channelId: acct.channelId || "",
  }));
}

/**
 * Remove an account.
 */
function removeAccount(id) {
  const accounts = tokenStore.get("accounts") || {};
  delete accounts[id];
  tokenStore.set("accounts", accounts);
}

/**
 * Update tokens for an account (e.g., after refresh).
 */
function updateTokens(id, accessToken, refreshToken, expiresAt) {
  const accounts = tokenStore.get("accounts") || {};
  if (!accounts[id]) return false;
  accounts[id].accessToken = encrypt(accessToken);
  if (refreshToken) accounts[id].refreshToken = encrypt(refreshToken);
  if (expiresAt) accounts[id].expiresAt = expiresAt;
  tokenStore.set("accounts", accounts);
  return true;
}

module.exports = {
  init,
  saveAccount,
  getAccount,
  getAllAccounts,
  getAccountsForUI,
  removeAccount,
  updateTokens,
  PLATFORM_ABBR,
};
