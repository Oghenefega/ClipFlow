/**
 * Platform publishing stubs — real API integration is a future project.
 * Each function returns a structured result for the Queue view to display.
 */

async function publishToYouTube(clipData, accountData, options = {}) {
  return {
    success: false,
    error: "YouTube API integration not yet implemented",
    platform: "YouTube",
    account: accountData?.name || "unknown",
  };
}

async function publishToTikTok(clipData, accountData, options = {}) {
  return {
    success: false,
    error: "TikTok API integration not yet implemented",
    platform: "TikTok",
    account: accountData?.name || "unknown",
  };
}

async function publishToInstagram(clipData, accountData, options = {}) {
  return {
    success: false,
    error: "Instagram API integration not yet implemented",
    platform: "Instagram",
    account: accountData?.name || "unknown",
  };
}

async function publishToFacebook(clipData, accountData, options = {}) {
  return {
    success: false,
    error: "Facebook API integration not yet implemented",
    platform: "Facebook",
    account: accountData?.name || "unknown",
  };
}

module.exports = {
  publishToYouTube,
  publishToTikTok,
  publishToInstagram,
  publishToFacebook,
};
