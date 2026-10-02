const { judgeClips, parseJudgeResult, buildContextText, SYSTEM } = require("../clip-judge");

describe("judge prompt", () => {
  test("covers both kinds of clip", () => {
    expect(SYSTEM).toContain('KIND "hype_reaction"');
    expect(SYSTEM).toContain('KIND "comedy"');
  });

  test("names no creator's team or catchphrase (those come from the game description)", () => {
    for (const s of ["100 Thieves", "100T", "GET HIM OUT", "Oh my goodness", "Valorant", "LOUD"]) {
      expect(SYSTEM).not.toContain(s);
    }
  });

  test("carries the creator's own game description", () => {
    const t = buildContextText({ gameName: "100T Valorant Reacts", gameContext: "I root for 100 Thieves.", watchedGameName: "Valorant" });
    expect(t).toContain("This stream: 100T Valorant Reacts.");
    expect(t).toContain("The game being watched: Valorant.");
    expect(t).toContain("In the creator's words: I root for 100 Thieves.");
  });

  test("works with no game description", () => {
    expect(buildContextText({})).toMatch(/return the JSON object/);
  });
});

describe("parseJudgeResult", () => {
  test("normalizes a good answer", () => {
    const j = parseJudgeResult(JSON.stringify({ kind: "comedy", keep_score: 82.6, reason: " Boast then whiff. ", play_quality: null, reaction_size: 8, payoff_t: 9.5, reaction_end_t: 14 }));
    expect(j).toEqual({ score: 83, kind: "comedy", reason: "Boast then whiff.", what: "", playQuality: null, reactionSize: 8, payoffT: 9.5, reactionEndT: 14 });
  });

  test("clamps the score to 0-100", () => {
    expect(parseJudgeResult('{"keep_score": 140}').score).toBe(100);
    expect(parseJudgeResult('{"keep_score": -5}').score).toBe(0);
  });

  test("unknown kind becomes null, missing numbers become null", () => {
    const j = parseJudgeResult('{"keep_score": 40, "kind": "drama"}');
    expect(j.kind).toBeNull();
    expect(j.payoffT).toBeNull();
    expect(j.reason).toBe("");
  });

  test("bad JSON or no score is unusable", () => {
    expect(parseJudgeResult("not json")).toBeNull();
    expect(parseJudgeResult('{"kind": "comedy"}')).toBeNull();
    expect(parseJudgeResult('{"keep_score": "high"}')).toBeNull();
    expect(parseJudgeResult("null")).toBeNull();
  });
});

describe("judgeClips", () => {
  const project = { id: "proj_1", sourceFile: "C:\\rec.mp4" };
  const clips = () => [
    { id: "c1", startTime: 10, endTime: 30 },
    { id: "c2", startTime: 50, endTime: 70 },
    { id: "c3", startTime: 90, endTime: 110 },
  ];
  const usage = { inputTokens: 4000, outputTokens: 500 };

  test("stores a judge on each clip and logs one call per clip", async () => {
    const cs = clips();
    const calls = [];
    const logged = [];
    const res = await judgeClips({
      project, clips: cs, context: {}, previewDir: "C:\\tmp",
      logger: { logApiUsage: (i, o, m) => logged.push([i, o, m]), warn: () => {} },
      judgeFn: async (a) => { calls.push(a); return { judge: { score: a.start, kind: "comedy", reason: "r" }, usage, costUsd: 0.01, durationMs: 5 }; },
      recordCall: (row) => logged.push(row),
    });
    expect(res).toEqual({ judged: 3, failed: 0, costUsd: 0.03 });
    expect(cs.map((c) => c.judge.score)).toEqual([10, 50, 90]);
    expect(cs[0].judge).toMatchObject({ model: "gemini-3.6-flash", rubric: "v4" });
    expect(calls[1]).toMatchObject({ sourceFile: "C:\\rec.mp4", start: 50, end: 70 });
    expect(logged.filter((r) => r.kind === "clip_judge" && r.ok)).toHaveLength(3);
  });

  test("a timed-out call is retried once", async () => {
    const cs = clips().slice(0, 1);
    let n = 0;
    const res = await judgeClips({
      project, clips: cs, context: {}, previewDir: "C:\\tmp", logger: { warn: () => {} },
      judgeFn: async () => { n++; if (n === 1) throw new Error("Gemini API request timed out after 90s"); return { judge: { score: 60 }, usage, costUsd: 0.01, durationMs: 5 }; },
      recordCall: () => {},
    });
    expect(n).toBe(2);
    expect(res.judged).toBe(1);
    expect(cs[0].judge.score).toBe(60);
  });

  test("other errors are not retried", async () => {
    let n = 0;
    const res = await judgeClips({
      project, clips: clips().slice(0, 1), context: {}, previewDir: "C:\\tmp", logger: { warn: () => {} },
      judgeFn: async () => { n++; throw new Error("HTTP 400"); },
      recordCall: () => {},
    });
    expect(n).toBe(1);
    expect(res.failed).toBe(1);
  });

  test("a failed clip does not stop the others and is logged as failed", async () => {
    const cs = clips();
    const rows = [];
    const res = await judgeClips({
      project, clips: cs, context: {}, previewDir: "C:\\tmp", logger: { warn: () => {} },
      judgeFn: async (a) => {
        if (a.start === 50) throw new Error("HTTP 503");
        if (a.start === 90) return { judge: null, usage, costUsd: 0.01, durationMs: 5 };
        return { judge: { score: 70 }, usage, costUsd: 0.01, durationMs: 5 };
      },
      recordCall: (row) => rows.push(row),
    });
    expect(res.judged).toBe(1);
    expect(res.failed).toBe(2);
    expect(cs[0].judge.score).toBe(70);
    expect(cs[1].judge).toBeUndefined();
    expect(cs[2].judge).toBeUndefined();
    expect(rows.map((r) => r.ok)).toEqual(expect.arrayContaining([true, false, false]));
    expect(rows.find((r) => r.clipId === "c2").error).toContain("503");
  });
});
