const {
  dbToGain,
  clampDb,
  normalizeMix,
  isFlat,
  setLevel,
  resolveClipAudioMix,
  mixableTracks,
  buildSourceMix,
} = require("../audioMix");

// Fega's real 5-track layout (audioSetup as saved by the #169 wizard).
const SETUP = {
  trackCount: 5,
  tracks: [
    { index: 0, label: "mix" },
    { index: 1, label: "voice" },
    { index: 2, label: "game" },
    { index: 3, label: "other", customName: "Browser" },
    { index: 4, label: "empty" },
  ],
};

describe("audioMix — levels model (#272)", () => {
  test("dB ↔ linear gain", () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(20)).toBeCloseTo(10, 6);
  });

  test("clampDb: finite, within the slider range, one decimal", () => {
    expect(clampDb(3.26)).toBe(3.3);
    expect(clampDb(99)).toBe(24);
    expect(clampDb(-99)).toBe(-24);
    expect(clampDb("abc")).toBe(0);
    expect(clampDb(undefined)).toBe(0);
  });

  test("normalizeMix drops zeros and junk keys, keeps {} as {}", () => {
    expect(normalizeMix({ 1: -3, 3: 18, 2: 0, x: 5, "-1": 4 })).toEqual({ 1: -3, 3: 18 });
    expect(normalizeMix({})).toEqual({});
    expect(normalizeMix(null)).toBeNull();
    expect(normalizeMix([1, 2])).toBeNull();
  });

  test("isFlat: nothing turned means the export keeps the mix track", () => {
    expect(isFlat(null)).toBe(true);
    expect(isFlat({})).toBe(true);
    expect(isFlat({ 1: 0, 2: 0 })).toBe(true);
    expect(isFlat({ 3: 18 })).toBe(false);
  });

  test("setLevel returns a new object; 0 dB removes the entry", () => {
    const a = { 1: -3 };
    const b = setLevel(a, 3, 18);
    expect(b).toEqual({ 1: -3, 3: 18 });
    expect(a).toEqual({ 1: -3 });
    expect(setLevel(b, 1, 0)).toEqual({ 3: 18 });
    expect(setLevel(null, 2, 6)).toEqual({ 2: 6 });
  });

  test("resolveClipAudioMix: clip override > recording default > null", () => {
    const project = { audioMix: { 3: 18 } };
    expect(resolveClipAudioMix({ audioMix: { 1: -6 } }, project)).toEqual({ 1: -6 });
    expect(resolveClipAudioMix({}, project)).toEqual({ 3: 18 });
    // An explicit {} on the clip wins: this clip wants the recording flat.
    expect(resolveClipAudioMix({ audioMix: {} }, project)).toEqual({});
    expect(resolveClipAudioMix({}, {})).toBeNull();
    expect(resolveClipAudioMix(null, null)).toBeNull();
  });

  test("mixableTracks leaves the full mix out, in index order", () => {
    expect(mixableTracks(SETUP).map((t) => t.index)).toEqual([1, 2, 3, 4]);
    expect(mixableTracks(null)).toEqual([]);
  });

  test("buildSourceMix: one gain per mixable track, 0 dB → 1", () => {
    const sm = buildSourceMix(SETUP, { 1: -6, 3: 18 }, 5);
    expect(sm.map((t) => t.index)).toEqual([1, 2, 3, 4]);
    expect(sm[0].gain).toBeCloseTo(0.501, 3);
    expect(sm[1].gain).toBe(1);
    expect(sm[2].gain).toBeCloseTo(7.943, 3);
    expect(sm[3].gain).toBe(1);
  });

  test("buildSourceMix refuses to guess: no setup or a different track layout → null", () => {
    expect(buildSourceMix(null, { 3: 18 }, 5)).toBeNull();
    expect(buildSourceMix(SETUP, { 3: 18 }, 6)).toBeNull();
    // Unknown file track count: trust the setup.
    expect(buildSourceMix(SETUP, { 3: 18 })).toHaveLength(4);
  });
});
