// ── Timeline Constants ──

export const SPEED_OPTIONS = ["0.25x", "0.5x", "0.75x", "1x", "1.25x", "1.5x", "1.75x", "2x"];

// ── Professional color palette (DaVinci/Premiere-inspired) ──
export const TRACK_COLORS = {
  cap: {
    bg: "hsl(217 70% 55% / 0.16)",
    border: "hsl(217 70% 55% / 0.50)",
    selected: "hsl(217 70% 55% / 0.32)",
    hover: "hsl(217 70% 55% / 0.24)",
    text: "hsl(217 70% 85%)",
    ring: "hsl(217 70% 65%)",
    badge: "hsl(217 70% 50%)",
  },
  sub: {
    bg: "hsl(38 80% 55% / 0.14)",
    border: "hsl(38 80% 55% / 0.45)",
    selected: "hsl(38 80% 55% / 0.28)",
    hover: "hsl(38 80% 55% / 0.20)",
    text: "hsl(38 80% 85%)",
    ring: "hsl(38 80% 65%)",
    badge: "hsl(38 80% 45%)",
  },
  audio: {
    bg: "transparent",
    border: "hsl(25 90% 55% / 0.4)",
    selected: "hsl(25 90% 55% / 0.15)",
    hover: "hsl(25 90% 55% / 0.08)",
    text: "hsl(25 90% 70%)",
    ring: "hsl(25 90% 60%)",
    badge: "hsl(25 90% 50%)",
  },
};

// ── Playhead & guides ──
export const PLAYHEAD_COLOR = "#ef4444";
export const SNAP_GUIDE_COLOR = "#22d3ee";

// ── Surface colors ──
export const TIMELINE_BG = "#131419";
export const RULER_BG = "#0f1014";
export const RULER_TEXT = "rgba(255,255,255,0.35)";
export const TRACK_SEPARATOR = "rgba(255,255,255,0.06)";

// ── Dimensions ──
export const RULER_H = 24;
export const TRACK_H = 38;
export const AUDIO_TRACK_H = 56;
export const LABEL_W = 64;
export const END_PADDING = 200;
export const MERGE_THRESHOLD = 18;

// ── Interaction ──
export const TRIM_HANDLE_VISUAL_W = 4;
export const TRIM_HANDLE_HIT_W = 14;
export const SNAP_THRESHOLD_PX = 6;
export const RIPPLE_ANIM_MS = 200;
export const SEGMENT_RADIUS = 4;
export const MIN_SEGMENT_DURATION = 0.1;
