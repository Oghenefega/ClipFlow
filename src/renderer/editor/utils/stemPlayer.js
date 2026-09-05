/**
 * StemPlayer — plays a recording's individual audio tracks ("stems") through
 * Web Audio, one GainNode per track, in step with a <video> element (#272).
 *
 * Renderer-only, but CJS so the sync arithmetic can be unit-tested under jest
 * with a fake AudioContext (useSourceStems.js is the one caller).
 *
 * The video is the clock. `sync(sourceTime, isPlaying, rate)` is called every
 * animation frame and on every stop; it compares where the stems should be
 * (start position + elapsed context time × rate) with where the picture is,
 * and restarts the buffer sources whenever they disagree by more than
 * DRIFT_SEC — a seek, a section cut, an A/B element swap and slow clock drift
 * all land in that one check. Buffer sources are scheduled sample-accurately,
 * so between restarts the stems hold their position exactly.
 */

// Restart threshold. 60 ms is under what reads as lip-sync slip, and far above
// the jitter of comparing two clocks once per frame.
const DRIFT_SEC = 0.06;
// Scheduling lead so `start()` never lands in the past.
const START_LEAD_SEC = 0.01;

class StemPlayer {
  /**
   * @param {() => AudioContext} [createContext] - test seam; defaults to a
   *   48 kHz realtime AudioContext (the stems' own rate — no resampling).
   */
  constructor(createContext) {
    this._createContext = createContext || (() => new AudioContext({ sampleRate: 48000 }));
    this.ctx = null;
    this.master = null;
    this.stems = new Map(); // trackIndex → { buffer, gain, src }
    this.rangeStart = 0;
    this.rangeEnd = 0;
    this.playing = false;
    this.startCtx = 0;
    this.startPos = 0;
    this.rate = 1;
  }

  ensureCtx() {
    if (!this.ctx) {
      this.ctx = this._createContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /**
   * Decode a fresh set of stems; replaces whatever was loaded.
   * @param {{ rangeStart: number, rangeEnd: number, tracks: Array<{ index: number, wav: Uint8Array }> }} res
   */
  async load({ rangeStart, rangeEnd, tracks }) {
    const ctx = this.ensureCtx();
    const decoded = await Promise.all(tracks.map(async (t) => {
      const bytes = t.wav;
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const buffer = await ctx.decodeAudioData(ab);
      return { index: t.index, buffer };
    }));
    this.stop();
    for (const [, s] of this.stems) s.gain.disconnect();
    this.stems.clear();
    for (const d of decoded) {
      const gain = ctx.createGain();
      gain.connect(this.master);
      this.stems.set(d.index, { buffer: d.buffer, gain, src: null });
    }
    this.rangeStart = rangeStart;
    this.rangeEnd = rangeEnd;
  }

  /** @param {Record<number, number>} gainsByIndex linear gain per track index */
  setGains(gainsByIndex) {
    for (const [idx, s] of this.stems) s.gain.gain.value = gainsByIndex[idx] ?? 1;
  }

  setMuted(muted) {
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  /** Start every stem `pos` seconds into its buffer, at `rate`. */
  startAt(pos, rate) {
    this.stop();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      const p = ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
    // The picture keeps moving during the scheduling lead, so the stems start
    // that much further in — they land exactly on it, not a lead behind.
    const when = ctx.currentTime + START_LEAD_SEC;
    const offset = Math.max(0, pos + START_LEAD_SEC * rate);
    for (const [, s] of this.stems) {
      if (offset >= s.buffer.duration) continue;
      const src = ctx.createBufferSource();
      src.buffer = s.buffer;
      src.playbackRate.value = rate;
      src.connect(s.gain);
      src.start(when, offset);
      s.src = src;
    }
    this.playing = true;
    this.startCtx = when;
    this.startPos = offset;
    this.rate = rate;
  }

  stop() {
    for (const [, s] of this.stems) {
      if (!s.src) continue;
      try { s.src.stop(); } catch (_) {}
      s.src.disconnect();
      s.src = null;
    }
    this.playing = false;
  }

  /** Where the stems are right now, in seconds into their buffers. */
  expectedPos() {
    return this.startPos + Math.max(0, this.ctx.currentTime - this.startCtx) * this.rate;
  }

  /**
   * @param {number} sourceTime absolute source seconds the picture is showing
   * @param {boolean} isPlaying
   * @param {number} rate the video's playbackRate
   * @returns {"stopped"|"started"|"kept"} what this call did (for tests/logs)
   */
  sync(sourceTime, isPlaying, rate) {
    if (this.stems.size === 0) return "stopped";
    const pos = sourceTime - this.rangeStart;
    if (!isPlaying || pos < 0 || pos >= this.rangeEnd - this.rangeStart) {
      if (this.playing) this.stop();
      return "stopped";
    }
    if (!this.playing || rate !== this.rate || Math.abs(this.expectedPos() - pos) > DRIFT_SEC) {
      this.startAt(pos, rate);
      return "started";
    }
    return "kept";
  }

  destroy() {
    this.stop();
    for (const [, s] of this.stems) s.gain.disconnect();
    this.stems.clear();
    if (this.ctx) {
      if (typeof this.ctx.close === "function") {
        const p = this.ctx.close();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
      this.ctx = null;
      this.master = null;
    }
  }
}

module.exports = { StemPlayer, DRIFT_SEC, START_LEAD_SEC };
