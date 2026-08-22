/**
 * The single list of editor keyboard shortcuts.
 *
 * Both the key handler (useEditorShortcuts) and the on-screen cheat sheet
 * (ShortcutsDialog) read this list, so the popup can never drift from what the
 * keys actually do. Adding a shortcut here makes it appear in both.
 *
 * Keys are stored in a canonical form produced by eventToKey(): lowercase,
 * modifiers first, "+"-joined — "space", "u", "ctrl+.", "delete".
 */

export const GROUPS = ["Playback", "Editing", "View"];

export const SHORTCUTS = [
  // ── Playback ──
  { id: "playPause", defaultKey: "space", group: "Playback", label: "Play / pause" },
  { id: "fastForward", defaultKey: "r", group: "Playback", label: "Fast forward", hint: "Press again for 2× then 4×" },
  { id: "rewind", defaultKey: "e", group: "Playback", label: "Rewind", hint: "Press again for 2× then 4× — silent" },

  // ── Editing ──
  { id: "split", defaultKey: "u", group: "Editing", label: "Split at playhead" },
  { id: "trimStart", defaultKey: "m", group: "Editing", label: "Start to playhead", hint: "Trims away everything before it" },
  { id: "trimEnd", defaultKey: "s", group: "Editing", label: "End to playhead", hint: "Trims away everything after it" },
  { id: "deleteSelected", defaultKey: "delete", group: "Editing", label: "Delete selected", altKeys: ["backspace"] },
  // #296. Note M is Trim-start, so Resolve's M-for-mute is not available here.
  // The lane toggle is ALT+D, not Shift+D: eventToKey() below deliberately drops
  // Shift when it's the only modifier on a printable character, so "shift+d"
  // canonicalises to plain "d" and could never match.
  { id: "toggleDisable", defaultKey: "d", group: "Editing", label: "Disable / enable selected", hint: "Stays on the timeline, leaves the viewer and the render" },
  { id: "toggleLaneDisable", defaultKey: "alt+d", group: "Editing", label: "Disable / enable the whole lane", hint: "The lane the selection sits on" },
  { id: "undo", defaultKey: "ctrl+z", group: "Editing", label: "Undo" },
  { id: "redo", defaultKey: "ctrl+y", group: "Editing", label: "Redo", hint: "Ctrl + Shift + Z also works", altKeys: ["ctrl+shift+z"] },

  // ── View ──
  { id: "toggleTimeline", defaultKey: "ctrl+.", group: "View", label: "Collapse / expand timeline" },
  { id: "showShortcuts", defaultKey: "?", group: "View", label: "Keyboard shortcuts" },
];

export const defaultBindings = () =>
  Object.fromEntries(SHORTCUTS.map((s) => [s.id, s.defaultKey]));

/**
 * Canonical key string for a keydown event.
 *
 * Shift is not recorded when it's the ONLY modifier on a printable character:
 * the browser has already folded it into e.key ("?" is what Shift+/ produces),
 * so recording it would store "?" as "shift+?" and never match. Alongside
 * Ctrl/Alt it IS recorded, so Ctrl+Shift+Z stays distinct from Ctrl+Z rather
 * than firing Undo. Ctrl and Meta collapse to one token so a binding works the
 * same on either.
 */
export function eventToKey(e) {
  let k = e.key;
  if (k === " " || k === "Spacebar") k = "space";
  k = k.toLowerCase();

  const ctrl = e.ctrlKey || e.metaKey;
  const parts = [];
  if (ctrl) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey && (k.length > 1 || ctrl || e.altKey)) parts.push("shift");
  parts.push(k);
  return parts.join("+");
}

const KEY_LABELS = {
  space: "Space",
  delete: "Del",
  backspace: "Backspace",
  escape: "Esc",
  enter: "Enter",
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
};

/** Human-readable form of a canonical key string, for display only. */
export function formatKey(key) {
  if (!key) return "—";
  return key
    .split("+")
    .map((part) => KEY_LABELS[part] || (part.length === 1 ? part.toUpperCase() : part))
    .join(" + ");
}
