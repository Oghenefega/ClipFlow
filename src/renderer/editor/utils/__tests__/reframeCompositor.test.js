// #457: the layout compositor shared by the editor viewer and the Projects preview.
// These record the canvas calls for each layout shape, so a change to what the viewer
// paints shows up here as well as on screen.
const { paintReframeComposite, makeCompositeScratch } = require("../reframeCompositor");
const { bgCanvasBlurPx } = require("../reframeStyle");

const STYLE = { blur: 50, darken: 50, seamSize: 10, bgZoom: 50, bgPosX: 50, bgPosY: 50 };
// Fega's "Reaction Content Style" on his 2560x2880 canvas.
const REACTION = { camRect: { x: 180, y: 0, w: 2200, h: 1440 }, gameRect: { x: 247, y: 1440, w: 2067, h: 1440 }, style: STYLE };

let log;
function fakeCanvas(name, cssW = 0, cssH = 0) {
  const ctx = {
    filter: "none", fillStyle: null, globalCompositeOperation: "source-over",
    drawImage: (...a) => log.push([name, "drawImage", a[0].__name, ...a.slice(1).map((n) => Math.round(n * 10) / 10)]),
    fillRect: (...a) => log.push([name, "fillRect", ctx.fillStyle && ctx.fillStyle.grad ? "gradient" : ctx.fillStyle, ...a.map(Math.round)]),
    clearRect: (...a) => log.push([name, "clearRect", ...a.map(Math.round)]),
    createLinearGradient: () => ({ grad: true, addColorStop() {} }),
  };
  // The filter in force at each drawImage is what makes the background blurry.
  const draw = ctx.drawImage;
  ctx.drawImage = (...a) => { if (ctx.filter !== "none") log.push([name, "filter", ctx.filter]); draw(...a); };
  return { __name: name, width: 0, height: 0, clientWidth: cssW, clientHeight: cssH, getContext: () => ctx };
}

beforeEach(() => {
  log = [];
  let n = 0;
  global.window = { devicePixelRatio: 1 };
  global.document = { createElement: () => fakeCanvas(`scratch${++n}`) };
});
afterEach(() => { delete global.window; delete global.document; });

const video = (w = 2560, h = 2880, readyState = 4) => ({ __name: "video", videoWidth: w, videoHeight: h, readyState });
const on = (name) => log.filter((e) => e[0] === name);

describe("paintReframeComposite", () => {
  test("webcam over game: blurred, darkened background, both bands, the game band feathered into it", () => {
    const canvas = fakeCanvas("out", 226, 404);
    paintReframeComposite(canvas, video(), REACTION, makeCompositeScratch());
    expect([canvas.width, canvas.height]).toEqual([226, 404]);
    const out = on("out");
    // Background: the blur scratch stretched over the whole frame, through the blur filter.
    expect(out).toContainEqual(["out", "filter", `blur(${bgCanvasBlurPx(50, 226)}px)`]);
    expect(out).toContainEqual(["out", "fillRect", "rgba(0,0,0,0.5)", 0, 0, 226, 404]);
    // The feathered game band lands right under the webcam band (226 * 1440/2200 = 147.9).
    const last = out[out.length - 1];
    expect(last.slice(0, 3)).toEqual(["out", "drawImage", "scratch3"]);
    expect(last.slice(3)).toEqual([0, 147.9]);
  });

  test("fully zoomed (a 9:16 game box, no webcam): one draw fills the frame, no background", () => {
    const canvas = fakeCanvas("out", 226, 404);
    paintReframeComposite(canvas, video(), { camRect: null, gameRect: { x: 470, y: 0, w: 1620, h: 2880 }, style: STYLE }, makeCompositeScratch());
    const out = on("out");
    expect(out).toHaveLength(1);
    expect(out[0].slice(-4)).toEqual([0, 0, 226, 404]);
    expect(log.some((e) => e[1] === "filter")).toBe(false);
  });

  test("a game box taller than the frame is centred and clipped", () => {
    const canvas = fakeCanvas("out", 226, 404);
    paintReframeComposite(canvas, video(), { camRect: null, gameRect: { x: 0, y: 0, w: 1000, h: 2880 }, style: STYLE }, makeCompositeScratch());
    const out = on("out");
    expect(out).toHaveLength(1);
    const tallH = 226 * 2.88;
    expect(out[0].slice(-4)).toEqual([0, Math.round(((404 - tallH) / 2) * 10) / 10, 226, Math.round(tallH * 10) / 10]);
  });

  test("a game-only box shorter than the frame sits in the middle over the background", () => {
    const canvas = fakeCanvas("out", 226, 404);
    paintReframeComposite(canvas, video(), { camRect: null, gameRect: { x: 0, y: 1440, w: 2560, h: 1440 }, style: STYLE }, makeCompositeScratch());
    const bandH = 226 * 1440 / 2560;
    const last = on("out").pop();
    expect(last[4]).toBeCloseTo((404 - bandH) / 2, 1);
  });

  test("a still picture of the recording paints the same way as its video frame", () => {
    // Scratch canvases get fresh names per scratch set; compare by role, not name.
    const norm = (entries) => entries.map((e) => e.map((x) =>
      (x === "video" || x === "img" ? "src" : typeof x === "string" && /^scratch\d+$/.test(x) ? "scratch" : x)));
    paintReframeComposite(fakeCanvas("out", 226, 404), video(), REACTION, makeCompositeScratch());
    const fromVideo = norm(log);
    log = [];
    const still = { __name: "img", naturalWidth: 2560, naturalHeight: 2880 };
    paintReframeComposite(fakeCanvas("out", 226, 404), still, REACTION, makeCompositeScratch());
    expect(norm(log)).toEqual(fromVideo);
    expect(fromVideo.length).toBeGreaterThan(5);
  });

  test("a decoded bitmap (width/height, no natural size) paints too", () => {
    paintReframeComposite(fakeCanvas("out", 226, 404), { __name: "bmp", width: 2560, height: 2880 }, REACTION, makeCompositeScratch());
    expect(on("out").length).toBeGreaterThan(3);
  });

  test("scratch canvases are made once and reused", () => {
    const scratch = makeCompositeScratch();
    paintReframeComposite(fakeCanvas("out", 226, 404), video(), REACTION, scratch);
    const made = [scratch.hq, scratch.blur, scratch.feather];
    expect(made.every(Boolean)).toBe(true);
    paintReframeComposite(fakeCanvas("out", 226, 404), video(), REACTION, scratch);
    expect([scratch.hq, scratch.blur, scratch.feather]).toEqual(made);
  });

  test("nothing is painted without a layout, a frame, or a size", () => {
    const s = makeCompositeScratch();
    paintReframeComposite(fakeCanvas("out", 226, 404), video(), null, s);
    paintReframeComposite(fakeCanvas("out", 226, 404), video(), { gameRect: REACTION.gameRect }, s); // camRect undefined = corrupt
    paintReframeComposite(fakeCanvas("out", 226, 404), video(2560, 2880, 1), REACTION, s); // no frame yet
    paintReframeComposite(fakeCanvas("out", 0, 0), video(), REACTION, s); // not laid out
    paintReframeComposite(fakeCanvas("out", 226, 404), { __name: "img", naturalWidth: 0, naturalHeight: 0 }, REACTION, s); // not loaded
    expect(log).toEqual([]);
  });
});
