// ── Timeline Constants ──

export const SPEED_OPTIONS = ["0.25x", "0.5x", "0.75x", "1x", "1.25x", "1.5x", "1.75x", "2x"];

// ── Professional color palette (DaVinci/Premiere-inspired) ──
// Caption = blue, Subtitle = lime green, Audio = warm amber/orange
// #328: the HUES are track identity and are the same in every theme. Only the
// lightness of text/icons printed on them is a token (--trackTextL /
// --trackIconL) — an 88%-light label reads on Midnight and disappears on
// Daylight. The bg/border/selected/hover values are alphas over the canvas,
// so they already land correctly either way.
export const TRACK_COLORS = {
  cap: {
    bg: "hsl(217 70% 55% / 0.16)",
    border: "hsl(217 70% 55% / 0.50)",
    selected: "hsl(217 70% 55% / 0.32)",
    hover: "hsl(217 70% 55% / 0.24)",
    text: "hsl(217 70% var(--trackTextL))",
    ring: "hsl(217 70% 65%)",
    badge: "hsl(217 70% 50%)",
  },
  sub: {
    bg: "hsl(82 75% 45% / 0.14)",
    border: "hsl(82 75% 45% / 0.45)",
    selected: "hsl(82 75% 45% / 0.28)",
    hover: "hsl(82 75% 45% / 0.20)",
    text: "hsl(82 75% var(--trackTextL))",
    ring: "hsl(82 75% 55%)",
    badge: "hsl(82 75% 38%)",
  },
  audio: {
    bg: "hsl(25 90% 55% / 0.04)",
    border: "hsl(25 90% 55% / 0.22)",
    selected: "hsl(25 90% 55% / 0.15)",
    hover: "hsl(25 90% 55% / 0.10)",
    text: "hsl(25 90% var(--trackTextDimL))",
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
    icon: "hsl(172 66% var(--trackIconL))",
    text: "hsl(172 60% var(--trackTextL))",
  },
  sfx: {
    bg: "rgba(139,92,246,0.28)",
    border: "rgba(139,92,246,0.65)",
    ring: "rgba(167,139,250,0.95)",
    wave: "rgba(196,181,253,0.6)",
    icon: "hsl(258 90% var(--trackIconL))",
    text: "hsl(258 70% var(--trackTextL))",
  },
};

// Image/GIF overlays on the clip (#310): rose, so an overlay is never
// confusable with a song (teal) or a one-shot (violet) at a glance.
export const MEDIA_COLORS = {
  bg: "rgba(244,63,94,0.26)",
  border: "rgba(244,63,94,0.6)",
  ring: "rgba(251,113,133,0.95)",
  icon: "hsl(350 90% var(--trackIconL))",
  text: "hsl(350 80% var(--trackTextL))",
};

// ── Playhead & guides ──
export const PLAYHEAD_COLOR = "#9ca3af";
export const SNAP_GUIDE_COLOR = "#22d3ee";

// ── Surface colors ──
// #328: their own tokens rather than --card/--background, so Midnight keeps the
// exact two values it always had; the ruler stays one step recessed from the
// track surface in every theme.
export const TIMELINE_BG = "var(--timelineBg)";
export const RULER_BG = "var(--rulerBg)";
export const RULER_TEXT = "rgba(var(--lift),0.35)";
export const TRACK_SEPARATOR = "rgba(var(--lift),0.06)";

// ── Dimensions ──
export const RULER_H = 24;
export const TRACK_H = 38;
export const AUDIO_TRACK_H = 56;
// Music + SFX lanes. A lane splits into two half-height rows when its blocks
// overlap, so neither can hide the other (#202b); past that, each kind can be
// split across extra lanes of its own (#312).
export const SOUND_TRACK_H = 36;
export const SOUND_ROW_H = 28;
export const SOUND_STACK_ROW_H = 15;
// Media lanes (#310) — one per z-order level, same geometry as a sound lane so
// the stack of lanes reads as one family.
export const MEDIA_TRACK_H = 36;
export const MEDIA_ROW_H = 28;
export const MEDIA_STACK_ROW_H = 15;
// Everything in the timeline that is always there: ruler + controls bar +
// Caption + Subtitle + Audio + the horizontal scrollbar. The Media lanes (#310)
// and the Music/SFX lanes (#312) are all count-driven now, so EditorLayout adds
// them on top — this no longer carries the one-Music-plus-one-SFX assumption
// that made the old hard-coded 276.
export const TIMELINE_FIXED_H = RULER_H + 36 + TRACK_H * 2 + AUDIO_TRACK_H + 12;
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

// ── Section joins (#352, DaVinci-style) ──
// The hit zone centred on a cut is three zones with no modifier key: the
// middle moves the cut (both sides), the outer thirds trim the section on
// that side. Each zone has its own cursor so the pointer says which edit a
// press will make — the same three cursors Resolve shows at an edit point.
export const JOIN_HIT_W = 30;   // whole zone
export const JOIN_ROLL_W = 10;  // middle band = roll; the rest = trim that side

// Cursors as inline SVG (white glyph, dark outline — readable on every theme
// and over video). Hotspot at the centre. `ew-resize` is the fallback.
// `d` is a path string. (alpha.19 dropped it in as bare text — an SVG with no
// path element, so the pointer became an invisible 32×32 image: "my mouse
// disappears". Any change here must be eyeballed as a rendered image.)
const svgCursor = (d) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<path d="${d}" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  )}") 16 16, ew-resize`;

// ][ with arrows either side — move the cut
export const CURSOR_ROLL = svgCursor(
  "M13 9v14M19 9v14M9 16H3M6 13l-3 3 3 3M23 16h6M26 13l3 3-3 3"
);
// ] with arrows — the LEFT section's end (its out point)
export const CURSOR_TRIM_LEFT = svgCursor(
  "M15 9h4v14h-4M9 16H3M6 13l-3 3 3 3M23 16h6M26 13l3 3-3 3"
);
// [ with arrows — the RIGHT section's start (its in point)
export const CURSOR_TRIM_RIGHT = svgCursor(
  "M17 9h-4v14h4M9 16H3M6 13l-3 3 3 3M23 16h6M26 13l3 3-3 3"
);
// Per-word "teeth" boundary handle (#119) — internal word-boundary drag on a
// selected subtitle block. Slightly narrower than the trim handle so adjacent
// teeth on short words don't overlap.
export const WORD_TOOTH_HIT_W = 12;
export const SNAP_THRESHOLD_PX = 6;
export const RIPPLE_ANIM_MS = 200;
export const SEGMENT_RADIUS = 4;
export const MIN_SEGMENT_DURATION = 0.1;
