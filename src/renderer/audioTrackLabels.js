// #271: single source of truth for audio-track label display text. Previously
// three hand-synced copies (calibration modal + two Settings pickers) drifted
// risk-free only by luck.
//
// The `value` keys are load-bearing: they persist in audioSetup and are
// allow-listed in main.js AUDIO_CAL_LABELS. Rename display `text` freely;
// NEVER rename or remove a value key without a migration.
export const LABEL_OPTIONS = [
  { value: "voice", text: "Mic", hint: "subtitles come from this track" },
  { value: "game", text: "Game/Desktop" },
  { value: "comms", text: "Comms", hint: "e.g. Discord" },
  { value: "music", text: "Music" },
  { value: "browser", text: "Browser" },
  { value: "mix", text: "Full Mix" },
  { value: "other", text: "Other…" },
  { value: "empty", text: "Empty / silent" },
];

export const LABEL_TEXT = Object.fromEntries(LABEL_OPTIONS.map((o) => [o.value, o.text]));
LABEL_TEXT.unknown = "?";

// Display name for a saved audioSetup track entry ({ index, label, customName? }).
// A custom name (from the "Other…" flow) wins over the generic label text.
export function trackLabelText(track) {
  if (!track) return null;
  if (track.customName) return track.customName;
  return LABEL_TEXT[track.label] || track.label;
}
