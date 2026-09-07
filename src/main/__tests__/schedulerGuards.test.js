// #376 (Fega's call, s244): only the INSTALLED app auto-publishes.
//
// The scheduler moved into the main process with #329, and CLAUDE.md mandates a
// `npm start` after every code change — which is the PROD profile, holding the real
// OAuth tokens. That made the mandated verification step a live publisher, and it did
// post to real accounts once (s214). The dev-profile guard that existed covered the
// profile where the accident happened and left the mandated path armed.
//
// These pin both refusals, including the one that matters most: a caller that forgets
// to inject `isPackaged` must fail toward NOT publishing.
const scheduler = require("../publish");

function makeDeps(overrides) {
  const lines = [];
  return {
    lines,
    deps: {
      logger: {
        MODULES: { system: "system" },
        info: (_m, msg) => lines.push(msg),
        warn: (_m, msg) => lines.push(msg),
        error: (_m, msg) => lines.push(msg),
      },
      // dueClips() would need these; if a guard fires they are never touched.
      store: { get: () => [] },
      projects: {},
      libraryRoot: () => "",
      ...overrides,
    },
  };
}

const started = (lines) => lines.some((l) => l.startsWith("Scheduler: started"));

describe("startScheduler — #376 source-run and dev-profile refusals", () => {
  const ENV = { ...process.env };
  afterEach(() => {
    scheduler.stopScheduler();
    process.env = { ...ENV };
  });

  test("a source run does NOT start the scheduler", () => {
    const { lines, deps } = makeDeps({ isDevProfile: false, isPackaged: false });
    scheduler.startScheduler(deps);
    expect(started(lines)).toBe(false);
    expect(lines.some((l) => l.includes("running from source"))).toBe(true);
  });

  test("a missing isPackaged flag fails toward NOT publishing", () => {
    // The important one: a future call site that forgets the flag must not
    // silently re-arm a source run.
    const { lines, deps } = makeDeps({ isDevProfile: false });
    scheduler.startScheduler(deps);
    expect(started(lines)).toBe(false);
  });

  test("the dev profile does not start it even when packaged", () => {
    const { lines, deps } = makeDeps({ isDevProfile: true, isPackaged: true });
    scheduler.startScheduler(deps);
    expect(started(lines)).toBe(false);
    expect(lines.some((l) => l.includes("dev profile"))).toBe(true);
  });

  test("the installed app on the prod profile DOES start it", () => {
    const { lines, deps } = makeDeps({ isDevProfile: false, isPackaged: true });
    scheduler.startScheduler(deps);
    expect(started(lines)).toBe(true);
  });

  test("each refusal has its own explicit env override", () => {
    process.env.CLIPFLOW_ALLOW_SOURCE_PUBLISH = "1";
    const a = makeDeps({ isDevProfile: false, isPackaged: false });
    scheduler.startScheduler(a.deps);
    expect(started(a.lines)).toBe(true);
    scheduler.stopScheduler();

    delete process.env.CLIPFLOW_ALLOW_SOURCE_PUBLISH;
    process.env.CLIPFLOW_ALLOW_DEV_PUBLISH = "1";
    const b = makeDeps({ isDevProfile: true, isPackaged: true });
    scheduler.startScheduler(b.deps);
    expect(started(b.lines)).toBe(true);
  });

  test("the dev override alone does not unlock a source run", () => {
    // The two guards are independent; `npm run dev` is both.
    process.env.CLIPFLOW_ALLOW_DEV_PUBLISH = "1";
    const { lines, deps } = makeDeps({ isDevProfile: true, isPackaged: false });
    scheduler.startScheduler(deps);
    expect(started(lines)).toBe(false);
    expect(lines.some((l) => l.includes("running from source"))).toBe(true);
  });
});
