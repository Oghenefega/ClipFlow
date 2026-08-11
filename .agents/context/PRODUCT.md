# ClipFlow — Product Context

register: product

## What it is

Commercial Windows desktop app (Electron + React) for gaming/streaming content
creators. Automates the content pipeline: OBS recording → rename → AI clip
detection → editor (subtitles, audio, reframe) → render → schedule & publish to
YouTube/TikTok/Instagram/Facebook. Subscription + lifetime license model.
Currently in personal-testing phase (Fega, the founder, is user #1); beta
testers arriving next.

## Users

Gaming and streaming creators at their gaming PC, usually at night, working
through a batch of clips. They are in a task, not browsing. Fluent in OBS,
Premiere-class editors, and platform studio dashboards.

## Tone & aesthetic

- Dark, dense, quiet. Compact information-rich layouts are a stated preference,
  not a compromise.
- One font everywhere: DM Sans (JetBrains Mono banned, dotted zero).
- Violet accent (#8b5cf6) for action/selection/attention only.
- Small indicators must glow to survive the dark background.
- Every action gets visible feedback (animation, color change, or toast).

## Anti-references

- AI-cliché left-edge color bars on cards. Banned.
- Bright SaaS marketing aesthetics inside the app.
- Gestures as the only path to a capability: a requested control gets a visible
  button/slider, gestures are accelerators.

## Process rules

- Aesthetic-sensitive UI is mocked in HTML (tasks/mocks/) and reviewed by Fega
  in his browser BEFORE building.
- New controls go in dead space inside a card's current footprint before the
  card is allowed to grow.
- Design tokens: src/renderer/styles/theme.js (source of truth). More rules:
  .claude/rules/ui-standards.md.
