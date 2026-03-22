---
paths:
  - "src/renderer/**"
---

# Visual Design Standards

Dark theme. Key tokens in `src/renderer/styles/theme.js`.

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
