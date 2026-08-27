# HANDOFF — Session 210 (2026-08-26)

> Pending session title (set automatically at next session start): S210 · five follow-ups shipped, one commit each

## Current State

**The follow-up batch is done: #315, #318, #319, #320, #321 — five commits, one per issue,
built and verified before each.** `npm test`: 172 passing (was 158 — the media model got its
first test file, plus `occupantsFromLane` and the #318 window-clamp contract).

All five issues are **still open** with the commit hash and what was verified in a comment.
Fega has not seen any of it running: **no installer was cut this batch**, per his instruction.
The daily driver is still on `0.4.0-alpha.6`.

| Issue | Commit | What it does |
|---|---|---|
| #320 | `2564b06` | media lane guard rejects non-numbers like the sound twin |
| #321 | `686f828` | one occupancy question for both − buttons + a visible "why this lane won't close" |
| #315 | `df0f5ed` | retry logs the slot it went out in; half-published clips stay on the Tracker |
| #319 | `a0cb39b` | video overlays warm up 1.5s early; "no preview" state on undecodable files |
| #318 | `735c7aa` | a video overlay can never outrun its own file (4 places) |

## Key Decisions

1. **#321 followed Fega's call literally** — the lane refuses to close while a dormant
   placement holds it, AND says why (`DormantLaneNote`, always visible in the lane body, not
   hover-only: a hover-only hint would appear exactly where the missing − used to be). Both
   twins were routed through one shared helper, `occupantsFromLane(raw, laneIndex)`, so the
   UI gate and the store decision are the same question by construction, not by agreement.
2. **#315 Part B needed no new persisted field.** `publishedAt` and the earliest
   `publishState[k].at` are both already on the clip, so the Tracker card is *derived* in
   App.js and deliberately kept OUT of `schedByDate` — it counts as neither posted nor
   scheduled, and nothing is written until the retry really completes.
3. **#315 Part A was two bugs.** `retryFailed` also *overwrote* `publishedAt` with the retry
   time (`publishedStamped = false`), destroying the original stamp before anything could
   read it. Seeded from the clip now.
4. **#318 got a strategy, not patches:** a video overlay never carries an unknown length —
   refused at placement, healed from the preview element, probed and re-clamped at render and
   thumbnail. That made per-consumer patches unnecessary (`MediaBlock`'s `Infinity` fallback
   is now unreachable rather than wrong, so it was left alone).
5. **#319 did NOT take the keep-mounted option** — that is the one-live-`<video>`-per-block
   crash #311's design rules out. A 1.5s lead-in fixes the blank-first-frames symptom; scrub
   churn across the block edge is shifted, not eliminated.

## Next Steps

1. **Review the batch (Fable@xhigh, commit-by-hash):** `2564b06`, `686f828`, `df0f5ed`,
   `a0cb39b`, `735c7aa` — in that order (cheapest to deepest). `735c7aa` touches the main
   process and the FFmpeg graph; it is the one worth the most attention.
2. Then an installer (these five plus whatever the review produces) — the batch is small, so
   it may be worth waiting for a few more.
3. Beyond that the board is open — the commercial-launch items (#297–#303 data-safety family,
   #265 onboarding, #277 design pass) are the deep end.

## Watch Out For

- **`publishClip` has #315's untouched twin.** Same `publishedStamped = false` init, same
  `logPost(… new Date() …)`. A "Publish now" on an already-part-published clip would move its
  slot exactly the way the retry used to. Left alone on purpose (out of the ticket, and I
  couldn't establish the Queue offers that path for a failed clip) and flagged on #315.
- **`onError` does not catch ALAC.** #319's "no preview" state only fires for files that won't
  open at all. An ALAC-audio file decodes video fine with `audioDecodedBytes` exactly 0 and no
  error event — the silent half of the #178 family is still invisible.
- **The Bash tool eats backslashes** (`feedback_bash_backslash_collapse`) — it bit twice this
  session seeding Windows paths through `node -e`. A `` in a JS string literal became a
  control character and the file path silently pointed nowhere. Write fixtures with a Python
  heredoc building paths from `chr(92)`, or use forward slashes.
- **Editor autosave heals fixtures.** A seeded `durationSec: null` is rewritten within a
  second of opening the clip (that's #318 working). Back up `project.json` before seeding and
  restore after — all fixtures used this session were restored and verified empty.
- s206's timeline gotchas stay live if lane work continues (drag threshold gating, mid-drag
  re-parenting, `t >= trackIndex` on the last lane).

## Logs/Debugging

- **CDP driver** (`scratchpad/cdp.js`): Node 24's built-in `WebSocket` — no `ws` dependency
  needed. `node cdp.js "<expr>"` (awaits promises) and `node cdp.js --shot out.png`. Launch
  with `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-features=CalculateNativeWinOcclusion`; `curl` against `/json/list` returned
  nothing on this machine, plain `http.get` works.
- **Driving the editor from CDP:** the Projects tab has ten "Open in Editor" buttons in clip
  order — index them, don't try to walk up from the title. The transport play button has no
  title/label; find it by geometry (`y ∈ [480,520]`, `w ∈ [20,40]`). Sampling across playback
  works better as one `async` expression with `setTimeout` steps than several round trips —
  a 7s clip finishes between calls.
- **Headless render harness** (`scratchpad/render-harness.js`): `renderClip` can be called
  directly with a hand-built `clipData`/`projectData`. It needs `electron` for
  `app.isPackaged` — run it as `npx electron harness.js`, with an empty
  `app.on("window-all-closed")` and `app.quit()` in a `finally`. Pass no subtitle/caption
  segments and it never opens an overlay window. This is by far the fastest way to inspect
  the actual FFmpeg args for an overlay change.
- Dev-profile fixtures used: `proj_1787202860841_9watay` clip `clip_1787202987979_b8ny`
  ("Clip 2", rejected — the sacrificial one) for lane and overlay tests;
  `proj_1781809720641_ao4s6a` clip `clip_1781810072345_dbpt` for the #315 Tracker card.
  Both restored from backups in the session scratchpad.
