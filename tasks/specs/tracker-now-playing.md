# Now Playing Tracker — Phase 1 Spec

> Goal: replace the current Tracker tab with the "Now Playing" design — goal ring + pace,
> permanent XP rank, streak stakes, day-column week log, shareable weekly recap — and fix the
> publish-time data write so per-platform counts and post links are honest.
>
> Status (2026-07-03): Spec complete, Fega-approved direction. Produced by Wick (GM agent) from a
> 12-agent verified gap analysis — every code claim below was adversarially confirmed against this
> repo with file:line evidence. Design decisions are LOCKED by Fega; do not relitigate them.
>
> **Phase 2 (NOT this spec):** the Calendar view (browse past/present/future, day drawer, week
> drill-in). Its design session hasn't happened. Phase 1 ships the data it will need.

---

## Source material (read these)

- **The mock (the visual spec):** `Desktop\ClipFlow stuff\Tracker Redesign\tracker-now-playing.html`
  (1,036 lines, self-contained clickable prototype). Open it, click everything. The layout, copy
  tone, and interactions are the target. Its DATA is fake and several of its behaviors are mock
  fiction — this spec is the authority on behavior; the mock is the authority on look and feel.
- **Gap analysis (why each decision):** vault file
  `The Lab/Businesses/ClipFlow/Wick/tracker-now-playing-gap-analysis.md`.
- Current implementation: `src/renderer/views/TrackerView.js` (695 lines, being redesigned),
  `src/renderer/views/QueueView.js` (publish + logPost seam).

## Locked decisions (Fega, 2026-06-11 + 2026-07-03)

1. Frame = **"NOW PLAYING [game]"**. No "season" language anywhere.
2. **One editable weekly target** with a main-vs-variety split shown. Hard split = future toggle, not now.
3. **Pace-colored goal ring** with a "by today" tick + a live **streak stakes line**.
4. **Weekly XP rolls into ONE permanent, only-climbs rank.** Esports tiers, confident tone, no hype-bro copy.
5. **Tracker = motivation/identity. Queue = operations.** Published/Scheduled/Failed stats STAY in the Queue tab.
6. **Switch game changes the persistent MAIN game** — the tracker switcher IS the `mainGame` setting, surfaced.
7. **XP starts at zero for everyone.** No retroactive seeding from history.
8. **Streak hard-resets** when a week's goal is missed. No grace weeks. (Rank never drops; the streak is the stakes.)
9. **Share = rendered PNG image** of the recap card (Flowve mark included), not clipboard text.
10. **Template (slot times) editing stays ON the tracker page** as a compact overlay/mini editor — NOT moved
    to Settings. The old full-page edit mode is retired.
11. Tab toggle = **"This week / Calendar"** two states. The mock's Queue pill is dropped (duplicates main nav).
    In Phase 1 the Calendar pill renders but is disabled/marked "soon" (or hidden — coder's call, cheapest clean option).

## Verified code anchors (all adversarially confirmed 2026-07-03)

- **`logPost` is the ONLY auto-write seam** — `QueueView.js:1016-1020`, called at exactly 3 sites, all gated
  on `allSuccess`: `publishClip` (`:1151-1161`, scheduled variant `:1156`, immediate `:1159`) and the
  `retryFailed` tail (`:939-948`, gated `allSuccess && everyDone`). The renderer scheduler (`:598-640`)
  routes through `publishClip`, no separate write. No other success event exists (main process emits
  progress channels only). **XP award + structured platform recording + post IDs all hook here and only here.**
- **`trackerData` is permanent and uncapped** — settings store default `main.js:173`, persisted whole on every
  change `App.js:311`, loaded `App.js:214`. Only mutations: manual add `TrackerView.js:97`, CSV import
  `TrackerView.js:356`, publish `QueueView.js:1019`, user remove `TrackerView.js:111-114`. No trimming anywhere.
- **The "48" is `totalActiveCells`** — computed live `TrackerView.js:79-81` from the template grid
  (`DEFAULT_TEMPLATE` `App.js:31-41`, 8 slots x Mon-Sat = 48). **No goal/target setting exists anywhere**
  (grepped: no weeklyGoal/weeklyTarget/postTarget in src/). The template also drives scheduling
  (`QueueView.js:831,1014`) — decoupling the goal from the template is mandatory, or editing the goal
  rewires the posting schedule.
- **Game identity is end-to-end** — `gamesDb` (name/tag/color/hashtag) `main.js:154-162`, `mainGame` default
  `main.js:152`, persisted `App.js:305,307`. Entries are FROZEN at creation with `type` main/other +
  `mainGameAtTime` (`TrackerView.js:103-105`, `QueueView.js:1019`); nothing recomputes type later, so past
  weeks stay truthful when mainGame changes. `mainGameHistory` already logs every switch (`App.js:336-349`).
- **The `platforms` field on entries is a lie** — `QueueView.js:1019` writes
  `activePlat.map(p => p.abbr + "-" + p.name).join(", ")` where `activePlat` = ALL connected accounts
  (`:1011`), while the publish loop actually uses `enabledPlat` (per-clip toggles, `:1038-1042`). Accurate
  per-platform truth lives only in the publish log (capped at 500, `publish-log.js:20,44-46`) and in
  `clip.publishState` (dies with project deletion, `projects.js:191`). **Per-platform counts are NOT
  computable honestly from existing entries** — hence the keystone fix below.
- **No XP/rank/streak/celebration/global-toast code exists anywhere in src/** (grep-verified; all matches are
  false positives like "ranked gameplay" SEO strings). The motivation layer is 100% greenfield.
- **Scheduler = renderer setInterval every 60s, app-open only** (`QueueView.js:598-640`, limitation documented
  at `:603-604`). A clip scheduled Sat night can fire Monday on next launch. Note: the scheduled-publish
  entry already carries the SCHEDULED date/time, not the fire time (`:1152-1156`) — week attribution is
  already correct by accident; keep it that way.
- **Latent bug at the seam (fix in passing):** `QueueView.js:1115-1118` — a connected, enabled platform with
  no publish handler is marked "done" WITHOUT setting `allSuccess = false`. Dead today (all 4 wired) but it
  would let logPost fire without that platform publishing. Make it set `allSuccess = false` (or skip it from
  `enabledPlat`) so the invariant "entry = full success" stays true.

---

## The keystone data fix (do this first — everything honest depends on it)

At the logPost seam, replace the connected-accounts display string with the truth:

- New structured field on publish-created entries, e.g.
  `platformResults: [{ platform: "tiktok", accountId, postId, url? }, ...]` — one row per platform that
  ACTUALLY succeeded in this publish (source: the per-platform results the publish loop already has in
  hand; post IDs are already returned by the publish IPC calls and currently reach only the publish log).
- Keep writing the legacy `platforms` string for backward compat with CSV export and old readers, but ALL
  new UI computes from `platformResults`.
- Manual entries: the manual-log popover gains a platform picker (multi-select of the 4 platforms,
  optional, defaults to none) so manual posts can count in per-platform totals. Manual `platformResults`
  rows have no postId. (Decided: keeps the recap honest.)
- Old entries (pre-update) have no `platformResults` — treat as "platforms unknown"; they count toward clip
  totals but not per-platform counts. No migration/backfill.

## New persisted state (all follow the existing pattern: React state in App.js → `persist()` → settings store defaults in `main.js` STORE_DEFAULTS)

- `weeklyTarget` (number, default 48) — the editable goal for NEW weeks.
- `weekMeta` (object keyed by Monday-ISO) — per-week snapshot frozen at week start / first edit:
  `{ target, nowPlaying }`. Past weeks render with THEIR target and game, not today's.
- `xpLedger` (append-only array) — `{ key, amount, reason, dateISO }`. `key` is an idempotency key
  (e.g. entry id for per-clip XP, `goal-bonus:<mondayISO>` for bonuses) so nothing is ever double-banked.
  Rank/all-time XP = sum of ledger. **Nothing is ever removed from the ledger** — that is how
  "only climbs" is literally enforced (removing a logged clip does NOT claw back XP; decided).
- `streakState` — derived data cache: `{ evaluatedThroughMondayISO, current, best }` (see rollover).

## The engines

**XP + rank.** 10 XP per logged clip, awarded at LOG TIME as a ledger append (publish success at the
logPost seam; manual log at the manual-add action). CSV import does NOT award XP (no event = no append —
also closes the import-padding hole). 100 XP goal bonus per week the target is hit, banked at rollover
with key `goal-bonus:<mondayISO>`. Tiers: Bronze/Silver/Gold/Platinum/Diamond x III/II/I = 15 rungs,
320 XP per rung, from all-time ledger sum. Starts at zero. Rank badge + to-next-tier bar per the mock.

**Week rollover (lazy, derived — there is no background process and the app isn't always running).**
On app launch and on any trackerData/weekMeta write: for every completed week after
`evaluatedThroughMondayISO`, in order — count that week's entries vs its frozen target; if hit, append the
goal bonus (idempotent) and extend the streak; if missed, reset streak to 0; snapshot the recap (see below);
advance `evaluatedThroughMondayISO`. Order of operations on launch: let the due-clip scheduler tick run
FIRST (late-fired scheduled posts write entries dated to their scheduled week), then evaluate. If a
backdated entry flips an already-evaluated week from missed to hit, re-evaluation banks the bonus then and
recomputes the streak from the outcome history (streak is derived, so this self-heals).

**Pace.** Active days = Mon-Sat (6). Expected-by-now = `target × daysElapsed / 6` (whole days, today
counts after its first slot time or simply as elapsed — coder's call, keep simple). Ring color: green when
posted ≥ expected, yellow ≥ 85% of expected, red below. "By today" tick on the ring at expected/target.
Stakes line copy per the mock ("Hit N more by Saturday to keep your X-week streak alive"), plus a designed
"streak safe" state (target hit) and a calm "streak over — new one starts now" state (missed; confident
tone, not shame copy). All clock-driven from the real date — the mock's hardcoded Wednesday must not survive.

**Target editing.** Inline edit on the goal card (pencil affordance in the mock). Rules: raising is always
allowed; lowering below the week's already-posted count is blocked once the week has entries (closes the
lower-the-target-and-bank-the-bonus exploit). Edits update this week's `weekMeta` snapshot; the default
`weeklyTarget` changes only via an explicit "make this my default" (or simplest: editing also updates the
default — coder's call, but the exploit rule is non-negotiable).

**Recap card.** Computes from `platformResults`: total clips, distinct platform count, per-platform counts
(TikTok/YouTube/Instagram/Facebook cells), streak pill, rank pill, game pill, Flowve mark (bundle the logo
as a local asset). At rollover, freeze the completed week's recap into `weekMeta` so history stays truthful.
**Share = render the card to a PNG** (offscreen render of the card DOM — html-to-canvas approach or an
offscreen BrowserWindow capture, coder's call) → save-file dialog + copy-to-clipboard as an image where
supported. This card is the growth flywheel; it must look exactly as premium as the mock.

**Game switcher.** The "Switch game" popover lists `gamesDb` and SETS `mainGame` (same setting Settings
writes — one concept, now surfaced). `mainGameHistory` keeps logging automatically. Current week's
`weekMeta.nowPlaying` updates; past weeks keep theirs. Split bar and "NOW PLAYING" banner re-theme from the
game's `color`. Entries stay frozen (verified) so history doesn't rewrite.

## The view itself

Rebuild `TrackerView.js` to the mock's layout: week strip, Now Playing banner, goal ring card, rank card,
stakes bar, day-column week log (Mon-Sat, today highlighted, future days show "UPCOMING" + no logging ahead),
log-a-slot popover (game picker + the new platform picker; the mock's ClipFlow/Manual source toggle is mock
fiction — manual logs are always source "manual"), clip detail popover (game/time/platforms/source/Remove,
plus "View post" links per platform when `platformResults` rows carry postId/url), weekly recap card + Share.

- Existing view conventions: Tracker is an "existing view" — use the inline-`T`-theme style (like
  ProjectsView), NOT the shadcn/Tailwind editor stack. Extend `theme.js` with tokens for game accent, pace
  colors (green/yellow/red), and rank tier colors.
- Time slots come from the existing weekly template (`timeSlots`); the grid matches entries to slots the
  same way the current tracker does. The template remains the slot schedule and scheduling input — it just
  no longer defines the goal number.
- **Template mini-editor:** an edit affordance near the week log opens a compact overlay to adjust slot
  times (add/remove/edit times). Per-week overrides + presets data model stays; the old full-page edit mode,
  drag-to-reorder ceremony, and its toolbar are retired. Keep it small.
- CSV export/import: KEEP as-is (add `platformResults` as a JSON-encoded column on export; import tolerates
  its absence).
- Week navigation arrows + month-jump dropdown: REMOVED from this view (past-week browsing is Phase 2
  Calendar). The month-jump was hardcoded to 2026 anyway.
- Fonts/icons: DM Sans + JetBrains Mono are already the app's fonts. The mock's CDN Google-Fonts/Tabler
  links must NOT ship — bundle any icons locally or reuse the app's existing icon approach.
- Toasts/celebration: rank-up and goal-hit get a moment (count-up numbers per the mock; a local toast in the
  view is fine — don't build a global toast system for this).
- No new IPC, no schema/store version drama expected: all new state rides STORE_DEFAULTS + `persist()`
  like `trackerData` does today. New fields on tracker entries are additive.

## File impact (expected)

- `src/renderer/views/TrackerView.js` — full rebuild (the big one).
- `src/renderer/views/QueueView.js` — logPost seam: `platformResults` + postIds on entries; XP append on
  success; the `:1115-1118` allSuccess fix.
- `src/renderer/App.js` — new state (weeklyTarget, weekMeta, xpLedger, streakState) + persist wiring +
  rollover evaluation on launch; DEFAULT_TEMPLATE untouched.
- `src/main/main.js` — STORE_DEFAULTS additions only.
- `src/renderer/theme.js` — new tokens (game accent, pace, tiers).
- New: recap-card PNG render helper; XP/rank/streak/pace pure-logic module (keep the math in one file with
  unit-testable functions).

## Build order

1. Keystone data fix at logPost (+ the `:1115-1118` fix) + manual-log platform picker data.
2. Settings-store state + XP/streak/pace logic module (pure functions + rollover).
3. TrackerView rebuild to the mock (static layout first, then wire live data).
4. Popovers + template mini-editor overlay.
5. Recap card + PNG share.
6. `npm run build:renderer` + `npm start`, self-review pass, then Fega verification below.

## Verification (Fega, plain — ~10 min in the running app)

1. Open the Tracker: it looks like the mock (banner, ring, rank, stakes line, day columns, recap), themed
   to your main game's color, showing YOUR real logged clips for this week — correct counts, correct split.
2. Edit the weekly target: number changes everywhere (ring, pace, stakes). Try lowering it below what
   you've already posted — it refuses.
3. Publish a clip through the Queue: it appears in today's column within a moment, the ring ticks up, XP
   goes up by 10, and opening its detail popover shows the REAL platforms it went to, with working links
   to the live posts.
4. Log a manual clip: picker lets you tag platforms; it appears with the white dot.
5. Switch game from the banner: page re-themes, Settings shows the same new main game, and LAST week's
   view of the world didn't change.
6. Recap card shows honest per-platform numbers; Share produces a PNG that looks like the card.
7. Rank never goes down: remove a logged clip — count drops, XP does not.
8. ✅ all of the above / ❌ anything reads wrong, dead, or hardcoded.

## Watch out for

- Do NOT copy mock bugs: split hardwired to Arc Raiders, rank computed from weekly percent (placeholder),
  hardcoded Wednesday, dead pills, count animations that show zeros in a background tab (the mock fixed
  this with a document.hidden early-out — keep that fix in spirit).
- XP must be event-appended, never recomputed from trackerData (imports/removes would corrupt it).
- Week attribution for late-fired scheduled posts already lands on the scheduled date — don't "fix" that.
- Manual + auto entries BOTH count toward the goal and BOTH earn XP (it's a personal system; own-honesty).
  CSV imports earn nothing.
- The Tracker must never grow scheduling actions — that's the Queue's job (locked product boundary).
