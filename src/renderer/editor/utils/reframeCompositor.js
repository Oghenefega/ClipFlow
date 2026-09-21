/**
 * Reframe compositor — paints the vertical composition (#164) onto a canvas: webcam
 * crop on top, game crop directly below, blurred game covering the whole frame
 * underneath. Geometry must mirror render.js baking (preview == export).
 *
 * Shared by the editor viewer (PreviewPanelNew) and the Projects preview (#457), so the
 * two cannot drift. Moved here verbatim from PreviewPanelNew; the only additions are
 * that the source may be a still (an <img> of a raw recording frame, for the Projects
 * poster) and that the scratch canvases are passed in.
 *
 * CJS with no JSX: vite.config.js hands `module.exports =` files to its CommonJS
 * plugin, and jest runs this in plain node.
 */
const { resolveReframeStyle, bgCanvasBlurPx, bgSourceWindow } = require("./reframeStyle");

// #164: high-quality downscale for video→canvas band draws. A single drawImage
// bilinear-samples only 2×2 source texels, so shrinks past ~2x (2560-wide source
// into a ~500px Fit canvas) alias into a blurry/pixelated band — and Chromium
// ignores imageSmoothingQuality "high" on the GPU video path, so the hint alone
// doesn't fix it. Halving through a scratch canvas until the final step is ≤2x
// gives mipmap-grade output at negligible paint cost.
function drawVideoHQ(ctx, source, sx, sy, sw, sh, dx, dy, dw, dh, scratch) {
  if (sw <= dw * 2) {
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }
  // Ladder of intermediate sizes: dw*2, dw*4, … capped so the first step down
  // from the source is itself ≤2x. (sw > dw*2 here, so at least one rung.)
  const sizes = [];
  let w = Math.ceil(dw), h = Math.ceil(dh);
  while (w * 2 < sw && sizes.length < 4) {
    w *= 2;
    h *= 2;
    sizes.push([w, h]);
  }
  if (!sizes.length) {
    // Rounding left no rung (shrink barely over 2x) — direct draw is fine there.
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }
  sizes.reverse();
  const [w0, h0] = sizes[0];
  if (scratch.width < w0) scratch.width = w0;
  if (scratch.height < h0) scratch.height = h0;
  const sctx = scratch.getContext("2d");
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(source, sx, sy, sw, sh, 0, 0, w0, h0);
  let cw = w0, ch = h0;
  for (let i = 1; i < sizes.length; i++) {
    const [nw, nh] = sizes[i];
    // Canvas-to-self draw is spec-safe (source snapshots before the write).
    sctx.drawImage(scratch, 0, 0, cw, ch, 0, 0, nw, nh);
    cw = nw;
    ch = nh;
  }
  ctx.drawImage(scratch, 0, 0, cw, ch, dx, dy, dw, dh);
}

// The scratch canvases one caller reuses across paints. Created on first use.
function makeCompositeScratch() {
  return { hq: null, blur: null, feather: null };
}
const newCanvas = () => document.createElement("canvas");

/**
 * Paint one frame of `source` in layout `rf` onto `canvas`.
 * @param {HTMLCanvasElement} canvas - sized from its CSS box × DPR (capped 1440 wide)
 * @param {HTMLVideoElement|HTMLImageElement} source - a video with a frame (readyState ≥ 2),
 *   or a loaded still at the recording's own size (the layout rects are source pixels)
 * @param {{camRect: object|null, gameRect: object, style: object}} rf - a resolved layout
 * @param {{hq, blur, feather}} scratch - from makeCompositeScratch(), reused across paints
 */
function paintReframeComposite(canvas, source, rf, scratch) {
  // camRect may be null (game-only layout, #164 B3) — only undefined/corrupt bails.
  if (!canvas || !source || !rf || rf.camRect === undefined || !rf.gameRect) return;
  const isVideo = typeof source.videoWidth === "number";
  if (isVideo && source.readyState < 2) return;
  const vw = isVideo ? source.videoWidth : source.naturalWidth;
  const vh = isVideo ? source.videoHeight : source.naturalHeight;
  if (!vw || !vh) return;
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  if (!cssW || !cssH) return;
  // Backing store tracks CSS size × DPR (crisp at any zoom), capped — band
  // sources are ≤1080px wide, so a wider backing buys nothing but paint cost.
  const dpr = window.devicePixelRatio || 1;
  const W = Math.min(Math.round(cssW * dpr), 1440);
  const H = Math.round(W * (cssH / cssW));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  // Rects were calibrated on the probed source; clamp to the decoded frame
  // so a stale layout can't throw drawImage out of bounds.
  const clampRect = (r) => {
    const x = Math.min(Math.max(0, r.x), vw - 2);
    const y = Math.min(Math.max(0, r.y), vh - 2);
    return { x, y, w: Math.max(2, Math.min(r.w, vw - x)), h: Math.max(2, Math.min(r.h, vh - y)) };
  };
  const cam = rf.camRect ? clampRect(rf.camRect) : null; // #164 B3: null = game-only layout
  const game = clampRect(rf.gameRect);
  const style = resolveReframeStyle(rf.style);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Sharp bands (cam/game) go through drawVideoHQ — see its comment for why
  // a direct drawImage pixelates at Fit-sized shrinks.
  if (!scratch.hq) scratch.hq = newCanvas();
  const hqScratch = scratch.hq;

  // #164 B3 fully-zoomed mirror: same 1080-space band + thresholds as
  // render.js — no cam and the band spans the 1920 frame → the game crop is
  // drawn alone, no bg/feather work (render bakes a single crop+scale there).
  const band1080 = 2 * Math.round((1080 * game.h / game.w) / 2);
  if (!cam && band1080 >= 1916) {
    if (band1080 <= 1924) {
      drawVideoHQ(ctx, source, game.x, game.y, game.w, game.h, 0, 0, W, H, hqScratch);
    } else {
      // Taller than the frame: center it — the canvas clips top/bottom just
      // like the render side's centered 1920 crop.
      const tallH = W * (game.h / game.w);
      drawVideoHQ(ctx, source, game.x, game.y, game.w, game.h, 0, (H - tallH) / 2, W, tallH, hqScratch);
    }
    return;
  }

  // Blur band: game crop → tiny offscreen (cover) → stretched back up with a
  // soft blur. Downscale-blur-upscale mirrors the render-side boxblur recipe
  // at a fraction of the cost of blurring at full resolution.
  if (!scratch.blur) {
    scratch.blur = newCanvas();
    scratch.blur.width = 108;
    scratch.blur.height = 192;
  }
  const blurScratch = scratch.blur;
  const sctx = blurScratch.getContext("2d");
  const win = bgSourceWindow(game, style);
  sctx.drawImage(source, win.x, win.y, win.w, win.h, 0, 0, blurScratch.width, blurScratch.height);
  const blurPx = bgCanvasBlurPx(style.blur, W);
  if (blurPx >= 1) {
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(blurScratch, 0, 0, W, H);
    ctx.filter = "none";
  } else {
    ctx.drawImage(blurScratch, 0, 0, W, H);
  }
  // Darken the blurred bg so the sharp bands read as the clear foreground —
  // must visually track render.js's lutyuv (style.darken there too).
  if (style.darken > 0) {
    ctx.fillStyle = `rgba(0,0,0,${style.darken / 100})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Bands stack from the top; overflow past the bottom clips (render parity).
  // #164 B3: with no cam the game band centers vertically — gameY === camBandH
  // for cam layouts, so their paint is unchanged. bandsBottom is the total
  // band height either way (the feather gate mirrors render's ≤1916 check).
  const camBandH = cam ? W * (cam.h / cam.w) : 0;
  const gameBandH = W * (game.h / game.w);
  const bandsBottom = camBandH + gameBandH;
  const gameY = cam ? camBandH : (H - gameBandH) / 2;
  if (cam) drawVideoHQ(ctx, source, cam.x, cam.y, cam.w, cam.h, 0, 0, W, camBandH, hqScratch);

  const gh = Math.round(gameBandH);
  const F = Math.min(Math.round(H * style.seamSize / 100), Math.floor(gh / 2));
  if (bandsBottom < H - 2 && F >= 2) {
    // Feather the game band's bottom edge into the bg instead of a hard seam
    // (mirrors render.js's geq alpha ramp on the same-height strip).
    if (!scratch.feather) scratch.feather = newCanvas();
    const fScratch = scratch.feather;
    if (fScratch.width !== W || fScratch.height !== gh) {
      fScratch.width = W;
      fScratch.height = gh;
    }
    const fctx = fScratch.getContext("2d");
    fctx.clearRect(0, 0, W, gh);
    fctx.imageSmoothingEnabled = true;
    fctx.imageSmoothingQuality = "high";
    drawVideoHQ(fctx, source, game.x, game.y, game.w, game.h, 0, 0, W, gh, hqScratch);
    fctx.globalCompositeOperation = "destination-out";
    const fadeGrad = fctx.createLinearGradient(0, gh - F, 0, gh);
    // #328: literal, NOT theme tokens. A <canvas> gradient stop is parsed by
    // the 2D context, which has no CSS custom properties to resolve — a
    // var() here throws. These two are an alpha ramp for a destination-out
    // mask anyway; the colour never shows.
    fadeGrad.addColorStop(0, "rgba(0,0,0,0)");
    fadeGrad.addColorStop(1, "rgba(0,0,0,1)");
    fctx.fillStyle = fadeGrad;
    fctx.fillRect(0, gh - F, W, F);
    fctx.globalCompositeOperation = "source-over";
    ctx.drawImage(fScratch, 0, gameY);
  } else {
    drawVideoHQ(ctx, source, game.x, game.y, game.w, game.h, 0, gameY, W, gameBandH, hqScratch);
  }
}

module.exports = { drawVideoHQ, makeCompositeScratch, paintReframeComposite };
