# HANDOFF — Session 277 (2026-09-24)

## Current State

**0.5.0-alpha.14 is on the update feed.** It ships everything in session 277, plus session 276's game-research cost tracking:
- **Projects:** the clip grid (#467).
- **All three tabs:** one full-height clip panel for Projects, Tracker and Analytics (#466).
- **Tracker:** full width, views on posted clips, weekly goal chips (#468), the Switch fix (#469), and the metallic-glass Rank card with a Metal alternative (#470).
- **Import clips:** the AI title / original name switch (#465).

Issues #465–#470 are closed and labelled `status: untested`. Fega hasn't run alpha.14 yet.

## Key Decisions

- **One shared clip panel** (`src/renderer/components/ClipSidePanel.js`). It docks beside the page, never over it, and runs the tab's full height, with a 9:16 preview sized from that height and capped so the page keeps 40% of the width. Fega chose consistency across the three tabs over a smaller Tracker viewer.
- **Projects tiles are sized from the window,** with the whole project's clip count fitted to the visible height. They keep that size when the panel opens: the grid drops columns and scrolls. This replaces the s89 one-card-per-clip Review Rail, which is now overridden by Fega's ask.
- **Approving the open clip on Pending moves the panel to the next clip.** This was added unasked and flagged to Fega in chat; he hasn't objected.
- **Tracker cards keep their original look:** corner glow and thin game-colour border. A thumbnail-on-card pass was rejected ("a huge let down") and reverted the same session. The glow is now sized in % of the card, rows share a minimum height of 24–60 px, and there is a views line under the title.
- **Weekly goal = option A chips,** one per post in its game's colour, with a pulsing pace chip. The mock is at the scratchpad `mock/weekly-goal.html`.
- **Rank card = option A (Glass) by default, with option B (Metal plate) pickable** from a hover switch, stored as `trackerRankStyle`. Metal colours are literals (`TIER_METAL`). Light themes get the dark end of the metal via a `data-theme` MutationObserver, because a theme switch doesn't re-render React.

## Next Steps

1. **Ask Fega to test alpha.14:**
   > "Did the update come through? Open a project and approve and reject a few clips, from the tiles and from the panel on the right. That's the one part I couldn't test on your real clips. Then on the Tracker, hover the Rank card and flip Glass/Metal, try Switch on Now Playing, and click a posted clip and use 'See the breakdown in Analytics'. Anything off?"

   Each yes closes the loop on #465–#470: remove `status: untested` from each he confirms.
2. **Ask about the auto-advance:**
   > "When you approve the clip that's open in the panel on the Pending tab, the panel jumps to the next clip, so a run of approvals is ✓ ✓ ✓. Keep that, or would you rather it stayed on the clip you just approved? I'd keep it."
3. **Carried from s275/s276, still unasked:**
   - #463 missed-clips check.
   - #461 repost popup check.
   - The ↻ mark on 4-letter game tags. Note: the week log was restyled this session, so re-check how it looks first.
   - #464 research cost, which is now in alpha.14, so ask it with #1.
   - The Sonnet 5 detection-model test.
   - The s273/s274 checks (#454/#456/#457, the #459 in-app run, feedback rows #3/#29).
   The exact wording for each is in git: `git show 6a28ef3:HANDOFF.md`.
4. **Fable review** of this session's commits: 81c282e, 2a30779, 8ef8f16, c07732d, a187918. Plus the s276 list (e0d3cdd, 92f0972, fe8a8dc, 3479a87, 46ca0e9, 59970bf, 351f090, 9c74bf1).
5. **#456 (Tracker popup sizing) is superseded by #466.** Close it if Fega agrees the panel covers it.
6. **#462 (repost payoff analysis)** waits for a few days of `clip_metrics_history` per repost.

## Watch Out For

- **The dev profile reads Fega's REAL projects root (W:\…).** Approve/reject/rename in the Projects panel writes real project.json files. This session only viewed and clicked through. Use a fixture projectsRoot before testing decisions.
- **`usePaneBox` measures the view's parent padding box plus the tab's scroll pane.** A view mounted in a new container (different padding, no scroll ancestor) needs a check that the panel height and tile sizing still come out right.
- **Projects is now full width.** The ClipBrowser pane lost its 860 px cap, and so did the Tracker's 960 px cap, in App.js. Anything added to those views should size from the window, not assume a narrow column.
- **Headless/CDP screenshots of the mocks sometimes miss posters that load after a re-render.** The pages themselves are fine.
- **The `trackerRankStyle` store key is new and optional** (read with a fallback, so there's no migration).

## Logs/Debugging

- **Mock and verification helpers in the session scratchpad:**
  - `shot-at.js`: emulates a W×H window, runs expressions and takes a screenshot in ONE CDP session. Emulation resets when the socket closes.
  - `switch-probe.js`: a real-mouse click on Switch plus a containing-block probe.
  - `undef-check.js`: Babel-based undefined/unused names check, since the repo has no ESLint.
  - `cdp-call.js`.
- **#469 root cause, for any future fixed popover:** a `transform` on an ancestor makes it the containing block. `getBoundingClientRect()` on the popover showed x = −789. Check that with `document.elementFromPoint`.
