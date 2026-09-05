const { StemPlayer, DRIFT_SEC, START_LEAD_SEC } = require("../stemPlayer");

// A minimal fake AudioContext: a settable clock, gain/buffer-source nodes that
// record what was asked of them, and decodeAudioData that returns a buffer
// whose duration is encoded in the byte length (1 byte = 1 second).
function fakeContext() {
  const created = [];
  const ctx = {
    currentTime: 0,
    state: "running",
    destination: { id: "dest" },
    resumed: 0,
    closed: false,
    createGain() {
      const g = { gain: { value: 1 }, connected: null, connect(to) { this.connected = to; }, disconnect() { this.connected = null; } };
      return g;
    },
    createBufferSource() {
      const s = {
        buffer: null, playbackRate: { value: 1 }, connected: null, startedAt: null, offset: null, stopped: false,
        connect(to) { this.connected = to; }, disconnect() { this.connected = null; },
        start(when, offset) { this.startedAt = when; this.offset = offset; },
        stop() { this.stopped = true; },
      };
      created.push(s);
      return s;
    },
    async decodeAudioData(ab) { return { duration: ab.byteLength }; },
    resume() { this.resumed++; return Promise.resolve(); },
    close() { this.closed = true; return Promise.resolve(); },
  };
  return { ctx, created };
}

const wav = (seconds) => new Uint8Array(seconds);

async function loadedPlayer(rangeStart = 100, seconds = 30) {
  const { ctx, created } = fakeContext();
  const p = new StemPlayer(() => ctx);
  await p.load({ rangeStart, rangeEnd: rangeStart + seconds, tracks: [{ index: 1, wav: wav(seconds) }, { index: 3, wav: wav(seconds) }] });
  return { p, ctx, created };
}

describe("StemPlayer (#272) — stems follow the picture", () => {
  test("load: one gain per track into the master, no sources yet", async () => {
    const { p, ctx, created } = await loadedPlayer();
    expect([...p.stems.keys()]).toEqual([1, 3]);
    for (const [, s] of p.stems) expect(s.gain.connected).toBe(p.master);
    expect(p.master.connected).toBe(ctx.destination);
    expect(created).toHaveLength(0);
    expect(p.playing).toBe(false);
  });

  test("first playing tick starts every stem at the picture's offset into the range", async () => {
    const { p, ctx, created } = await loadedPlayer(100, 30);
    ctx.currentTime = 5;
    expect(p.sync(112.5, true, 1)).toBe("started");
    expect(created).toHaveLength(2);
    for (const s of created) {
      // Scheduled a lead ahead, and that much further into the buffer, so the
      // stems land ON the picture rather than a lead behind it.
      expect(s.offset).toBeCloseTo(12.5 + START_LEAD_SEC, 6);
      expect(s.startedAt).toBeCloseTo(5 + START_LEAD_SEC, 6);
      expect(s.playbackRate.value).toBe(1);
    }
    expect(p.playing).toBe(true);
  });

  test("in-sync ticks keep the sources; a seek past the threshold restarts them", async () => {
    const { p, ctx, created } = await loadedPlayer(100, 30);
    ctx.currentTime = 0;
    p.sync(110, true, 1);
    // 2 s of context time later the picture is at 112 (±40 ms): kept.
    ctx.currentTime = 2.01;
    expect(p.sync(112.0, true, 1)).toBe("kept");
    expect(p.sync(112.04, true, 1)).toBe("kept");
    expect(created).toHaveLength(2);
    // A seek: picture jumps to 120 → restart at 20 s into the buffers.
    expect(p.sync(120, true, 1)).toBe("started");
    expect(created).toHaveLength(4);
    expect(created[0].stopped).toBe(true);
    expect(created[2].offset).toBeCloseTo(20 + START_LEAD_SEC, 6);
  });

  test("drift just under the threshold is tolerated, just over is corrected", async () => {
    const { p, ctx } = await loadedPlayer(100, 30);
    ctx.currentTime = 0;
    p.sync(110, true, 1);
    ctx.currentTime = 1;
    expect(p.sync(111 + DRIFT_SEC - 0.005, true, 1)).toBe("kept");
    expect(p.sync(111 + DRIFT_SEC + 0.005, true, 1)).toBe("started");
  });

  test("pause stops the sources; play again restarts from the new spot", async () => {
    const { p, ctx, created } = await loadedPlayer(100, 30);
    p.sync(110, true, 1);
    expect(p.sync(111, false, 1)).toBe("stopped");
    expect(p.playing).toBe(false);
    expect(created[0].stopped).toBe(true);
    expect(created[0].connected).toBeNull();
    ctx.currentTime = 9;
    expect(p.sync(115, true, 1)).toBe("started");
    expect(created[2].offset).toBeCloseTo(15 + START_LEAD_SEC, 6);
  });

  test("outside the loaded range the stems stay silent", async () => {
    const { p, created } = await loadedPlayer(100, 30);
    expect(p.sync(99, true, 1)).toBe("stopped");
    expect(p.sync(130, true, 1)).toBe("stopped");
    expect(created).toHaveLength(0);
  });

  test("a rate change (shuttle) restarts at the new rate and tracks it", async () => {
    const { p, ctx, created } = await loadedPlayer(100, 30);
    ctx.currentTime = 0;
    p.sync(110, true, 1);
    expect(p.sync(110, true, 2)).toBe("started");
    expect(created[2].playbackRate.value).toBe(2);
    // 1 s later at 2× the picture is at 112: kept.
    ctx.currentTime = 1.01;
    expect(p.sync(112, true, 2)).toBe("kept");
  });

  test("gains and mute land on the nodes; 0 dB is unity", async () => {
    const { p } = await loadedPlayer();
    p.setGains({ 1: 0.5, 3: 7.94 });
    expect(p.stems.get(1).gain.gain.value).toBe(0.5);
    expect(p.stems.get(3).gain.gain.value).toBe(7.94);
    p.setGains({});
    expect(p.stems.get(1).gain.gain.value).toBe(1);
    p.setMuted(true);
    expect(p.master.gain.value).toBe(0);
    p.setMuted(false);
    expect(p.master.gain.value).toBe(1);
  });

  test("a suspended context is resumed on start", async () => {
    const { p, ctx } = await loadedPlayer();
    ctx.state = "suspended";
    p.sync(110, true, 1);
    expect(ctx.resumed).toBe(1);
  });

  test("load replaces the previous stems and stops them first", async () => {
    const { p, ctx, created } = await loadedPlayer(100, 30);
    p.sync(110, true, 1);
    await p.load({ rangeStart: 200, rangeEnd: 210, tracks: [{ index: 2, wav: wav(10) }] });
    expect(created[0].stopped).toBe(true);
    expect([...p.stems.keys()]).toEqual([2]);
    expect(p.playing).toBe(false);
    expect(p.rangeStart).toBe(200);
    expect(ctx.closed).toBe(false);
  });

  test("destroy stops everything and closes the context", async () => {
    const { p, ctx, created } = await loadedPlayer();
    p.sync(110, true, 1);
    p.destroy();
    expect(created[0].stopped).toBe(true);
    expect(p.stems.size).toBe(0);
    expect(ctx.closed).toBe(true);
    expect(p.ctx).toBeNull();
    expect(p.sync(110, true, 1)).toBe("stopped");
  });
});
