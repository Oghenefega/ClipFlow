# HANDOFF — Session 167 (2026-08-13)

## Current State
App is on **0.3.0-alpha.50** (installer cut, awaiting Fega's reinstall + visual sign-off); the Projects tab's clip dots went through a full redesign arc this session — vivid glass orbs → real-library red-wall incident → ember fix — all shipped and CDP-verified.

## What Was Just Built
- **Glass-orb clip dots** (alpha.49): status dots on Projects cards are now 10px lit glass spheres (specular highlight, saturated palette, soft glow), 6px gaps. Palette is `DOT_GLASS` in `ProjectsView.js` — deliberately NOT the theme tokens.
- **Progress-framed counts** (alpha.49): "10 of 15 left · 1 rendered" → "**5**/15 done" (counts lit orbs, grows as he reviews); reviewed cards show only "N to schedule"; wrapped cards "15/15 done". Kept-% removed from cards entirely (product call: it's an internal detection metric; low early numbers read as "app doesn't work").
- **Orb-hover breakdown popover** (alpha.49): hovering a card's orb row shows kept/rejected/to-review + in-queue/scheduled/published with colored minis (doubles as the color legend). Renders fixed-position at view root — cards clip + transform on hover, so it can't live inside them. 120ms show delay.
- **Ember treatment** (alpha.50, #254): rejected orbs are vivid red ONLY mid-review; once `leftToReview === 0` they fade to 22% opacity, no glow. Fix for the alpha.49 incident: Fega's real library (keeps 2-5 of 15-20 on old projects) rendered as a wall of glowing red — "doesn't make it look like ClipFlow actually works."

## Key Decisions
- **Rejection is curation, not failure** — the UI must not scoreboard the training exhaust. Never-empty detection guarantees red-heavy cards; the worst-case keep-rate must still look intentional. This framing drove both the kept-% removal and the embers.
- **Hide-rejected was ruled out** (mock proved the worms: empty rows on kept-nothing projects, "15/15 done" next to 2 orbs, dots vanishing mid-review). Kept-first sorting was offered, not picked. Fega chose embers as "cleanest".
- **Glance info costs a hover, never a click** — eye-icon reveal rejected in favor of orb-row hover.
- All three aesthetic rounds ran **mock-first in HTML** (`tasks/mocks/clip-dot-vibrancy.html`, `clip-count-reveal.html`, `rejected-orb-treatments.html`), opened via Start-Process.

## Next Steps
1. **Fega verifies alpha.50 installed** — Projects tab should read quiet-with-trophies. On his "looks good": close #254 (it's open on purpose — this session proved mock-approval ≠ in-app reality).
2. **Wick follow-ups** (inbox entry updated with same-day resolution): onboarding "first weeks = teaching it your taste" narrative; which cards belong in demo/marketing screenshots.
3. Detection program: next cell = #234 v3 re-test (data-gated, chips live since alpha.38 — check tag volume).
4. Session 166 leftovers untouched: `.agents/`, `.codex/`, `AGENTS.md`, stray mock files sit uncommitted in the tree (pre-existing, not this session's — left alone per surgical-changes rule).

## Watch Out For
- **Ember gate is `leftToReview === 0`** — includes "to schedule" cards, not just fully-wrapped. Intentional (matches the approved mock).
- **The hover popover is state at view root** (`orbTip` + `orbTipTimer` in ProjectsView) — if cards ever get another transform/overflow change, the fixed-position pattern is what keeps it unclipped; don't move it inside a card.
- **`DOT_GLASS` ≠ theme tokens.** Tracker/badges still use `T.cyan` etc. — the hues match visually but are separate values on purpose. Don't "unify" them.
- **Kept-% must not creep back onto cards** — comment in ProjectsView explains why; Fega's explicit product call this session.
- **New s167 rule now in clipflow-code-review:** status-color/aesthetic changes verify against the REAL data distribution with the worst-case card in the mock. The glass orbs passed every behavior check and still failed on gestalt.

## Logs/Debugging
- CDP drive scripts for this session's verification live in the scratchpad (`drive-orb-hover.js`, `verify-embers.js`) — pattern: launch `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`, ws-connect via `node_modules/ws`, `Runtime.evaluate`. Wrapped/mid-review classification keyed off the count-label text (`N/N done` vs `k/N done` vs "to schedule").
- Ember verification asserted per-card: rejected-orb spans (`background` contains `255, 69, 96`) have `opacity: 0.22` + no 9px glow on all 20 wrapped cards; vivid + glow on all 5 mid-review cards.
- Boot smokes on dev profile came up clean both rounds (schema v8, no renderer errors). `npm start` still exits 0 silently if the daily driver holds the single-instance lock — always boot-verify with `CLIPFLOW_PROFILE=dev`.
- No new Sentry-worthy errors observed this session.
