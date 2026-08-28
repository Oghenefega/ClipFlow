---
paths:
  - "src/renderer/**"
---

# Visual Design Standards

Four themes since #328 — Midnight (dark, default), Daylight (light), Neon Rose
(dark pink), Blush (light pink). Tokens: `src/renderer/styles/theme.js` for the
`T` object, whose values are CSS variables resolved from
`src/renderer/styles/themes.css`. Never hardcode a colour that means "surface",
"border" or "text" — use `T`, or `rgba(var(--lift), a)` for a subtle tint, which
flips polarity so one alpha works on both dark and light. Literal colours are
only for things that are NOT chrome: platform brand, the user's game colours,
subtitle/caption styling, and anything painted over video frames.

Never string-append an alpha suffix to a `T` colour — `` `${T.green}33` `` is
invalid CSS since #328 (T values are `var()` strings) and the declaration is
silently dropped. Use the `Dim`/`Border` tokens, or
`color-mix(in srgb, ${T.x} N%, transparent)` for an exact alpha. Appending to a
literal game colour from gamesDb is still fine.

| Element | Standard |
|---------|----------|
| Indicator dots | Min 7-8px with `boxShadow` glow (`0 0 6px <color>`) |
| Scrollbar overflow | Outer: `overflow: hidden`. Inner: `overflow: auto` |
| Long dropdowns | Split into columns/groups when 10+ items |
| Badge/tag placement | At list-item level, never buried in detail views |
| Font consistency | Match typography scale from `theme.js` |
| Toggle states | Green = on, gray/red = off. Never green for both |
| Visual feedback | Every action needs confirmation: animation, color change, or toast |
| Small indicators | Must have glow/shadow to be visible on dark bg |
| Requested controls | A capability the user asked for gets a visible dedicated control (slider/button). Gestures (drag surfaces) are accelerators only, never the sole path (session 105: drag-only bg pan read as "can't pan") |
| Redundant actions | Don't add a secondary save/confirm button when the primary commit action can absorb it — if every X follows an Apply, Apply should do X (session 105: "Save layout" folded into Apply) |
| Adding to existing cards | Place new controls in dead space within the card's current footprint before growing it — Fega circles empty regions (session 131: reason chips moved from under the reject button to the space under the transcript) |
