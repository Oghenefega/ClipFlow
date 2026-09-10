// #388: the pure half of the TikTok view pull. Direct Post never returns a
// post id, so a clip finds its video by title + publish moment against the
// account's Display API video list. Pins:
//   1. The sign-in asks for video.list only when TikTok views are switched on,
//      and the Settings gate follows the same switch.
//   2. Targets take the publish log's completion time first, the tracker's
//      local date + time second, and only rows that went to TikTok.
//   3. Matching: title-prefix beats time; each video is claimed once; nothing
//      outside the 45-minute window matches.

describe("TikTok views switch", () => {
  const load = (on) => {
    jest.resetModules();
    if (on) process.env.CLIPFLOW_TIKTOK_VIEWS = "1";
    else delete process.env.CLIPFLOW_TIKTOK_VIEWS;
    return require("../analytics-core");
  };
  afterAll(() => { delete process.env.CLIPFLOW_TIKTOK_VIEWS; });

  test("off: posting scopes only, TikTok has nothing to check", () => {
    const core = load(false);
    expect(core.TIKTOK_VIEWS_ENABLED).toBe(false);
    expect(core.TIKTOK_AUTH_SCOPE).toBe("user.info.basic,video.publish");
    expect(core.hasInsightsScope({ platform: "TikTok", scope: "user.info.basic,video.publish" })).toBeNull();
  });
  test("on: video.list is requested and an old connection needs a reconnect", () => {
    const core = load(true);
    expect(core.TIKTOK_AUTH_SCOPE).toBe("user.info.basic,video.publish,video.list");
    expect(core.hasInsightsScope({ platform: "TikTok", scope: "user.info.basic,video.publish" })).toBe(false);
    expect(core.hasInsightsScope({ platform: "TikTok", scope: "user.info.basic,video.publish,video.list" })).toBe(true);
  });
});

const { buildTikTokTargets, matchTikTokVideos } = require("../analytics-core");

describe("buildTikTokTargets", () => {
  const rows = [
    { clipId: "c1", date: "2026-09-09", time: "3:30 PM", title: "LOUD crumbles", platformResults: [{ platform: "tiktok", accountId: "tiktok_x" }, { platform: "youtube", postId: "y" }] },
    { clipId: "c1", date: "2026-09-10", time: "1:00 PM", title: "dupe", platformResults: [{ platform: "tiktok", accountId: "tiktok_x" }] },
    { clipId: "c2", date: "2026-09-08", time: "2:30 PM", title: "No log entry", platformResults: [{ platform: "tiktok", accountId: "tiktok_x" }] },
    { clipId: "c3", date: "2026-09-08", title: "YouTube only", platformResults: [{ platform: "youtube", postId: "y3" }] },
  ];
  const logs = [
    { clipId: "c1", platform: "TikTok", status: "failed", timestamp: "2026-09-09T19:00:00.000Z" },
    { clipId: "c1", platform: "TikTok", status: "success", timestamp: "2026-09-09T19:30:36.488Z" },
    { clipId: "c2", platform: "Instagram", status: "success", timestamp: "2026-09-08T18:30:00.000Z" },
  ];

  test("publish log completion time first, tracker local time second, non-TikTok rows skipped", () => {
    const t = buildTikTokTargets(rows, logs);
    expect(t.map((x) => x.clipId)).toEqual(["c1", "c2"]);
    expect(t[0]).toMatchObject({ platform: "tiktok", title: "LOUD crumbles", date: "2026-09-09", publishedAt: Date.parse("2026-09-09T19:30:36.488Z") });
    expect(t[1].publishedAt).toBe(new Date("2026-09-08 2:30 PM").getTime());
  });
  test("a row with no usable time still becomes a target, with publishedAt null", () => {
    const t = buildTikTokTargets([{ clipId: "c9", title: "x", platformResults: [{ platform: "tiktok" }] }], []);
    expect(t).toEqual([{ clipId: "c9", platform: "tiktok", title: "x", publishedAt: null, date: undefined }]);
  });
});

describe("matchTikTokVideos", () => {
  const at = (iso) => Date.parse(iso);
  const sec = (iso) => Math.floor(Date.parse(iso) / 1000);

  test("caption prefix beats a closer video, and a claimed video is not reused", () => {
    const targets = [
      { clipId: "a", title: "LOUD crumbles", publishedAt: at("2026-09-09T19:30:00Z") },
      { clipId: "b", title: "Inspirational", publishedAt: at("2026-09-09T19:31:00Z") },
    ];
    const videos = [
      { id: "v-insp", create_time: sec("2026-09-09T19:30:10Z"), video_description: "Inspirational #valorant #fyp" },
      { id: "v-loud", create_time: sec("2026-09-09T19:32:00Z"), video_description: "LOUD crumbles #valorant" },
    ];
    const m = matchTikTokVideos(targets, videos);
    expect(m.get("a").id).toBe("v-loud");
    expect(m.get("b").id).toBe("v-insp");
  });
  test("falls back to the closest video in the window when no caption matches", () => {
    const targets = [{ clipId: "a", title: "Retitled on TikTok", publishedAt: at("2026-09-09T19:30:00Z") }];
    const videos = [
      { id: "far", create_time: sec("2026-09-09T19:50:00Z"), title: "something" },
      { id: "near", create_time: sec("2026-09-09T19:31:00Z"), title: "else" },
    ];
    expect(matchTikTokVideos(targets, videos).get("a").id).toBe("near");
  });
  test("nothing outside 45 minutes, nothing without a publish moment", () => {
    const videos = [{ id: "v", create_time: sec("2026-09-09T21:00:00Z"), title: "LOUD crumbles" }];
    expect(matchTikTokVideos([{ clipId: "a", title: "LOUD crumbles", publishedAt: at("2026-09-09T19:30:00Z") }], videos).size).toBe(0);
    expect(matchTikTokVideos([{ clipId: "a", title: "LOUD crumbles", publishedAt: null }], videos).size).toBe(0);
  });
  test("title comparison ignores case and whitespace", () => {
    const targets = [{ clipId: "a", title: "  loud   CRUMBLES ", publishedAt: at("2026-09-09T19:30:00Z") }];
    const videos = [
      { id: "other", create_time: sec("2026-09-09T19:30:05Z"), video_description: "different clip" },
      { id: "hit", create_time: sec("2026-09-09T19:40:00Z"), video_description: "LOUD crumbles #valorant" },
    ];
    expect(matchTikTokVideos(targets, videos).get("a").id).toBe("hit");
  });
});
