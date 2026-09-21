// #455: the frame picked in the Queue as the TikTok and Instagram cover. These pin the
// exact request bodies; the network calls themselves are not exercised.
jest.mock("electron-log/main", () => {
  const quiet = { info() {}, debug() {}, warn() {}, error() {} };
  return { scope: () => quiet };
});

const { buildPostInfo } = require("../oauth/tiktok-publish");
const { reelContainerBody } = require("../oauth/instagram-publish");

describe("TikTok post_info", () => {
  const base = { title: "T", privacy_level: "SELF_ONLY" };

  test("a pick is sent as video_cover_timestamp_ms", () => {
    expect(buildPostInfo({ ...base, video_cover_timestamp_ms: 2000 }).video_cover_timestamp_ms).toBe(2000);
  });

  test("no pick sends no cover field (TikTok uses the first frame)", () => {
    for (const v of [undefined, null, 0, -5, 2.5, "2000"]) {
      expect(buildPostInfo({ ...base, video_cover_timestamp_ms: v })).not.toHaveProperty("video_cover_timestamp_ms");
    }
  });

  test("the rest of post_info is unchanged", () => {
    expect(buildPostInfo(base)).toEqual({
      title: "T", privacy_level: "SELF_ONLY",
      disable_duet: false, disable_stitch: false, disable_comment: false,
      brand_content_toggle: false, brand_organic_toggle: false,
    });
  });
});

describe("Instagram Reel container", () => {
  test("a pick is sent as thumb_offset", () => {
    expect(reelContainerBody({ caption: "c", thumbOffsetMs: 2000 })).toEqual({
      media_type: "REELS", upload_type: "resumable", caption: "c", thumb_offset: 2000,
    });
  });

  test("no pick sends no thumb_offset, and an empty caption is left out as before", () => {
    for (const v of [undefined, null, 0, 1.5]) {
      expect(reelContainerBody({ caption: "", thumbOffsetMs: v })).toEqual({ media_type: "REELS", upload_type: "resumable" });
    }
  });
});
