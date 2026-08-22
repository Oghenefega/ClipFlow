/**
 * Recent Colours + shared editor palette (#283)
 *
 * Both editor colour pickers — the effects popover in RightPanelNew and the
 * inline toolbar picker in PreviewPanelNew — take their swatches from here, so a
 * colour mixed in one turns up in the other. Recents persist to localStorage
 * (same pattern as the drawer width, RightPanelNew.js) because the editor
 * remounts on every clip open and the history has to outlive that.
 *
 * Callers write a recent when the picker CLOSES, not on every onChange — dragging
 * across the gradient fires continuously and would otherwise bury the list under
 * a smear of near-identical intermediate values.
 */

const STORAGE_KEY = "clipflow-editor-recent-colors";

export const RECENT_LIMIT = 16;

// Fixed palette: neutrals + true primaries/secondaries, then vivids, then pops
// plus three dark tones — this picker also sets stroke and shadow colours, where
// dark is the point.
export const PALETTE_COLORS = [
  "#ffffff", "#000000", "#ff0000", "#ff7a00", "#ffff00", "#00ff00", "#00ffff", "#0000ff",
  "#ff2d55", "#ff9500", "#ffd60a", "#4cce8a", "#00e676", "#00b8ff", "#7c4dff", "#ff00ff",
  "#ff69b4", "#a3ff00", "#39ff14", "#c026d3", "#8b5cf6", "#6b7280", "#3a3a3a", "#101010",
];

const isHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

export function getRecentColors() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(raw)) return [];
    return raw.filter(isHex).map((c) => c.toLowerCase()).slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function pushRecentColor(color) {
  if (!isHex(color)) return getRecentColors();
  const hex = color.toLowerCase();
  const next = [hex, ...getRecentColors().filter((c) => c !== hex)].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / disabled storage — recents are a convenience, never block the pick */
  }
  return next;
}

// Near-white and near-black swatches vanish against the popover, so they get a
// visible rim.
export function needsOutline(color) {
  if (!isHex(color)) return false;
  const n = parseInt(color.slice(1), 16);
  const avg = (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
  return avg > 235 || avg < 40;
}
