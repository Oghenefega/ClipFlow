/**
 * Reframe Style — Pure Style Resolution (#164 Phase B)
 *
 * Single source of truth for the vertical-composite look (blur/darken/background
 * zoom+position). CJS module — required cross-tree from the MAIN process
 * (render.js, projects.js, ai-pipeline.js, main.js) and imported as named ESM
 * bindings from renderer code (Vite handles the interop), mirroring
 * subtitleStyleEngine.js.
 *
 * Zero store/React dependencies.
 */

const REFRAME_STYLE_DEFAULTS = { blur: 50, darken: 50, seamSize: 10, bgZoom: 50, bgPosX: 50, bgPosY: 50 };

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Merge + clamp any partial/garbage style into a complete valid one. Missing
 * or non-object input resolves to a fresh copy of the defaults; per-field
 * garbage (NaN, out-of-range, wrong type) falls back to that field's default.
 * @param {object|null|undefined} style
 * @returns {{blur: number, darken: number, seamSize: number, bgZoom: number, bgPosX: number, bgPosY: number}}
 */
function resolveReframeStyle(style) {
  if (!style || typeof style !== "object") return { ...REFRAME_STYLE_DEFAULTS };
  return {
    blur: clampInt(style.blur, 0, 100, REFRAME_STYLE_DEFAULTS.blur),
    darken: clampInt(style.darken, 0, 100, REFRAME_STYLE_DEFAULTS.darken),
    seamSize: clampInt(style.seamSize, 0, 25, REFRAME_STYLE_DEFAULTS.seamSize),
    bgZoom: clampInt(style.bgZoom, 0, 100, REFRAME_STYLE_DEFAULTS.bgZoom),
    bgPosX: clampInt(style.bgPosX, 0, 100, REFRAME_STYLE_DEFAULTS.bgPosX),
    bgPosY: clampInt(style.bgPosY, 0, 100, REFRAME_STYLE_DEFAULTS.bgPosY),
  };
}

// render.js bg boxblur radius ("boxblur=N:2") from the semantic 0-100 blur
// slider. 50 → 28, matching the pre-style-controls hardcoded boxblur=28:2.
function bgBoxblurRadius(blur) {
  return Math.round(blur * 0.56);
}

// PreviewPanelNew canvas blur px (ctx.filter = "blur(Npx)") from the semantic
// 0-100 blur slider, scaled to the composite's backing-store width W. 50 → W/45,
// matching the pre-style-controls hardcoded Math.round(W / 45).
function bgCanvasBlurPx(blur, W) {
  return Math.round((W * blur) / 2250);
}

// Source-pixel window of gameRect shown by the blurred background, in a fixed
// outW:outH aspect (1080:1920 default). bgZoom 0/50/100 → 1x/2x/3x zoom;
// bgZoom=0 reproduces the pre-zoom-control cover-crop framing exactly.
// bgPosX/bgPosY pan the window across the leftover range once zoomed in.
// Pure + import-free so both engines (canvas compositor, FFmpeg filter graph)
// derive byte-identical windows from the same style object.
function bgSourceWindow(gameRect, style, outW = 1080, outH = 1920) {
  const zoom = 1 + style.bgZoom / 50;
  // Largest outW:outH rectangle inscribed in gameRect, at zoom 1.
  const baseW = Math.min(gameRect.w, gameRect.h * outW / outH);
  const baseH = baseW * outH / outW;
  // Even-round so callers can crop straight into a 4:2:0-legal chain.
  let winW = 2 * Math.round(baseW / zoom / 2);
  let winH = 2 * Math.round(baseH / zoom / 2);
  winW = Math.max(2, Math.min(winW, 2 * Math.floor(gameRect.w / 2)));
  winH = Math.max(2, Math.min(winH, 2 * Math.floor(gameRect.h / 2)));
  // Pan across the leftover range; clamp guards rounding drift at the edges.
  let x = Math.round(gameRect.x + (gameRect.w - winW) * style.bgPosX / 100);
  let y = Math.round(gameRect.y + (gameRect.h - winH) * style.bgPosY / 100);
  x = Math.max(gameRect.x, Math.min(x, gameRect.x + gameRect.w - winW));
  y = Math.max(gameRect.y, Math.min(y, gameRect.y + gameRect.h - winH));
  return { x, y, w: winW, h: winH };
}

// ── #164 B3: game-only starting points (camRect null end-to-end) ──
// Both return { camRect: null, gameRect } in source pixels, ready to drop
// into the calibration draft. Starting points, not modes — the game box
// stays fully draggable/resizable afterwards.

// Largest centered 9:16 crop. Its band fills the 1080×1920 output edge to
// edge, so both engines skip the background/feather stages entirely.
// Even-rounded like bgSourceWindow so the crop stays 4:2:0-legal.
function presetFullyZoomed(srcW, srcH) {
  const w = Math.max(2, 2 * Math.floor(Math.min(srcW, srcH * 9 / 16) / 2));
  const h = Math.max(2, 2 * Math.floor(Math.min(srcH, w * 16 / 9) / 2));
  return {
    camRect: null,
    gameRect: { x: Math.round((srcW - w) / 2), y: Math.round((srcH - h) / 2), w, h },
  };
}

// Whole frame letterboxed — the band centers vertically over the blurred bg.
function presetFitToScreen(srcW, srcH) {
  return { camRect: null, gameRect: { x: 0, y: 0, w: Math.round(srcW), h: Math.round(srcH) } };
}

// ── #164 B4: first-recording auto-offer trigger ──
// Pure decision for "offer a vertical-layout setup when this project opens?"
// True only when the dims are decidable and non-9:16, the project has no
// layout attached, no library entry already fits these exact dims, and the
// user hasn't dismissed this format. Undecidable dims (null probe fields and
// no loaded <video> yet) return false — the caller re-evaluates when the
// video's metadata arrives.
function shouldOfferReframe({ sourceWidth, sourceHeight, reframe, layouts, dismissed }) {
  const w = Number(sourceWidth);
  const h = Number(sourceHeight);
  if (!(w > 0) || !(h > 0)) return false;
  if (reframe) return false;
  // True 9:16 renders as-is — same tolerance as the Layout panel's notice.
  if (Math.abs(w / h - 9 / 16) < 0.01) return false;
  const lib = Array.isArray(layouts) ? layouts : [];
  if (lib.some((l) => l && l.sourceWidth === w && l.sourceHeight === h)) return false;
  const dis = Array.isArray(dismissed) ? dismissed : [];
  if (dis.includes(`${w}x${h}`)) return false;
  return true;
}

module.exports = {
  REFRAME_STYLE_DEFAULTS,
  resolveReframeStyle,
  bgBoxblurRadius,
  bgCanvasBlurPx,
  bgSourceWindow,
  presetFullyZoomed,
  presetFitToScreen,
  shouldOfferReframe,
};
