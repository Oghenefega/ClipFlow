# HANDOFF — Session 252 (2026-09-10)

## Current State

**The Analytics tab is rebuilt (#397, #398, #399) and verified on the dev profile against a copy
of the live database; Fega has not yet seen it on the installed build.** The page reads tiles →
insight sentences → thumbnail grid ranked against the median → learn cards (game, title author,
length, posting-slot heatmap) → growth line → collapsed table. Clicking a clip opens a panel with
the first frame (plays the rendered file in place), caption as posted, per-platform breakdown
with links, same-game clips, and Open in editor / Show in folder / open on each platform.

Main-process changes: migration v11 (`clip_metrics_history` + `clip_metrics.url`),
`upsertMetrics` writes the day's snapshot alongside the live row, Instagram permalinks are read
once per media and stored, TikTok `share_url` is passed through `toRow`, YouTube `fetchVideoStats`
now returns `{views, likes, comments}` per id (its one caller updated). `analytics:get` returns
`time`, `caption`, `urls`, `engagement` and `history` per clip. The renderer joins
`localProjects` for thumbnail, rendered path and cut length; App.js passes `localProjects` and an
editor entry with `from: "analytics"`.

Pure maths (medians, buckets, slots, window deltas, insight rules) is `src/shared/analyticsInsights.js`
(CJS, 17 tests in `src/main/__tests__/analyticsInsights.test.js`). Full suite: 25 suites, 464 tests.

Not built: #400 (Tier 2 hook metrics), #390 (trending games, caption/hashtag rollups), #389
(generator learns cross-platform), #395 (5-minute auto-refresh — would make first-48h curves finer).

## Key Decisions

- **Insights are deterministic rules, not an AI call.** A rule speaks only with ≥ 8 ranked clips
  and ≥ 5 per compared group; every card carries a "why" line. Wording lives in `buildInsights`.
- **Ranking is against the window's median**, never raw views, so one 97K clip does not hide
  everything else; group rollups use medians for the same reason. Grey bars = fewer than 3 clips.
- **Snapshots start now, from the numbers the refresh already fetches.** No extra API traffic.
  Deltas, sparklines, Growth and per-clip day 2 / day 7 stay honest empty states until two
  snapshot days exist. Refresh cadence unchanged (daily; weekly for clips over 30 days old).
- **Instagram permalinks** are fetched only for rows with no url, and only in a run that had
  something due, so the first daily refresh after this ships fills them and later runs cost nothing.
- **Clip length = cut-down timeline** (`nleSegments` sourceEnd − sourceStart), falling back to the
  raw span. Checked: "Sato is a MONSTER" segments sum 12.82s, rendered file 12.82s.
- **Platform stacked-bar order is YouTube, Facebook, Instagram, TikTok** — the dataviz validator
  flagged YouTube red next to Instagram pink as indistinguishable; never put them adjacent.
- Cards and the panel reuse the Projects list surface recipe (game-hue radial + linear tint,
  `color-mix` borders, `shadowCard`/`shadowLift`, 18px radius). Fega's ask: "silk, glass,
  premium, bezel/squircle edges, no sharp rectangles".

## Next Steps

1. **Cut an installer** — eleven commits are waiting since alpha.33 (s250 ×5, s251 ×3, s252). On
   the installed build Fega should: open Analytics, click a clip, try Open in editor + Back, Show
   in folder, and the YouTube/Facebook links; press Refresh once so Instagram permalinks land and
   the first snapshot day is written. Then remove `status: untested` from #397/#398/#399.
2. After two refreshes on different days: confirm the Total tile shows "▲/▼ N% vs previous 30
   days", the Growth card draws, and the panel shows day 2 / day 7 for a recent clip.
3. #400 when Fega wants hook metrics (IG `reels_skip_rate` / `ig_reels_avg_watch_time` may need no
   reconnect — try adding them to `IG_METRICS` and read the per-id errors first).
4. Carried: #388 (TikTok approval → flip switch → installer → Reconnect for views), #392,
   #383/#384/#385, #389/#390, #395.

## Watch Out For

- **`npm run dev:seed` overwrites the dev DB with the STALE repo `data/` copy after copying prod.**
  For a data-realistic dev run, copy `%APPDATA%\Corva\data\clipflow.db` over
  `%APPDATA%\clipflow-dev\data\clipflow.db` after seeding, then set
  `%APPDATA%\clipflow-dev\clipflow-tokens.json` to `{}` before booting. Done that way this session.
- **The dev app shows "No YouTube account connected" on every platform tile** because dev tokens
  are `{}` — expected; counts still render from the copied `clip_metrics`.
- **CRLF:** `analytics.js`, `analytics-core.js`, `tiktok-display.js`, `App.js` are CRLF;
  `database.js`, `youtube.js`, `meta-insights.js` are LF. Scripted edits must preserve each.
- The Analytics pane is `maxWidth: 1440` (other tabs 960); the grid is `auto-fill minmax(148px)`.
- `ClipDrawer` closes when the tab loses `active` so no `<video>` survives off-screen; the
  video teardown (pause, removeAttribute("src"), load()) runs on unmount and on clip change.
- The mockup that Fega approved is in the session scratchpad (`analytics-mock.html` + thumbs);
  it is not in the repo. The build follows it, plus the panel layout fix he asked for.

## Logs / Debugging

- Migration: `(database) Running migration v11: clip_metrics_history ...` / `Migration v11 complete`.
- Refresh summary unchanged: `(analytics) View refresh {youtube: {updated, skipped, failed}, ...}`;
  permalink pass: `Instagram: N of M permalinks missing` (warn) or `Instagram permalink pass failed`.
- Dev verification recipe: `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-features=CalculateNativeWinOcclusion`, then `node scripts/dev/cdp.js "<expr>"` /
  `node scripts/dev/cdp-shot.js out.png`. Nav to Analytics: click the leaf whose text is
  "Analytics" walking up to the first `cursor: pointer` ancestor (the H2 in the hidden pane is a
  decoy). Stop with `taskkill //F //IM electron.exe` (never Corva.exe).
- Snapshot SQL check without the app: open a copy of the dev DB with `sql.js`, run the two
  `d.run` statements from `upsertMetrics` (regex them out of `analytics.js`) — done this session,
  live row keeps its url via COALESCE, history row upserts per day.
