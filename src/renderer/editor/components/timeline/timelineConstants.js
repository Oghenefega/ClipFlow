// ── Timeline Constants ──

export const SPEED_OPTIONS = ["0.25x", "0.5x", "0.75x", "1x", "1.25x", "1.5x", "1.75x", "2x"];

// ── Professional color palette (DaVinci/Premiere-inspired) ──
// Caption = blue, Subtitle = lime green, Audio = warm amber/orange
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
    bg: "hsl(82 75% 45% / 0.14)",
    border: "hsl(82 75% 45% / 0.45)",
    selected: "hsl(82 75% 45% / 0.28)",
    hover: "hsl(82 75% 45% / 0.20)",
    text: "hsl(82 75% 82%)",
    ring: "hsl(82 75% 55%)",
    badge: "hsl(82 75% 38%)",
  },
  audio: {
    bg: "hsl(25 90% 55% / 0.04)",
    border: "hsl(25 90% 55% / 0.22)",
    selected: "hsl(25 90% 55% / 0.15)",
    hover: "hsl(25 90% 55% / 0.10)",
    text: "hsl(25 90% 70%)",
    ring: "hsl(25 90% 60% / 0.7)",
    badge: "hsl(25 90% 50%)",
  },
};

// Sounds on the clip (#202): songs teal, one-shot SFX violet — each lane keeps
// its own colour so a song and a sound are never confusable at a glance.
export const SOUND_COLORS = {
  music: {
    bg: "rgba(20,184,166,0.22)",
    border: "rgba(20,184,166,0.55)",
    ring: "rgba(45,212,191,0.9)",
    wave: "rgba(94,234,212,0.55)",
    icon: "hsl(172 66% 70%)",
    text: "hsl(172 60% 90%)",
  },
  sfx: {
    bg: "rgba(139,92,246,0.28)",
    border: "rgba(139,92,246,0.65)",
    ring: "rgba(167,139,250,0.95)",
    wave: "rgba(196,181,253,0.6)",
    icon: "hsl(258 90% 80%)",
    text: "hsl(258 70% 93%)",
  },
};

// Image/GIF overlays on the clip (#310): rose, so an overlay is never
// confusable with a song (teal) or a one-shot (violet) at a glance.
export const MEDIA_COLORS = {
  bg: "rgba(244,63,94,0.26)",
  border: "rgba(244,63,94,0.6)",
  ring: "rgba(251,113,133,0.95)",
  icon: "hsl(350 90% 82%)",
  text: "hsl(350 80% 94%)",
};

// ── Playhead & guides ──
export const PLAYHEAD_COLOR = "#9ca3af";
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
// Music + SFX lanes. A lane splits into two half-height rows when its blocks
// overlap, so neither can hide the other (#202b).
export const SOUND_TRACK_H = 36;
export const SOUND_ROW_H = 28;
export const SOUND_STACK_ROW_H = 15;
// Media lanes (#310) — one per z-order level, same geometry as a sound lane so
// the stack of lanes reads as one family.
export const MEDIA_TRACK_H = 36;
export const MEDIA_ROW_H = 28;
export const MEDIA_STACK_ROW_H = 15;
// Everything in the timeline that is always there: ruler + controls bar +
// Caption + Subtitle + Audio + Music + SFX + the horizontal scrollbar. This is
// the 276 EditorLayout used to hard-code; the Media lanes (#310) add on top.
export const TIMELINE_FIXED_H = RULER_H + 36 + TRACK_H * 2 + AUDIO_TRACK_H + SOUND_TRACK_H * 2 + 12;
export const LABEL_W = 80;
export const END_PADDING = 200;
// Subtitle clustering: subs whose visual gap (in px) is below this threshold
// merge into a single cluster block. Cluster splits as user zooms in.
export const CLUSTER_GAP_PX = 6;
// Minimum width for a single sub block before it collapses into a cluster.
// If a sub is narrower than this, it's eligible for cluster merging.
export const CLUSTER_MIN_WIDTH_PX = 40;

// ── Interaction ──
export const TRIM_HANDLE_VISUAL_W = 4;
export const TRIM_HANDLE_HIT_W = 14;
// Per-word "teeth" boundary handle (#119) — internal word-boundary drag on a
// selected subtitle block. Slightly narrower than the trim handle so adjacent
// teeth on short words don't overlap.
export const WORD_TOOTH_HIT_W = 12;
export const SNAP_THRESHOLD_PX = 6;
export const RIPPLE_ANIM_MS = 200;
export const SEGMENT_RADIUS = 4;
export const MIN_SEGMENT_DURATION = 0.1;
