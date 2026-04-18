/**
 * Subtitle Style Engine — Pure Rendering Functions
 *
 * Single source of truth for subtitle/caption visual rendering.
 * Zero store dependencies. Zero React dependencies.
 * Both PreviewPanelNew (editor) and ProjectsView (projects) consume these.
 *
 * Input: style config objects + scale factor → Output: CSS style objects + text-shadow strings
 */

// ── Color conversion ──

function hexToRgba(hex, opacity) {
  const c = (hex || "#000000").replace("#", "").padEnd(6, "0");
  const r = parseInt(c.slice(0, 2), 16) || 0;
  const g = parseInt(c.slice(2, 4), 16) || 0;
  const b = parseInt(c.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${opacity / 100})`;
}

// ── Stroke: multi-ring text-shadow for solid outlines ──

function buildStrokeShadows(width, colorHex, opacity, blur = 0, offX = 0, offY = 0) {
  if (width <= 0) return "";
  const rgba = hexToRgba(colorHex, opacity);
  const shadows = [];
  // Adaptive: more points for larger widths to avoid jagged edges
  const steps = Math.max(24, Math.round(width * 8));
  // Multiple rings from 40% to 100% width for solid fill (no gaps)
  const rings = width > 3 ? 3 : width > 1 ? 2 : 1;
  for (let ring = 1; ring <= rings; ring++) {
    const r = width * (ring / rings);
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const x = (Math.cos(angle) * r + offX).toFixed(2);
      const y = (Math.sin(angle) * r + offY).toFixed(2);
      shadows.push(`${x}px ${y}px ${blur}px ${rgba}`);
    }
  }
  return shadows.join(", ");
}

// ── Glow: soft halo layers ──

function buildGlowShadow(colorHex, opacity, intensity, blur, blend, offX, offY, sf) {
  const scaledBlur = blur * sf * 0.5;
  const scaledIntensity = intensity / 100;
  const effectiveOpacity = (opacity / 100) * (blend / 100 + (1 - blend / 100) * scaledIntensity);
  const rgba = hexToRgba(colorHex, effectiveOpacity * 100);
  const ox = (offX * sf * 0.5).toFixed(1);
  const oy = (offY * sf * 0.5).toFixed(1);
  const layers = Math.max(1, Math.round(scaledIntensity * 3));
  const parts = [];
  for (let i = 0; i < layers; i++) {
    parts.push(`${ox}px ${oy}px ${scaledBlur}px ${rgba}`);
  }
  return parts.join(", ");
}

// ── Unified shadow builder with configurable effect order ──

function buildAllShadows(opts) {
  const { sf, stroke, glow: glowOpts, shadow: shadowOpts, order } = opts;
  const builders = {
    shadow: () => {
      if (!shadowOpts || !shadowOpts.on) return "";
      const scaledBlur = (shadowOpts.blur || 0) * sf * 0.5;
      const ox = ((shadowOpts.offX || 0) * sf * 0.5).toFixed(1);
      const oy = ((shadowOpts.offY || 0) * sf * 0.5).toFixed(1);
      return `${ox}px ${oy}px ${scaledBlur}px ${hexToRgba(shadowOpts.color || "#000", shadowOpts.opacity ?? 70)}`;
    },
    glow: () => {
      if (!glowOpts || !glowOpts.on) return "";
      return buildGlowShadow(
        glowOpts.color || "#fff", glowOpts.opacity ?? 25,
        glowOpts.intensity ?? 80, glowOpts.blur || 15,
        glowOpts.blend ?? 20,
        glowOpts.offX || 0, glowOpts.offY || 0, sf
      );
    },
    stroke: () => {
      if (!stroke || !stroke.on) return "";
      const scaledW = Math.max(0.5, (stroke.width || 2) * sf * 0.5);
      const scaledBlur = (stroke.blur || 0) * sf * 0.3;
      return buildStrokeShadows(
        scaledW, stroke.color || "#000", stroke.opacity ?? 100,
        scaledBlur,
        (stroke.offX || 0) * sf * 0.5, (stroke.offY || 0) * sf * 0.5
      );
    },
    background: () => "", // handled via CSS background, not text-shadow
  };
  const effectOrder = order || ["glow", "stroke", "shadow", "background"];
  const parts = effectOrder.map(key => builders[key] ? builders[key]() : "").filter(Boolean);
  return parts.join(", ");
}

// ── Subtitle style builder ──

function buildSubtitleStyle(config, scaleFactor) {
  const s = config || {};
  // No floor on fontSize — must scale purely proportionally to scaleFactor so the
  // subtitle wraps identically at every preview size. A fixed floor (e.g. 7px) breaks
  // the width/font-size ratio when the preview shrinks, causing lines that fit on one
  // row at full size to wrap to two rows when narrowed.
  const fontSize = (s.fontSize || 52) * scaleFactor;
  const style = {
    fontFamily: `'${s.fontFamily || "Latina Essential"}', sans-serif`,
    fontSize: `${fontSize}px`,
    fontWeight: s.fontWeight || (s.bold ? 700 : 400),
    fontStyle: s.italic ? "italic" : "normal",
    color: s.subColor || "#ffffff",
    textAlign: "center",
    lineHeight: 1.3,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    width: "100%",
    textDecoration: s.underline ? "underline" : "none",
  };
  if (s.bgOn) {
    style.background = hexToRgba(s.bgColor || "#000", s.bgOpacity ?? 80);
    // No floors — padding and radius must scale purely with scaleFactor to keep the
    // subtitle box geometry proportional at every preview size.
    style.padding = `${(s.bgPaddingY || 8) * scaleFactor * 0.5}px ${(s.bgPaddingX || 12) * scaleFactor * 0.5}px`;
    style.borderRadius = `${(s.bgRadius || 6) * scaleFactor * 0.5}px`;
  } else {
    style.padding = `${4 * scaleFactor}px ${10 * scaleFactor}px`;
    style.borderRadius = `${4 * scaleFactor}px`;
  }
  return style;
}

// ── Subtitle text-shadow builder (normal + active word variants) ──

function buildSubtitleShadows(config, scaleFactor) {
  const s = config || {};
  const shadowOpts = {
    sf: scaleFactor,
    stroke: { on: s.strokeOn, width: s.strokeWidth, color: s.strokeColor, opacity: s.strokeOpacity, blur: s.strokeBlur, offX: s.strokeOffsetX, offY: s.strokeOffsetY },
    shadow: { on: s.shadowOn, color: s.shadowColor, opacity: s.shadowOpacity, blur: s.shadowBlur, offX: s.shadowOffsetX, offY: s.shadowOffsetY },
    order: s.effectOrder,
  };
  const normal = buildAllShadows({
    ...shadowOpts,
    glow: { on: s.glowOn, color: s.glowColor, opacity: s.glowOpacity, intensity: s.glowIntensity, blur: s.glowBlur, blend: s.glowBlend, offX: s.glowOffsetX, offY: s.glowOffsetY },
  });
  const active = buildAllShadows({
    ...shadowOpts,
    glow: { on: s.glowOn, color: s.highlightColor || s.glowColor, opacity: s.glowOpacity, intensity: s.glowIntensity, blur: s.glowBlur, blend: s.glowBlend, offX: s.glowOffsetX, offY: s.glowOffsetY },
  });
  return { normal, active };
}

// ── Caption style builder ──

function buildCaptionStyle(config, scaleFactor) {
  const c = config || {};
  // No floor on fontSize — must scale purely proportionally so the caption wraps
  // identically at every preview size. See buildSubtitleStyle for context.
  const fontSize = (c.fontSize || 30) * 2.4 * scaleFactor;
  const style = {
    fontFamily: `'${c.fontFamily || "Latina Essential"}', sans-serif`,
    fontSize: `${fontSize}px`,
    fontWeight: c.fontWeight || (c.bold ? 700 : 400),
    fontStyle: c.italic ? "italic" : "normal",
    color: c.color || "#ffffff",
    textAlign: "center",
    lineHeight: c.lineSpacing || 1.3,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    width: "100%",
    textDecoration: c.underline ? "underline" : "none",
  };
  if (c.bgOn) {
    style.background = hexToRgba(c.bgColor || "#000", c.bgOpacity ?? 70);
    // No floors — padding and radius must scale purely with scaleFactor.
    style.padding = `${(c.bgPaddingY || 8) * scaleFactor * 0.5}px ${(c.bgPaddingX || 12) * scaleFactor * 0.5}px`;
    style.borderRadius = `${(c.bgRadius || 6) * scaleFactor * 0.5}px`;
  } else {
    style.padding = `${4 * scaleFactor}px ${10 * scaleFactor}px`;
  }
  // Text shadows
  const allShadows = buildAllShadows({
    sf: scaleFactor,
    stroke: { on: c.strokeOn, width: c.strokeWidth, color: c.strokeColor, opacity: c.strokeOpacity, blur: c.strokeBlur, offX: c.strokeOffsetX, offY: c.strokeOffsetY },
    glow: { on: c.glowOn, color: c.glowColor, opacity: c.glowOpacity, intensity: c.glowIntensity, blur: c.glowBlur, blend: c.glowBlend, offX: c.glowOffsetX, offY: c.glowOffsetY },
    shadow: { on: c.shadowOn, color: c.shadowColor, opacity: c.shadowOpacity, blur: c.shadowBlur, offX: c.shadowOffsetX, offY: c.shadowOffsetY },
    order: c.effectOrder,
  });
  if (allShadows) {
    style.textShadow = allShadows;
  } else {
    style.textShadow = `0 ${2 * scaleFactor}px ${8 * scaleFactor}px rgba(0,0,0,0.6)`;
  }
  return style;
}

// ── Punctuation stripper ──

function stripPunctuation(word, punctuationRemove) {
  if (!word) return word;
  const rm = punctuationRemove || {};
  const hasAny = Object.values(rm).some(Boolean);
  if (!hasAny) return word;
  let result = word;
  if (rm.ellipsis) result = result.replace(/\.\.\./g, "");
  if (rm.period) result = result.replace(/\./g, "");
  if (rm.comma) result = result.replace(/,/g, "");
  if (rm.question) result = result.replace(/\?/g, "");
  if (rm.exclamation) result = result.replace(/!/g, "");
  if (rm.semicolon) result = result.replace(/;/g, "");
  if (rm.colon) result = result.replace(/:/g, "");
  return result;
}

module.exports = {
  hexToRgba,
  buildStrokeShadows,
  buildGlowShadow,
  buildAllShadows,
  buildSubtitleStyle,
  buildSubtitleShadows,
  buildCaptionStyle,
  stripPunctuation,
};
