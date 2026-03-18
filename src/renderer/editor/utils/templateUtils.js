import useSubtitleStore from "../stores/useSubtitleStore";
import useCaptionStore from "../stores/useCaptionStore";
import useLayoutStore from "../stores/useLayoutStore";

// ── Built-in default template ──
export const BUILTIN_TEMPLATE = {
  id: "fega-default", name: "Fega Default", builtIn: true,
  caption: {
    fontFamily: "Latina Essential", fontWeight: 900, fontSize: 30, color: "#ffffff",
    bold: true, italic: true, underline: false, yPercent: 15, widthPercent: 90,
    lineSpacing: 1.3,
    strokeOn: false, strokeColor: "#000000", strokeWidth: 2, strokeOpacity: 80, strokeBlur: 0, strokeOffsetX: 0, strokeOffsetY: 0,
    glowOn: false, glowColor: "#ffffff", glowOpacity: 25, glowIntensity: 80, glowBlur: 15, glowBlend: 20, glowOffsetX: 0, glowOffsetY: 0,
    shadowOn: false, shadowColor: "#000000", shadowBlur: 8, shadowOpacity: 60, shadowOffsetX: 4, shadowOffsetY: 4,
    bgOn: false, bgColor: "#000000", bgOpacity: 70, bgPaddingX: 12, bgPaddingY: 8, bgRadius: 6,
  },
  subtitle: {
    fontFamily: "Latina Essential", fontWeight: 900, fontSize: 52,
    italic: true, bold: true, underline: false, subColor: "#ffffff",
    strokeOn: true, strokeWidth: 7, strokeColor: "#000000", strokeOpacity: 100, strokeBlur: 0, strokeOffsetX: 0, strokeOffsetY: 0,
    glowOn: false, glowColor: "#ffffff", glowOpacity: 25, glowIntensity: 80, glowBlur: 15, glowBlend: 20, glowOffsetX: 0, glowOffsetY: 0,
    shadowOn: false, shadowBlur: 8, shadowColor: "#000000", shadowOpacity: 70, shadowOffsetX: 4, shadowOffsetY: 4,
    bgOn: false, bgOpacity: 80, bgColor: "#000000", bgPaddingX: 12, bgPaddingY: 8, bgRadius: 6,
    highlightColor: "#4cce8a", lineMode: "1L", subMode: "karaoke", yPercent: 80,
  },
};

// ── Built-in effect presets ──
export const EFFECT_PRESETS = [
  {
    id: "preset-clean-white", name: "Clean White",
    subtitle: { subColor: "#ffffff", strokeOn: true, strokeWidth: 5, strokeColor: "#000000", strokeOpacity: 100, strokeBlur: 0, glowOn: false, shadowOn: false, bgOn: false },
    caption: { color: "#ffffff", strokeOn: true, strokeWidth: 3, strokeColor: "#000000", strokeOpacity: 100, strokeBlur: 0, glowOn: false, shadowOn: false, bgOn: false },
  },
  {
    id: "preset-yellow-pop", name: "Yellow Pop",
    subtitle: { subColor: "#ffff00", strokeOn: true, strokeWidth: 8, strokeColor: "#000000", strokeOpacity: 100, strokeBlur: 0, strokeOffsetX: 1, strokeOffsetY: -1, glowOn: true, glowColor: "#ffff00", glowOpacity: 24, glowIntensity: 95, glowBlur: 20, glowBlend: 18, glowOffsetX: 0, glowOffsetY: 0, shadowOn: true, shadowColor: "#000000", shadowOpacity: 83, shadowBlur: 7, shadowOffsetX: 4, shadowOffsetY: -4, bgOn: false },
    caption: { color: "#ffff00", strokeOn: true, strokeWidth: 6, strokeColor: "#000000", strokeOpacity: 100, glowOn: true, glowColor: "#ffff00", glowOpacity: 24, glowIntensity: 95, glowBlur: 20, glowBlend: 18, shadowOn: true, shadowColor: "#000000", shadowOpacity: 83, shadowBlur: 7, shadowOffsetX: 4, shadowOffsetY: -4, bgOn: false },
  },
  {
    id: "preset-neon-glow", name: "Neon Glow",
    subtitle: { subColor: "#ffffff", strokeOn: false, glowOn: true, glowColor: "#8b5cf6", glowOpacity: 50, glowIntensity: 90, glowBlur: 25, glowBlend: 30, shadowOn: false, bgOn: false },
    caption: { color: "#ffffff", strokeOn: false, glowOn: true, glowColor: "#8b5cf6", glowOpacity: 50, glowIntensity: 90, glowBlur: 25, glowBlend: 30, shadowOn: false, bgOn: false },
  },
  {
    id: "preset-frosted", name: "Frosted",
    subtitle: { subColor: "#ffffff", strokeOn: true, strokeWidth: 2, strokeColor: "#000000", strokeOpacity: 50, glowOn: false, shadowOn: false, bgOn: true, bgColor: "#000000", bgOpacity: 50, bgPaddingX: 16, bgPaddingY: 8, bgRadius: 10 },
    caption: { color: "#ffffff", strokeOn: true, strokeWidth: 2, strokeColor: "#000000", strokeOpacity: 50, glowOn: false, shadowOn: false, bgOn: true, bgColor: "#000000", bgOpacity: 50, bgPaddingX: 16, bgPaddingY: 8, bgRadius: 10 },
  },
  {
    id: "preset-shadow-bold", name: "Shadow Bold",
    subtitle: { subColor: "#ffffff", strokeOn: false, glowOn: false, shadowOn: true, shadowColor: "#000000", shadowOpacity: 90, shadowBlur: 12, shadowOffsetX: 6, shadowOffsetY: 6, bgOn: false },
    caption: { color: "#ffffff", strokeOn: false, glowOn: false, shadowOn: true, shadowColor: "#000000", shadowOpacity: 90, shadowBlur: 12, shadowOffsetX: 6, shadowOffsetY: 6, bgOn: false },
  },
  {
    id: "preset-gaming", name: "Gaming",
    subtitle: { subColor: "#ff4444", strokeOn: true, strokeWidth: 9, strokeColor: "#000000", strokeOpacity: 100, strokeBlur: 0, glowOn: true, glowColor: "#ff4444", glowOpacity: 30, glowIntensity: 80, glowBlur: 18, glowBlend: 25, shadowOn: true, shadowColor: "#000000", shadowOpacity: 80, shadowBlur: 8, shadowOffsetX: 3, shadowOffsetY: 3, bgOn: false },
    caption: { color: "#ff4444", strokeOn: true, strokeWidth: 7, strokeColor: "#000000", strokeOpacity: 100, glowOn: true, glowColor: "#ff4444", glowOpacity: 30, glowIntensity: 80, glowBlur: 18, glowBlend: 25, shadowOn: true, shadowColor: "#000000", shadowOpacity: 80, shadowBlur: 8, shadowOffsetX: 3, shadowOffsetY: 3, bgOn: false },
  },
  {
    id: "preset-minimal", name: "Minimal",
    subtitle: { subColor: "#ffffff", strokeOn: true, strokeWidth: 2, strokeColor: "#000000", strokeOpacity: 60, strokeBlur: 0, glowOn: false, shadowOn: false, bgOn: false },
    caption: { color: "#ffffff", strokeOn: true, strokeWidth: 1, strokeColor: "#000000", strokeOpacity: 60, glowOn: false, shadowOn: false, bgOn: false },
  },
  {
    id: "preset-outlined", name: "Outlined",
    subtitle: { subColor: "transparent", strokeOn: true, strokeWidth: 6, strokeColor: "#22d3ee", strokeOpacity: 100, strokeBlur: 0, glowOn: false, shadowOn: false, bgOn: false },
    caption: { color: "transparent", strokeOn: true, strokeWidth: 4, strokeColor: "#22d3ee", strokeOpacity: 100, glowOn: false, shadowOn: false, bgOn: false },
  },
];

export const DEFAULT_TEMPLATE_KEY = "defaultTemplateId";

// Helper: safely set store value if setter exists and value is defined
function _safeSet(store, setter, value) {
  if (value !== undefined && typeof store[setter] === "function") store[setter](value);
}

export function applyTemplate(tpl) {
  const c = tpl.caption; const s = tpl.subtitle;
  const cs = useCaptionStore.getState(); const ss = useSubtitleStore.getState(); const ls = useLayoutStore.getState();

  // Caption base
  _safeSet(cs, "setCaptionFontFamily", c.fontFamily);
  _safeSet(cs, "setCaptionFontWeight", c.fontWeight);
  _safeSet(cs, "setCaptionFontSize", c.fontSize);
  _safeSet(cs, "setCaptionColor", c.color);
  _safeSet(cs, "setCaptionBold", c.bold);
  _safeSet(cs, "setCaptionItalic", c.italic);
  _safeSet(cs, "setCaptionUnderline", c.underline);
  _safeSet(cs, "setCaptionLineSpacing", c.lineSpacing);
  // Caption stroke
  _safeSet(cs, "setCaptionStrokeOn", c.strokeOn);
  _safeSet(cs, "setCaptionStrokeColor", c.strokeColor);
  _safeSet(cs, "setCaptionStrokeWidth", c.strokeWidth);
  _safeSet(cs, "setCaptionStrokeOpacity", c.strokeOpacity);
  _safeSet(cs, "setCaptionStrokeBlur", c.strokeBlur);
  _safeSet(cs, "setCaptionStrokeOffsetX", c.strokeOffsetX);
  _safeSet(cs, "setCaptionStrokeOffsetY", c.strokeOffsetY);
  // Caption glow
  _safeSet(cs, "setCaptionGlowOn", c.glowOn);
  _safeSet(cs, "setCaptionGlowColor", c.glowColor);
  _safeSet(cs, "setCaptionGlowOpacity", c.glowOpacity);
  _safeSet(cs, "setCaptionGlowIntensity", c.glowIntensity);
  _safeSet(cs, "setCaptionGlowBlur", c.glowBlur);
  _safeSet(cs, "setCaptionGlowBlend", c.glowBlend);
  _safeSet(cs, "setCaptionGlowOffsetX", c.glowOffsetX);
  _safeSet(cs, "setCaptionGlowOffsetY", c.glowOffsetY);
  // Caption shadow
  _safeSet(cs, "setCaptionShadowOn", c.shadowOn);
  _safeSet(cs, "setCaptionShadowColor", c.shadowColor);
  _safeSet(cs, "setCaptionShadowBlur", c.shadowBlur);
  _safeSet(cs, "setCaptionShadowOpacity", c.shadowOpacity);
  _safeSet(cs, "setCaptionShadowOffsetX", c.shadowOffsetX);
  _safeSet(cs, "setCaptionShadowOffsetY", c.shadowOffsetY);
  // Caption background
  _safeSet(cs, "setCaptionBgOn", c.bgOn);
  _safeSet(cs, "setCaptionBgColor", c.bgColor);
  _safeSet(cs, "setCaptionBgOpacity", c.bgOpacity);
  _safeSet(cs, "setCaptionBgPaddingX", c.bgPaddingX);
  _safeSet(cs, "setCaptionBgPaddingY", c.bgPaddingY);
  _safeSet(cs, "setCaptionBgRadius", c.bgRadius);

  // Subtitle base
  _safeSet(ss, "setSubFontFamily", s.fontFamily);
  _safeSet(ss, "setSubFontWeight", s.fontWeight);
  _safeSet(ss, "setFontSize", s.fontSize);
  _safeSet(ss, "setSubItalic", s.italic);
  _safeSet(ss, "setSubBold", s.bold);
  _safeSet(ss, "setSubUnderline", s.underline);
  _safeSet(ss, "setSubColor", s.subColor);
  // Subtitle stroke
  _safeSet(ss, "setStrokeOn", s.strokeOn);
  _safeSet(ss, "setStrokeWidth", s.strokeWidth);
  _safeSet(ss, "setStrokeColor", s.strokeColor);
  _safeSet(ss, "setStrokeOpacity", s.strokeOpacity);
  _safeSet(ss, "setStrokeBlur", s.strokeBlur);
  _safeSet(ss, "setStrokeOffsetX", s.strokeOffsetX);
  _safeSet(ss, "setStrokeOffsetY", s.strokeOffsetY);
  // Subtitle glow
  _safeSet(ss, "setGlowOn", s.glowOn);
  _safeSet(ss, "setGlowColor", s.glowColor);
  _safeSet(ss, "setGlowOpacity", s.glowOpacity);
  _safeSet(ss, "setGlowIntensity", s.glowIntensity);
  _safeSet(ss, "setGlowBlur", s.glowBlur);
  _safeSet(ss, "setGlowBlend", s.glowBlend);
  _safeSet(ss, "setGlowOffsetX", s.glowOffsetX);
  _safeSet(ss, "setGlowOffsetY", s.glowOffsetY);
  // Subtitle shadow
  _safeSet(ss, "setShadowOn", s.shadowOn);
  _safeSet(ss, "setShadowBlur", s.shadowBlur);
  _safeSet(ss, "setShadowColor", s.shadowColor);
  _safeSet(ss, "setShadowOpacity", s.shadowOpacity);
  _safeSet(ss, "setShadowOffsetX", s.shadowOffsetX);
  _safeSet(ss, "setShadowOffsetY", s.shadowOffsetY);
  // Subtitle background
  _safeSet(ss, "setBgOn", s.bgOn);
  _safeSet(ss, "setBgOpacity", s.bgOpacity);
  _safeSet(ss, "setBgColor", s.bgColor);
  _safeSet(ss, "setBgPaddingX", s.bgPaddingX);
  _safeSet(ss, "setBgPaddingY", s.bgPaddingY);
  _safeSet(ss, "setBgRadius", s.bgRadius);
  // Subtitle misc
  _safeSet(ss, "setHighlightColor", s.highlightColor);
  _safeSet(ss, "setLineMode", s.lineMode);
  _safeSet(ss, "setSubMode", s.subMode);

  // Layout positions
  if (c.yPercent !== undefined) ls.setCapYPercent(c.yPercent);
  if (c.widthPercent !== undefined) ls.setCapWidthPercent(c.widthPercent);
  if (s.yPercent !== undefined) ls.setSubYPercent(s.yPercent);
}

export function applyEffectPreset(preset) {
  const ss = useSubtitleStore.getState();
  const cs = useCaptionStore.getState();
  const s = preset.subtitle || {};
  const c = preset.caption || {};

  // Apply subtitle effects
  if (s.subColor !== undefined) ss.setSubColor(s.subColor);
  for (const [key, setter] of [
    ["strokeOn", "setStrokeOn"], ["strokeWidth", "setStrokeWidth"], ["strokeColor", "setStrokeColor"],
    ["strokeOpacity", "setStrokeOpacity"], ["strokeBlur", "setStrokeBlur"], ["strokeOffsetX", "setStrokeOffsetX"], ["strokeOffsetY", "setStrokeOffsetY"],
    ["glowOn", "setGlowOn"], ["glowColor", "setGlowColor"], ["glowOpacity", "setGlowOpacity"],
    ["glowIntensity", "setGlowIntensity"], ["glowBlur", "setGlowBlur"], ["glowBlend", "setGlowBlend"],
    ["glowOffsetX", "setGlowOffsetX"], ["glowOffsetY", "setGlowOffsetY"],
    ["shadowOn", "setShadowOn"], ["shadowColor", "setShadowColor"], ["shadowOpacity", "setShadowOpacity"],
    ["shadowBlur", "setShadowBlur"], ["shadowOffsetX", "setShadowOffsetX"], ["shadowOffsetY", "setShadowOffsetY"],
    ["bgOn", "setBgOn"], ["bgColor", "setBgColor"], ["bgOpacity", "setBgOpacity"],
    ["bgPaddingX", "setBgPaddingX"], ["bgPaddingY", "setBgPaddingY"], ["bgRadius", "setBgRadius"],
  ]) {
    if (s[key] !== undefined) ss[setter](s[key]);
  }

  // Apply caption effects
  if (c.color !== undefined) cs.setCaptionColor(c.color);
  for (const [key, setter] of [
    ["strokeOn", "setCaptionStrokeOn"], ["strokeWidth", "setCaptionStrokeWidth"], ["strokeColor", "setCaptionStrokeColor"],
    ["strokeOpacity", "setCaptionStrokeOpacity"], ["strokeBlur", "setCaptionStrokeBlur"],
    ["strokeOffsetX", "setCaptionStrokeOffsetX"], ["strokeOffsetY", "setCaptionStrokeOffsetY"],
    ["glowOn", "setCaptionGlowOn"], ["glowColor", "setCaptionGlowColor"], ["glowOpacity", "setCaptionGlowOpacity"],
    ["glowIntensity", "setCaptionGlowIntensity"], ["glowBlur", "setCaptionGlowBlur"], ["glowBlend", "setCaptionGlowBlend"],
    ["glowOffsetX", "setCaptionGlowOffsetX"], ["glowOffsetY", "setCaptionGlowOffsetY"],
    ["shadowOn", "setCaptionShadowOn"], ["shadowColor", "setCaptionShadowColor"], ["shadowOpacity", "setCaptionShadowOpacity"],
    ["shadowBlur", "setCaptionShadowBlur"], ["shadowOffsetX", "setCaptionShadowOffsetX"], ["shadowOffsetY", "setCaptionShadowOffsetY"],
    ["bgOn", "setCaptionBgOn"], ["bgColor", "setCaptionBgColor"], ["bgOpacity", "setCaptionBgOpacity"],
    ["bgPaddingX", "setCaptionBgPaddingX"], ["bgPaddingY", "setCaptionBgPaddingY"], ["bgRadius", "setCaptionBgRadius"],
  ]) {
    if (c[key] !== undefined) cs[setter](c[key]);
  }
}

// Snapshot just the effect styling (not font/position) for effect presets
export function snapshotEffectPreset(name) {
  const sub = useSubtitleStore.getState();
  const cap = useCaptionStore.getState();
  return {
    id: `epreset-${Date.now()}`, name, builtIn: false,
    subtitle: {
      subColor: sub.subColor,
      strokeOn: sub.strokeOn, strokeWidth: sub.strokeWidth, strokeColor: sub.strokeColor,
      strokeOpacity: sub.strokeOpacity, strokeBlur: sub.strokeBlur,
      strokeOffsetX: sub.strokeOffsetX, strokeOffsetY: sub.strokeOffsetY,
      glowOn: sub.glowOn, glowColor: sub.glowColor, glowOpacity: sub.glowOpacity,
      glowIntensity: sub.glowIntensity, glowBlur: sub.glowBlur, glowBlend: sub.glowBlend,
      glowOffsetX: sub.glowOffsetX, glowOffsetY: sub.glowOffsetY,
      shadowOn: sub.shadowOn, shadowBlur: sub.shadowBlur, shadowColor: sub.shadowColor,
      shadowOpacity: sub.shadowOpacity, shadowOffsetX: sub.shadowOffsetX, shadowOffsetY: sub.shadowOffsetY,
      bgOn: sub.bgOn, bgOpacity: sub.bgOpacity, bgColor: sub.bgColor,
      bgPaddingX: sub.bgPaddingX, bgPaddingY: sub.bgPaddingY, bgRadius: sub.bgRadius,
    },
    caption: {
      color: cap.captionColor,
      strokeOn: cap.captionStrokeOn, strokeWidth: cap.captionStrokeWidth, strokeColor: cap.captionStrokeColor,
      strokeOpacity: cap.captionStrokeOpacity, strokeBlur: cap.captionStrokeBlur,
      strokeOffsetX: cap.captionStrokeOffsetX, strokeOffsetY: cap.captionStrokeOffsetY,
      glowOn: cap.captionGlowOn, glowColor: cap.captionGlowColor, glowOpacity: cap.captionGlowOpacity,
      glowIntensity: cap.captionGlowIntensity, glowBlur: cap.captionGlowBlur, glowBlend: cap.captionGlowBlend,
      glowOffsetX: cap.captionGlowOffsetX, glowOffsetY: cap.captionGlowOffsetY,
      shadowOn: cap.captionShadowOn, shadowColor: cap.captionShadowColor, shadowBlur: cap.captionShadowBlur,
      shadowOpacity: cap.captionShadowOpacity, shadowOffsetX: cap.captionShadowOffsetX, shadowOffsetY: cap.captionShadowOffsetY,
      bgOn: cap.captionBgOn, bgColor: cap.captionBgColor, bgOpacity: cap.captionBgOpacity,
      bgPaddingX: cap.captionBgPaddingX, bgPaddingY: cap.captionBgPaddingY, bgRadius: cap.captionBgRadius,
    },
  };
}

export function snapshotTemplate(name) {
  const sub = useSubtitleStore.getState();
  const cap = useCaptionStore.getState();
  const lay = useLayoutStore.getState();
  return {
    id: `tpl-${Date.now()}`, name, builtIn: false, createdAt: new Date().toISOString(),
    caption: {
      fontFamily: cap.captionFontFamily, fontWeight: cap.captionFontWeight, fontSize: cap.captionFontSize,
      color: cap.captionColor, bold: cap.captionBold, italic: cap.captionItalic, underline: cap.captionUnderline,
      lineSpacing: cap.captionLineSpacing,
      strokeOn: cap.captionStrokeOn, strokeColor: cap.captionStrokeColor, strokeWidth: cap.captionStrokeWidth,
      strokeOpacity: cap.captionStrokeOpacity, strokeBlur: cap.captionStrokeBlur,
      strokeOffsetX: cap.captionStrokeOffsetX, strokeOffsetY: cap.captionStrokeOffsetY,
      glowOn: cap.captionGlowOn, glowColor: cap.captionGlowColor, glowOpacity: cap.captionGlowOpacity,
      glowIntensity: cap.captionGlowIntensity, glowBlur: cap.captionGlowBlur, glowBlend: cap.captionGlowBlend,
      glowOffsetX: cap.captionGlowOffsetX, glowOffsetY: cap.captionGlowOffsetY,
      shadowOn: cap.captionShadowOn, shadowColor: cap.captionShadowColor, shadowBlur: cap.captionShadowBlur,
      shadowOpacity: cap.captionShadowOpacity, shadowOffsetX: cap.captionShadowOffsetX, shadowOffsetY: cap.captionShadowOffsetY,
      bgOn: cap.captionBgOn, bgColor: cap.captionBgColor, bgOpacity: cap.captionBgOpacity,
      bgPaddingX: cap.captionBgPaddingX, bgPaddingY: cap.captionBgPaddingY, bgRadius: cap.captionBgRadius,
      yPercent: lay.capYPercent, widthPercent: lay.capWidthPercent,
    },
    subtitle: {
      fontFamily: sub.subFontFamily, fontWeight: sub.subFontWeight, fontSize: sub.fontSize,
      italic: sub.subItalic, bold: sub.subBold, underline: sub.subUnderline, subColor: sub.subColor,
      strokeOn: sub.strokeOn, strokeWidth: sub.strokeWidth, strokeColor: sub.strokeColor,
      strokeOpacity: sub.strokeOpacity, strokeBlur: sub.strokeBlur,
      strokeOffsetX: sub.strokeOffsetX, strokeOffsetY: sub.strokeOffsetY,
      glowOn: sub.glowOn, glowColor: sub.glowColor, glowOpacity: sub.glowOpacity,
      glowIntensity: sub.glowIntensity, glowBlur: sub.glowBlur, glowBlend: sub.glowBlend,
      glowOffsetX: sub.glowOffsetX, glowOffsetY: sub.glowOffsetY,
      shadowOn: sub.shadowOn, shadowBlur: sub.shadowBlur, shadowColor: sub.shadowColor,
      shadowOpacity: sub.shadowOpacity, shadowOffsetX: sub.shadowOffsetX, shadowOffsetY: sub.shadowOffsetY,
      bgOn: sub.bgOn, bgOpacity: sub.bgOpacity, bgColor: sub.bgColor,
      bgPaddingX: sub.bgPaddingX, bgPaddingY: sub.bgPaddingY, bgRadius: sub.bgRadius,
      highlightColor: sub.highlightColor, lineMode: sub.lineMode, subMode: sub.subMode,
      yPercent: lay.subYPercent,
    },
  };
}
