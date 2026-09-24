// #463: Corva closed through several slots used to post every missed clip in one tick,
// seconds apart. The scheduler now posts the oldest and slides the rest later, keeping
// the gaps Fega scheduled, pushing later clips only when they'd land too close.
let scheduler;

// Local wall-clock slots, the shape the Queue writes.
const at = (day, h, m) => `2026-09-${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;

function makeDeps(clips, { testMode = false } = {}) {
  const published = [];
  const notes = [];
  const project = {
    id: "p1",
    testMode,
    clips: clips.map((c) => ({ status: "approved", renderPath: "C:\\r\\clip.mp4", ...c })),
  };
  const deps = {
    logger: { MODULES: { system: "system" }, info: () => {}, warn: () => {}, error: () => {} },
    store: { get: () => undefined },
    libraryRoot: () => "",
    tokenStore: { getAccountsForUI: () => [{ key: "yt_1", platform: "YouTube" }] },
    projects: {
      listProjects: () => ({ projects: [project] }),
      claimScheduledPublish: (_root, _pid, clipId) => {
        const c = project.clips.find((x) => x.id === clipId);
        if (!c?.scheduledAt) return { claimed: false, reason: "No longer scheduled" };
        c.scheduledAt = null;
        return { claimed: true, clip: { ...c } };
      },
      updateClip: (_root, _pid, clipId, updates) => {
        Object.assign(project.clips.find((x) => x.id === clipId), updates);
        return {};
      },
    },
    publishers: { youtube: async (args) => { published.push(args.clipId); return { videoId: "v1" }; } },
    onPublished: () => {},
    onClipChanged: () => {},
    onPublishingChanged: () => {},
    notify: (n) => notes.push(n),
    onFailure: () => {},
    preflightAccount: async () => ({}),
    isDevProfile: true, // injects deps without arming the 60s timer
  };
  scheduler.startScheduler(deps);
  const slot = (id) => project.clips.find((c) => c.id === id).scheduledAt;
  return { published, notes, slot };
}

describe("#463 — missed slots are spaced out, not fired at once", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 23, 17, 0, 0)); // 5:00 pm local
    scheduler = require("../publish");
  });
  afterEach(() => jest.useRealTimers());

  test("Fega's case: 1:30/2:30/3:30 opened at 5:00 → 5:00, 6:00, 7:00", async () => {
    const d = makeDeps([
      { id: "a", title: "A", scheduledAt: at(23, 13, 30) },
      { id: "b", title: "B", scheduledAt: at(23, 14, 30) },
      { id: "c", title: "C", scheduledAt: at(23, 15, 30) },
    ]);
    await scheduler.tickOnce();
    expect(d.published).toEqual(["a"]);
    expect(d.slot("b")).toBe(at(23, 18, 0));
    expect(d.slot("c")).toBe(at(23, 19, 0));
    expect(d.notes).toHaveLength(1);
  });

  test("original gaps are kept, not flattened to an hour", async () => {
    const d = makeDeps([
      { id: "a", title: "A", scheduledAt: at(23, 13, 30) },
      { id: "b", title: "B", scheduledAt: at(23, 14, 0) },
    ]);
    await scheduler.tickOnce();
    expect(d.slot("b")).toBe(at(23, 17, 30));
  });

  test("a later clip too close is pushed; one with room stops the push", async () => {
    const d = makeDeps([
      { id: "a", title: "A", scheduledAt: at(23, 13, 30) },
      { id: "b", title: "B", scheduledAt: at(23, 14, 30) },
      { id: "c", title: "C", scheduledAt: at(23, 15, 30) },
      { id: "d", title: "D", scheduledAt: at(23, 17, 30) }, // 2h after C
      { id: "e", title: "E", scheduledAt: at(24, 13, 30) }, // tomorrow
    ]);
    await scheduler.tickOnce();
    expect(d.slot("d")).toBe(at(23, 20, 0)); // an hour after C, not its full 2h gap
    expect(d.slot("e")).toBe(at(24, 13, 30));
  });

  test("a later clip already an hour clear doesn't move", async () => {
    const d = makeDeps([
      { id: "a", title: "A", scheduledAt: at(23, 13, 30) },
      { id: "b", title: "B", scheduledAt: at(23, 18, 0) },
    ]);
    await scheduler.tickOnce();
    expect(d.slot("b")).toBe(at(23, 18, 0));
    expect(d.notes).toHaveLength(0);
  });

  test("an on-time tick moves nothing", async () => {
    jest.setSystemTime(new Date(2026, 8, 23, 13, 30, 40));
    const d = makeDeps([
      { id: "a", title: "A", scheduledAt: at(23, 13, 30) },
      { id: "b", title: "B", scheduledAt: at(23, 13, 45) },
    ]);
    await scheduler.tickOnce();
    expect(d.published).toEqual(["a"]);
    expect(d.slot("b")).toBe(at(23, 13, 45));
    expect(d.notes).toHaveLength(0);
  });

  test("test-mode projects are never moved", async () => {
    const d = makeDeps([
      { id: "a", title: "A", scheduledAt: at(23, 13, 30) },
      { id: "b", title: "B", scheduledAt: at(23, 14, 30) },
    ], { testMode: true });
    await scheduler.tickOnce();
    expect(d.published).toEqual([]);
    expect(d.slot("b")).toBe(at(23, 14, 30));
  });
});
