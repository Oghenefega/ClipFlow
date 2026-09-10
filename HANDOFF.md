# HANDOFF — Session 252 (2026-09-10)

## Current State

**0.5.0-alpha.1 is installed on the daily driver and Fega confirmed it works.** It carries the
rebuilt Analytics tab (#397: tiles → insight sentences → thumbnail grid ranked against the
median → learn cards → growth line → collapsed table, with a clip panel that plays the render,
shows the caption as posted and per-platform links, and opens the editor / Explorer / each
platform), daily view snapshots (#398, migration v11), captured Instagram permalinks + YouTube
likes/comments + TikTok share_url pass-through (#399), plus everything since alpha.33 (Meta
sign-in repairs, token renewal, #393, TikTok view-count build behind its switch, #396). Fega
moved the minor number himself: the Analytics tab "is the start of something even bigger".

Master at `647cd26` plus this wrap. Pure maths for the tab is `src/shared/analyticsInsights.js`
(17 tests); full suite 25 suites / 464 tests green.

## Key Decisions

- **Insights are deterministic rules, not an AI call** — ≥ 8 ranked clips before any card speaks,
  ≥ 5 per compared group, every card carries a "why". Wording lives in `buildInsights`.
- **Ranking and rollups use medians against the window**, never raw sums, so one 97K clip does
  not hide the rest. Grey bars = fewer than 3 clips.
- **Snapshots come from the numbers the refresh already fetches** (no extra API traffic); every
  history-dependent spot (tile delta, sparkline, Growth card, panel day 2 / day 7, Momentum
  insight) is an honest empty state until two snapshot days exist.
- **Instagram permalinks** are read only for rows without a url and only in a run that had
  something due — the first daily refresh fills them, later runs cost nothing.
- **Clip length = cut-down timeline** (`nleSegments` sourceEnd − sourceStart), checked against a
  rendered file (12.82s both ways).
- **Platform bar order YouTube, Facebook, Instagram, TikTok** — the dataviz validator flagged
  red next to pink; never put them adjacent.
- Cards/panel reuse the Projects list surface recipe (game-hue tint, `color-mix` borders,
  `shadowCard`/`shadowLift`, 18px radius) — Fega's "silk, glass, premium, squircle" ask.

## Next Steps

1. **Tomorrow's first look:** after two refreshes on different days the Total tile should read
   "▲/▼ N% vs previous 30 days" with a sparkline, the Growth card should draw, and a recent clip's
   panel should show day 2 / day 7. First refresh on the new build also fills Instagram links
   (panel's Instagram button turns on).
2. **#400 (Tier 2 hook metrics)** when Fega wants them — try adding `reels_skip_rate` and
   `ig_reels_avg_watch_time` to `IG_METRICS` first; they may need no reconnect.
3. **#395** (5-minute auto-refresh while the tab is open) would make first-48h curves much finer.
4. Carried: #388 (TikTok approval → flip `TIKTOK_VIEWS_ENABLED` → installer → "Reconnect for
   views"), #392, #383/#384/#385, #389/#390.

## Watch Out For

- **Version line:** counter ticks as 0.5.0-alpha.2, .3 … — only Fega moves the minor
  (memory `feedback_version_semantics`). Feed manifest is still `alpha.yml`.
- **`npm run dev:seed` overwrites the dev DB with the STALE repo `data/` copy after copying prod.**
  For a realistic dev run: copy `%APPDATA%\Corva\data\clipflow.db` over
  `%APPDATA%\clipflow-dev\data\clipflow.db` after seeding, then set
  `%APPDATA%\clipflow-dev\clipflow-tokens.json` to `{}` before booting.
- **`sed -i` flips CRLF → LF** on CRLF files in this Git Bash (caught on CHANGELOG.md and
  release-notes.js; restored). CRLF files touched here: `analytics.js`, `analytics-core.js`,
  `tiktok-display.js`, `release-notes.js`, `CHANGELOG.md`, `HANDOFF.md`, `tasks/lessons.md`.
  Use a node script that detects and restores the ending (pattern: s252 scratch `patch-main2.js`).
- The Analytics pane is `maxWidth: 1440` (other tabs 960); grid is `auto-fill minmax(148px)`.
- `ClipDrawer` closes when the tab loses `active`; the `<video>` teardown (pause,
  removeAttribute("src"), load()) runs on unmount and clip change. Verified no stray video after
  Open in editor → Back.
- The approved mockup (`analytics-mock.html` + copied thumbs) lives only in the s252 scratchpad.

## Logs / Debugging

- Migration: `(database) Running migration v11: clip_metrics_history ...` / `Migration v11 complete`.
- Refresh: `(analytics) View refresh {youtube: {updated, skipped, failed}, ...}`; permalink pass
  warns `Instagram: N of M permalinks missing` or `Instagram permalink pass failed`.
- Dev verification: `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-features=CalculateNativeWinOcclusion`, then `node scripts/dev/cdp.js "<expr>"` /
  `cdp-shot.js out.png`. Navigate by clicking the leaf whose text is "Analytics" and walking up to
  the first `cursor: pointer` ancestor (the H2 in the hidden pane is a decoy). Stop with
  `taskkill //F //IM electron.exe` — never Corva.exe.
- Snapshot SQL without the app: open a copy of the dev DB with `sql.js` and run the two `d.run`
  statements from `upsertMetrics` — live row keeps its url via COALESCE, history upserts per day.
