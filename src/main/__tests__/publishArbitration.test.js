// #438: the scheduler and the Queue's Post now/Retry are two uploaders sharing ONE
// in-flight registry (src/main/publish.js). Before it, each guarded only against itself,
// and on 2026-09-16 a boot tick was mid-upload when Post now started a second run — one
// clip, twice, on all four platforms.
//
// These pin the arbitration by driving tickOnce directly with fake publishers. A live
// end-to-end test would post to real accounts, so this file IS the correctness check.
let scheduler;
const QUEUE = 7; // a renderer's webContents id

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

function makeDeps({ clips, publisher, onPublished, claim, updateClip, accounts, extraPublishers }) {
  const lines = [];
  const events = [];
  const published = [];
  const project = {
    id: "p1",
    clips: clips.map((c) => ({ status: "approved", renderPath: "C:\\r\\clip.mp4", ...c })),
  };
  const deps = {
    logger: {
      MODULES: { system: "system" },
      info: (_m, msg) => lines.push(msg),
      warn: (_m, msg) => lines.push(msg),
      error: (_m, msg) => lines.push(msg),
    },
    store: { get: () => undefined },
    libraryRoot: () => "",
    tokenStore: { getAccountsForUI: () => accounts || [{ key: "yt_1", platform: "YouTube" }] },
    projects: {
      listProjects: () => ({ projects: [project] }),
      // Same contract as projects.claimScheduledPublish: clear scheduledAt, hand back the clip.
      claimScheduledPublish: claim || ((_root, _pid, clipId) => {
        const c = project.clips.find((x) => x.id === clipId);
        if (!c?.scheduledAt) return { claimed: false, reason: "No longer scheduled" };
        c.scheduledAt = null;
        return { claimed: true, clip: { ...c } };
      }),
      updateClip: updateClip || (() => ({})),
    },
    publishers: {
      youtube: async (args) => {
        published.push(args.clipId);
        return publisher ? publisher(args) : { videoId: "v1" };
      },
      ...(extraPublishers || {}),
    },
    onPublished: onPublished || (() => {}),
    onClipChanged: () => {},
    onPublishingChanged: (clipId, publishing) => events.push([clipId, publishing]),
    notify: () => {},
    onFailure: () => {},
    preflightAccount: async () => ({}),
    // The dev-profile refusal injects deps WITHOUT arming the 60s timer, so each test
    // drives tickOnce itself.
    isDevProfile: true,
  };
  scheduler.startScheduler(deps);
  return { lines, events, published };
}

describe("#438 — one in-flight registry for the scheduler and the Queue", () => {
  const ENV = { ...process.env };
  beforeEach(() => {
    delete process.env.CLIPFLOW_ALLOW_DEV_PUBLISH;
    jest.resetModules();
    scheduler = require("../publish");
  });
  afterEach(() => {
    process.env = { ...ENV };
  });

  test("a clip can only be held once, whoever asks", () => {
    expect(scheduler.beginPublish("c1", QUEUE)).toBe(true);
    expect(scheduler.beginPublish("c1", QUEUE)).toBe(false);
    expect(scheduler.beginPublish("c1", "scheduler")).toBe(false);
  });

  test("one uploader can't release a clip the other holds", () => {
    scheduler.beginPublish("c1", "scheduler");
    scheduler.endPublish("c1", QUEUE);
    expect(scheduler.inFlightClipIds()).toEqual(["c1"]);
  });

  test("the tick does not post a due clip the Queue is already posting", async () => {
    const { published } = makeDeps({ clips: [{ id: "c1", title: "A", scheduledAt: minutesAgo(1) }] });
    scheduler.beginPublish("c1", QUEUE);
    await scheduler.tickOnce();
    expect(published).toEqual([]);
  });

  test("Post now is refused while the tick is mid-upload — the 2026-09-16 incident", async () => {
    let queueClaim;
    const { published, events } = makeDeps({
      clips: [{ id: "c1", title: "A", scheduledAt: minutesAgo(3) }],
      // Mid-upload is exactly when Post now was clicked.
      publisher: () => {
        queueClaim = scheduler.beginPublish("c1", QUEUE);
        return { videoId: "v1" };
      },
    });
    await scheduler.tickOnce();
    expect(queueClaim).toBe(false);
    expect(published).toEqual(["c1"]);
    // The Queue heard start and stop, and nothing is left held.
    expect(events).toEqual([["c1", true], ["c1", false]]);
    expect(scheduler.inFlightClipIds()).toEqual([]);
  });

  test("a clip the Queue takes during the pass is skipped, with a reason in the log", async () => {
    const { published, lines } = makeDeps({
      clips: [
        { id: "a", title: "A", scheduledAt: minutesAgo(2) },
        { id: "b", title: "B", scheduledAt: minutesAgo(1) },
      ],
      publisher: ({ clipId }) => {
        if (clipId === "a") scheduler.beginPublish("b", QUEUE);
        return { videoId: "v1" };
      },
    });
    await scheduler.tickOnce();
    expect(published).toEqual(["a"]);
    expect(lines).toContain('Scheduler: skipping "B" — already being posted from the Queue');
  });

  test("a window that went away releases its clips, and the tick can post them", async () => {
    const { published } = makeDeps({ clips: [{ id: "c1", title: "A", scheduledAt: minutesAgo(1) }] });
    scheduler.beginPublish("c1", QUEUE);
    expect(scheduler.releaseOwner(QUEUE)).toEqual(["c1"]);
    await scheduler.tickOnce();
    expect(published).toEqual(["c1"]);
  });

  test("a run that throws still releases the clip and tells the Queue it stopped", async () => {
    // A stuck claim would silently keep this clip from ever posting — the case that matters most.
    const { lines, events } = makeDeps({
      clips: [{ id: "c1", title: "A", scheduledAt: minutesAgo(1) }],
      onPublished: () => { throw new Error("tracker write blew up"); },
    });
    await scheduler.tickOnce();
    expect(lines).toContain("Scheduler: auto-fire threw for c1: tracker write blew up");
    expect(scheduler.inFlightClipIds()).toEqual([]);
    expect(events).toEqual([["c1", true], ["c1", false]]);
  });

  test("a refused disk claim releases the clip and never announces a start", async () => {
    const { published, events, lines } = makeDeps({
      clips: [{ id: "c1", title: "A", scheduledAt: minutesAgo(1) }],
      claim: () => ({ claimed: false, reason: "Already published" }),
    });
    await scheduler.tickOnce();
    expect(published).toEqual([]);
    expect(events).toEqual([]);
    expect(lines).toContain('Scheduler: skipping "A" — Already published');
    expect(scheduler.inFlightClipIds()).toEqual([]);
  });
});

// #450: the frame the creator picked rides the scheduled post, and a thumbnail
// YouTube refuses is a note on a post that WENT OUT — it must never read as a failure.
describe("#450 — the chosen YouTube thumbnail on a scheduled post", () => {
  beforeEach(() => {
    delete process.env.CLIPFLOW_ALLOW_DEV_PUBLISH;
    jest.resetModules();
    scheduler = require("../publish");
  });

  test("the clip's picked moment reaches the publisher", async () => {
    let got = "never called";
    makeDeps({
      clips: [{ id: "c1", title: "A", scheduledAt: minutesAgo(1), youtubeThumbnailTime: 4.5 }],
      publisher: (args) => { got = args.thumbnailTime; return { videoId: "v1" }; },
    });
    await scheduler.tickOnce();
    expect(got).toBe(4.5);
  });

  test("a refused thumbnail is recorded on the clip and the post still counts as sent", async () => {
    const updates = [];
    const tracked = [];
    makeDeps({
      clips: [{ id: "c1", title: "A", scheduledAt: minutesAgo(1) }],
      publisher: () => ({ success: true, videoId: "v1", thumbnail: { status: "failed", time: 0, error: "HTTP 403" } }),
      updateClip: (_root, _pid, _cid, u) => { updates.push(u); return {}; },
      onPublished: (row) => tracked.push(row),
    });
    await scheduler.tickOnce();
    const merged = Object.assign({}, ...updates);
    expect(merged.publishState).toEqual({ yt_1: "success" });
    expect(merged.thumbnailFailedPosts).toEqual({ yt_1: "HTTP 403" });
    expect(merged.publishedAt).toBeTruthy();
    // Full success is what writes the tracker row.
    expect(tracked).toHaveLength(1);
  });

  test("a thumbnail that was set leaves no note", async () => {
    const updates = [];
    makeDeps({
      clips: [{ id: "c1", title: "A", scheduledAt: minutesAgo(1) }],
      publisher: () => ({ success: true, videoId: "v1", thumbnail: { status: "set", time: 4.5 } }),
      updateClip: (_root, _pid, _cid, u) => { updates.push(u); return {}; },
    });
    await scheduler.tickOnce();
    expect(Object.assign({}, ...updates).thumbnailFailedPosts).toBeUndefined();
  });
});

// #455: the same picked moment is the cover on TikTok and Instagram. The scheduler
// forwards it; publishTikTok/publishInstagram turn it into each platform's field.
describe("#455 — the picked frame as the TikTok and Instagram cover", () => {
  beforeEach(() => {
    delete process.env.CLIPFLOW_ALLOW_DEV_PUBLISH;
    jest.resetModules();
    scheduler = require("../publish");
  });

  const accounts = [{ key: "tt_1", platform: "TikTok" }, { key: "ig_1", platform: "Instagram", igAccountId: "9" }];

  test("the clip's picked moment reaches the TikTok and Instagram publishers", async () => {
    const got = {};
    makeDeps({
      clips: [{ id: "c1", title: "A", scheduledAt: minutesAgo(1), youtubeThumbnailTime: 2 }],
      accounts,
      extraPublishers: {
        tiktok: async (args) => { got.tiktok = args.coverTime; return { success: true, publish_id: "p1" }; },
        instagram: async (args) => { got.instagram = args.coverTime; return { success: true, mediaId: "m1" }; },
      },
    });
    await scheduler.tickOnce();
    expect(got).toEqual({ tiktok: 2, instagram: 2 });
  });

  test("no pick forwards nothing", async () => {
    const got = {};
    makeDeps({
      clips: [{ id: "c1", title: "A", scheduledAt: minutesAgo(1) }],
      accounts,
      extraPublishers: {
        tiktok: async (args) => { got.tiktok = args.coverTime; return { success: true, publish_id: "p1" }; },
        instagram: async (args) => { got.instagram = args.coverTime; return { success: true, mediaId: "m1" }; },
      },
    });
    await scheduler.tickOnce();
    expect(got).toEqual({ tiktok: undefined, instagram: undefined });
  });
});
