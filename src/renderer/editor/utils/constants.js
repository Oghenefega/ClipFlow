import T from "../../styles/theme";

// ============ LAYOUT CONSTANTS ============
export const TOPBAR_H = 48;
export const RAIL_W = 80;
export const LP_DEFAULT = 300;
export const LP_MIN = 180;
export const LP_MAX = 1400;
export const DRAWER_DEFAULT = 360;
export const DRAWER_MIN = 260;
export const DRAWER_MAX = 560;
export const TL_DEFAULT = 220;
export const TL_MIN = 120;
export const TL_MAX = 480;
export const TL_COLLAPSED_H = 38;
export const LP_GHOST_W = 20;

// ============ SURFACE/BORDER HELPERS ============
export const S2 = T.surfaceHover;
export const S3 = "rgba(255,255,255,0.06)";
export const BD = T.border;
export const BDH = T.borderHover;

// ============ STATIC DATA ============
export const BRAND_PRESETS = [
  { id: "gaming", name: "Gaming Default", detail: "Montserrat · 52 · Green", tracks: ["Sub 1", "Sub 2"] },
  { id: "chill", name: "Chill Vlog", detail: "DM Sans · 42 · Blue", tracks: ["Sub 1"] },
  { id: "bold", name: "Bold Impact", detail: "Impact · 64 · Red", tracks: ["Caption"] },
];

export const HIGHLIGHT_COLORS = ["#4cce8a", "#f4c430", "#ffffff", "#e63946", T.accent];

export const RAIL_ITEMS = [
  { id: "ai", icon: "✦", label: "AI Tools", group: 1 },
  { id: "subs", icon: "CC", label: "Subtitles", group: 2 },
  { id: "head", icon: "T", label: "Caption", group: 2 },
  { id: "brand", icon: "◈", label: "Brand Kit", group: 2 },
  { id: "audio", icon: "♫", label: "Audio", group: 3 },
  { id: "media", icon: "⊞", label: "Media", group: 3 },
  { id: "text", icon: "Aa", label: "Text", group: 3 },
];

export const TRACKS = [
  { id: "cap", label: "CAPTION", color: T.accent, type: "cap" },
  { id: "s1", label: "SUBTITLES", color: "#90b8e0", type: "sub" },
  { id: "v1", label: "VIDEO 1", color: T.green, type: "video" },
  { id: "a1", label: "AUDIO 1", color: "#4a7fa0", type: "audio" },
  { id: "a2", label: "AUDIO 2", color: "#7a5fa0", type: "audio" },
];

export const PANEL_LABELS = {
  ai: "AI Tools", subs: "Subtitles", head: "Caption",
  brand: "Brand Kit", media: "Media", audio: "Audio", text: "Text",
};

export const FONT_OPTIONS = ["Montserrat", "DM Sans", "Impact", "Arial", "Roboto"];

export const CAPTION_COLORS = [
  { color: "#ffffff", label: "White" },
  { color: "#f4c430", label: "Yellow" },
  { color: "#4cce8a", label: "Green" },
  { color: "#f87171", label: "Red" },
  { color: "#a78bfa", label: "Purple" },
  { color: "#22d3ee", label: "Cyan" },
];
