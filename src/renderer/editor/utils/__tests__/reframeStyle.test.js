// #415: the tighter-crop zoom scales a box about its own centre. The band's
// height on the output is 1080 × h / w, so keeping the shape keeps the band —
// only how much of the source fills it changes.
const { scaleRectAboutCenter, MIN_CROP_PX } = require("../reframeStyle");

const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];

describe("scaleRectAboutCenter", () => {
  test("shrinking keeps the centre and the shape", () => {
    const r = { x: 180, y: 0, w: 2200, h: 1440 };
    const out = scaleRectAboutCenter(r, 1 / 1.1, 2560, 2880);
    expect(out).toEqual({ x: 280, y: 66, w: 2000, h: 1309 });
    expect(Math.abs(centre(out)[0] - centre(r)[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(centre(out)[1] - centre(r)[1])).toBeLessThanOrEqual(1);
    expect(out.w / out.h).toBeCloseTo(r.w / r.h, 2);
  });

  test("growing past the source edge slides the box back inside before capping", () => {
    // Cam box in the top-left corner: growing about its centre would push x/y negative.
    const r = { x: 0, y: 0, w: 1000, h: 600 };
    const out = scaleRectAboutCenter(r, 1.1, 2560, 2880);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.w).toBe(1100);
    expect(out.h).toBe(660);
  });

  test("a box already as wide as the source caps at the source", () => {
    const r = { x: 0, y: 0, w: 2560, h: 1440 };
    const out = scaleRectAboutCenter(r, 1.1, 2560, 2880);
    expect(out.w).toBe(2560);
    expect(out.h).toBe(1584);
    expect(out.x).toBe(0);
  });

  test("never drops under the minimum on either side", () => {
    const r = { x: 100, y: 100, w: 80, h: 45 };
    const out = scaleRectAboutCenter(r, 0.5, 2560, 2880);
    expect(Math.min(out.w, out.h)).toBeGreaterThanOrEqual(MIN_CROP_PX);
    expect(out.w / out.h).toBeCloseTo(r.w / r.h, 1);
  });

  test("crop then un-crop round-trips within rounding", () => {
    const r = { x: 247, y: 1440, w: 2067, h: 1440 };
    const back = scaleRectAboutCenter(scaleRectAboutCenter(r, 1 / 1.1, 2560, 2880), 1.1, 2560, 2880);
    expect(Math.abs(back.w - r.w)).toBeLessThanOrEqual(2);
    expect(Math.abs(back.h - r.h)).toBeLessThanOrEqual(2);
    expect(Math.abs(back.x - r.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(back.y - r.y)).toBeLessThanOrEqual(2);
  });

  test("unknown source dims skip the clamp but still round", () => {
    const out = scaleRectAboutCenter({ x: 10.4, y: 10.6, w: 300, h: 200 }, 1.1, 0, 0);
    expect(out).toEqual({ x: -5, y: 1, w: 330, h: 220 });
  });
});
