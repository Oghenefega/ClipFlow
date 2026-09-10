// #387: the pure half of the Analytics refresh. Pins three contracts the
// refresh depends on but that nothing else in the app exercises:
//   1. Facebook's tracker postId is the Reels POST id; video_insights wants the
//      VIDEO id, which only the url (or the publish log) carries.
//   2. Freshness: daily, weekly once a clip is a month old.
//   3. The insight-scope gate reads the scope string the OAuth flows persist.
const {
  hasInsightsScope,
  resolveFacebookVideo,
  buildTargets,
  needsRefresh,
} = require("../analytics-core");

const DAY = 24 * 60 * 60 * 1000;

describe("hasInsightsScope", () => {
  test("YouTube never needs a reconnect", () => {
    expect(hasInsightsScope({ platform: "YouTube", scope: "https://www.googleapis.com/auth/youtube.upload" })).toBe(true);
  });
  test("a pre-#387 Instagram connection lacks the insights scope", () => {
    expect(hasInsightsScope({ platform: "Instagram", scope: "pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish,business_management" })).toBe(false);
  });
  test("a reconnected Facebook page carries both new scopes", () => {
    expect(hasInsightsScope({ platform: "Facebook", scope: "pages_show_list,pages_read_engagement,pages_manage_posts,business_management,read_insights,pages_manage_engagement" })).toBe(true);
    expect(hasInsightsScope({ platform: "Facebook", scope: "pages_show_list,read_insights" })).toBe(false);
  });
  test("TikTok has nothing to check", () => {
    expect(hasInsightsScope({ platform: "TikTok", scope: "user.info.basic,video.publish" })).toBeNull();
  });
});

describe("resolveFacebookVideo", () => {
  // Real shape from the prod tracker: postId ≠ the id in the url.
  const reel = { platform: "facebook", accountId: "fb_1", postId: "1120034750685326", url: "https://www.facebook.com/reel/1378511597720956" };

  test("prefers the video id from the /reel/ url", () => {
    expect(resolveFacebookVideo(reel, "c1", [])).toEqual({ videoId: "1378511597720956", surface: "reels" });
  });
  test("falls back to the publish log's publishId when the url is missing", () => {
    const logs = [
      { clipId: "c1", platform: "Facebook", status: "failed", publishId: "999" },
      { clipId: "c1", platform: "Facebook", status: "success", publishId: "555", surface: "reels" },
    ];
    expect(resolveFacebookVideo({ platform: "facebook", postId: "1" }, "c1", logs)).toEqual({ videoId: "555", surface: "reels" });
  });
  test("treats a bare postId as a legacy video id", () => {
    expect(resolveFacebookVideo({ platform: "facebook", postId: "42" }, "c9", [])).toEqual({ videoId: "42", surface: "video" });
  });
  test("returns null when there is nothing to query", () => {
    expect(resolveFacebookVideo({ platform: "facebook", accountId: "fb_1" }, "c9", [])).toBeNull();
  });
});

describe("buildTargets", () => {
  const rows = [
    {
      clipId: "c1", date: "2026-09-01",
      platformResults: [
        { platform: "youtube", postId: "yt1", url: "https://www.youtube.com/watch?v=yt1" },
        { platform: "instagram", postId: "ig1" },
        { platform: "facebook", postId: "post1", url: "https://www.facebook.com/reel/7001" },
        { platform: "tiktok", accountId: "tiktok_x" },
      ],
    },
    { clipId: "c1", date: "2026-09-02", platformResults: [{ platform: "youtube", postId: "dupe" }] },
    { clipId: "", date: "2026-09-03", platformResults: [{ platform: "youtube", postId: "manual" }] },
  ];
  test("one target per platform with an id, first row per clip wins, TikTok skipped", () => {
    const t = buildTargets(rows, []);
    expect(t).toEqual([
      { clipId: "c1", platform: "youtube", postId: "yt1", date: "2026-09-01" },
      { clipId: "c1", platform: "instagram", postId: "ig1", date: "2026-09-01" },
      { clipId: "c1", platform: "facebook", postId: "7001", surface: "reels", date: "2026-09-01" },
    ]);
  });
});

describe("needsRefresh", () => {
  const now = Date.parse("2026-09-10T12:00:00Z");
  const iso = (msAgo) => new Date(now - msAgo).toISOString();

  test("never fetched → fetch", () => {
    expect(needsRefresh({ date: "2026-09-09" }, undefined, now)).toBe(true);
  });
  test("fetched an hour ago → skip", () => {
    expect(needsRefresh({ date: "2026-09-09" }, { fetched_at: iso(60 * 60 * 1000) }, now)).toBe(false);
  });
  test("a recent clip fetched two days ago → fetch", () => {
    expect(needsRefresh({ date: "2026-09-01" }, { fetched_at: iso(2 * DAY) }, now)).toBe(true);
  });
  test("a clip older than a month fetched two days ago → skip, eight days ago → fetch", () => {
    expect(needsRefresh({ date: "2026-06-01" }, { fetched_at: iso(2 * DAY) }, now)).toBe(false);
    expect(needsRefresh({ date: "2026-06-01" }, { fetched_at: iso(8 * DAY) }, now)).toBe(true);
  });
});
