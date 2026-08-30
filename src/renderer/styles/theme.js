// ClipFlow Design System — single source of truth
//
// #328: the KEYS here are unchanged and the ~23 files that spread them into
// inline `style={{}}` objects are untouched. What changed is the values: each
// is now a CSS custom property, resolved from whichever palette is active on
// <html data-theme>. `var(--x)` is legal anywhere a colour is, inline styles
// included, so `style={{ color: T.text }}` just works and re-resolves the
// instant the theme attribute changes — no re-render, no context, no props.
//
// The palettes themselves live in ONE file: src/renderer/styles/themes.css.
// Add a theme there, add its id to THEMES below, add its canvas colour to
// THEME_CHROME in main.js. Nothing else.
const theme = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  surfaceHover: "var(--surfaceHover)",
  border: "var(--border)",
  borderHover: "var(--borderHover)",

  text: "var(--text)",
  textSecondary: "var(--textSecondary)",
  textTertiary: "var(--textTertiary)",
  textMuted: "var(--textMuted)",
  labelStrong: "var(--labelStrong)",

  accent: "var(--accent)",
  accentLight: "var(--accentLight)",
  accentDim: "var(--accentDim)",
  accentBorder: "var(--accentBorder)",
  accentGlow: "var(--accentGlow)",

  green: "var(--green)",
  greenDim: "var(--greenDim)",
  greenBorder: "var(--greenBorder)",

  yellow: "var(--yellow)",
  yellowDim: "var(--yellowDim)",
  yellowBorder: "var(--yellowBorder)",

  red: "var(--red)",
  redDim: "var(--redDim)",
  redBorder: "var(--redBorder)",

  // Clip-ladder "rendered / waiting in queue" stage. Deep orange on purpose —
  // at 14x6px dash size a soft orange is indistinguishable from yellow.
  orange: "var(--orange)",
  orangeDim: "var(--orangeDim)",
  orangeBorder: "var(--orangeBorder)",

  cyan: "var(--cyan)",
  cyanDim: "var(--cyanDim)",
  cyanBorder: "var(--cyanBorder)",

  // #328: text sitting ON a full-strength accent/green fill (the Queue's
  // Publish button). NOT the same as T.text — it is the opposite value, so a
  // light theme's white-on-green stays readable where T.text would vanish.
  onSolid: "var(--onSolid)",

  tiers: {
    Bronze: "var(--tierBronze)",
    Silver: "var(--tierSilver)",
    Gold: "var(--tierGold)",
    Platinum: "var(--tierPlatinum)",
    Diamond: "var(--tierDiamond)",
  },

  radius: {
    sm: "6px",
    md: "10px",
    lg: "14px",
    xl: "20px",
  },

  font: "'DM Sans', -apple-system, sans-serif",
  // Fega's call (session 101): one font everywhere — no more JetBrains Mono
  // (dotted zero). Token kept so existing T.mono call sites need no changes.
  mono: "'DM Sans', -apple-system, sans-serif",
};

// #328: the themes this build ships, in picker order. `blurb` is what the user
// reads under the swatch in Settings. `swatch` is a preview only — the real
// colours come from themes.css, and these five are copied from it so a card
// can paint a theme it is not currently wearing.
export const THEMES = [
  {
    id: "midnight",
    name: "Midnight",
    blurb: "The original. Default.",
    swatch: { bg: "#0a0b10", surface: "#111218", accent: "#8b5cf6", alt: "#34d399", text: "#edeef2" },
  },
  {
    id: "graphite",
    name: "Graphite",
    blurb: "Neutral grey, steel blue.",
    swatch: { bg: "#101113", surface: "#17181b", accent: "#5b93f7", alt: "#8ab4fa", text: "#e8eaed" },
  },
  {
    id: "forest",
    name: "Forest",
    blurb: "Dark green, emerald glow.",
    swatch: { bg: "#0a100d", surface: "#101712", accent: "#10b981", alt: "#3ce9a4", text: "#e9f2ed" },
  },
  {
    id: "amethyst",
    name: "Amethyst",
    blurb: "Dark purple, all the way.",
    swatch: { bg: "#0e0a16", surface: "#161022", accent: "#a855f7", alt: "#c4a1fd", text: "#f0ecfa" },
  },
  {
    id: "rose",
    name: "Neon Rose",
    blurb: "Dark, hot pink.",
    swatch: { bg: "#120810", surface: "#1c0d18", accent: "#ec4899", alt: "#f9a8d4", text: "#fdeef6" },
  },
  {
    id: "daylight",
    name: "Daylight",
    blurb: "Light, for bright rooms.",
    swatch: { bg: "#f3f4f7", surface: "#ffffff", accent: "#7c3aed", alt: "#0d9463", text: "#14151c" },
  },
  {
    id: "paper",
    name: "Paper",
    blurb: "Soft light, no glare.",
    swatch: { bg: "#edeae3", surface: "#f8f6f1", accent: "#7c3aed", alt: "#6d28d9", text: "#1e1c16" },
  },
  {
    id: "blush",
    name: "Blush",
    blurb: "Light pink.",
    swatch: { bg: "#fdf1f6", surface: "#ffffff", accent: "#db2777", alt: "#be185d", text: "#2a1020" },
  },
];

export const DEFAULT_THEME = "midnight";

// The one function that changes the app's theme. Writing the attribute is what
// repaints every colour in both styling systems; the store call only makes it
// survive a restart and repaints the native window chrome (see theme:set).
// `persist: false` is the boot call. The preload has already stamped
// <html data-theme> from the store, so re-writing it is a no-op — what the
// boot call is actually for is the <meta name="theme-color">, which ships as
// Midnight in index.html and would otherwise disagree with the screen until
// the user opened the picker. Persisting on boot would also mean an IPC write
// and a native-chrome repaint on every single launch, for nothing.
export function applyTheme(id, { persist = true } = {}) {
  const picked = THEMES.find((t) => t.id === id) || THEMES.find((t) => t.id === DEFAULT_THEME);
  document.documentElement.setAttribute("data-theme", picked.id);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", picked.swatch.bg);
  if (persist) {
    // Persists the choice and repaints the native window chrome (the compositor
    // background and the Windows caption glyphs) — see theme:set in main.js.
    window.clipflow?.setTheme?.(picked.id);
  }
  return picked.id;
}

export default theme;
