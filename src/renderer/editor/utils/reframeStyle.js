/**
 * Reframe Style — Pure Style Resolution (#164 Phase B)
 *
 * Single source of truth for the vertical-composite look (blur/darken/seam).
 * CJS module — required cross-tree from the MAIN process (render.js, projects.js,
 * ai-pipeline.js, main.js) and imported as named ESM bindings from renderer code
 * (Vite handles the interop), mirroring subtitleStyleEngine.js.
 *
 * Zero store/React dependencies.
 */

const REFRAME_STYLE_DEFAULTS = { blur: 50, darken: 50, seam: "fade", seamSize: 10 };

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
 * @returns {{blur: number, darken: number, seam: ("fade"|"shadow"), seamSize: number}}
 */
function resolveReframeStyle(style) {
  if (!style || typeof style !== "object") return { ...REFRAME_STYLE_DEFAULTS };
  return {
    blur: clampInt(style.blur, 0, 100, REFRAME_STYLE_DEFAULTS.blur),
    darken: clampInt(style.darken, 0, 100, REFRAME_STYLE_DEFAULTS.darken),
    seam: style.seam === "fade" || style.seam === "shadow" ? style.seam : REFRAME_STYLE_DEFAULTS.seam,
    seamSize: clampInt(style.seamSize, 0, 25, REFRAME_STYLE_DEFAULTS.seamSize),
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

module.exports = {
  REFRAME_STYLE_DEFAULTS,
  resolveReframeStyle,
  bgBoxblurRadius,
  bgCanvasBlurPx,
};
