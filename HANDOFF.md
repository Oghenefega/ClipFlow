# ClipFlow — Session Handoff
_Last updated: 2026-07-09 — Session 96 — **Tracker Phase 1 VERIFIED by Fega in the dev build (6/7 checks) + all 7 verification findings fixed same-session. Phase 2 (Calendar) gate is OPEN — build it next session.**_

---

## One-line TL;DR
Fega ran the Phase 1 verification script in the dev build (`npm run dev`), flagged 7 things; all were root-caused and fixed same-session (`4eafac9` + `6f3b791`) — popover un-clipped, day columns became a real time grid, brand-color platform toggles, compact detail icons, portrait recap + 1080×1920 story PNG, TODAY label dropped, watermark → ClipFlow. Phase 2 Calendar (spec ready, design locked) starts next session.

## Current State
On **0.1.8-alpha.12** installed; source is now **10 commits ahead** of the installed app (sessions 90–96) — all riding the next batched installer. Tracker Phase 1 is Fega-verified in dev except one check: **publishing a REAL clip through the Queue** (ring +1, +10 XP, live post links) — waits until he next has a post; it exercises Phase 1's Queue seam, so it does NOT block Phase 2. Working tree: usual never-commit `data/` pair + `tasks/mocks/` scratch (untracked, predates this session).

## What Was Just Built
- **Verification round on Phase 1** (Fega's findings → fixes, all in `TrackerView.js` unless noted):
  - **Switch-game popover clipped to 2 games** — it lived inside the banner div whose `overflow:hidden` (needed for the bg art) cropped it. Now `position:"fixed"` anchored to the button via `getBoundingClientRect` (captured in a `useLayoutEffect` on open) + `maxHeight:340, overflowY:auto`. Outside-click close unchanged.
  - **Day columns weren't a time grid** — entries rendered above all open slots (a 9:30p clip floated to the top), and "+" tiles had no time label (Fega clicked 1:30p believing it was 9:30p). Now one merged, time-sorted `dayRows` list: slots filled by matching entries, empty slots show `+ <time>`, non-slot-time entries insert chronologically.
  - **Platform toggles** (log popover): ON = brand-color fill (`PLATFORM_BRAND_COLORS`, `${brand}40` bg + solid brand border), OFF = dimmed icon (`opacity:0.45`) on neutral.
  - **Detail popover**: platform rows → one compact row of 30×30 icon chips; linked chips (row.url) get a ↗ corner badge and open via `openExternal`; manual chips muted. Legacy `entry.platforms`-string fallback kept.
  - **Recap card portrait** (maxWidth 340, 2×2 platform grid, full-width Share) + **share PNG rewritten to 1080×1920 story format** (`recapCardImage.js`, SCALE 1, flow-based cursorY layout so long headlines never collide, pills wrap, mark bottom-center).
  - **"TODAY" text removed** from today's column (pushed slots out of alignment; purple hue suffices). **Watermark "Flowve" → "ClipFlow"** on card + PNG (Fega override of the spec — memory `project_recap_watermark_clipflow`).
- **XP only-climbs re-confirmed by Fega** when he questioned it mid-verification (his test XP lives in the dev profile only; prod starts at zero when Phase 1 ships).

## Key Decisions
- **Watermark is ClipFlow, never Flowve** — Fega overrode the Phase 1 spec during verification; the spec text still says "Flowve mark," do not regress from it (Phase 2 renders frozen recaps — keep consistent).
- **Share PNG = 9:16 story (1080×1920)** so recaps are directly postable to TikTok/IG; SCALE dropped 2→1 (already full story resolution).
- **Popover un-clipping via `position:fixed`**, not moving JSX out of the banner — fixed elements escape ancestor `overflow:hidden` as long as no ancestor sets transform/filter (banner sets none). If a transform is ever added to the banner, this breaks.
- **Empty slots always show their time** — the misclick Fega hit was an unlabeled-"+" problem as much as an ordering one.
- **Delegation model again:** 2 parallel Sonnet subagents (TrackerView / recapCardImage — disjoint files), main-session review verified the two build-can't-catch risks (`useLayoutEffect` import present, `PlatformIcon` forwards `style`) before accepting.

## Next Steps (prioritized)
1. **Phase 2 — Calendar view** (fresh session, Fega inclined to go): read `tasks/specs/tracker-calendar.md` FIRST — locked decisions, code anchors, build order, ~5-min verification script. Visual target = **P3 Hybrid** tab of `Desktop\ClipFlow stuff\Tracker Redesign\tracker-calendar-prototypes.html`. Enables the disabled Calendar pill (`TrackerView.js` — line moved by this session's edits, grep `Calendar`), read-only month grid + week scoreboard + day drawer + week drill-in, zero new persisted state, reconcile shipped `streakOverVariant` copy with the locked streak-lost design.
2. **Phase 1 closeout check** whenever Fega next publishes for real: clip appears in today's column, ring +1, XP +10, detail popover shows actual platforms with working links.
3. **Installer batch** is well past threshold (10 commits) — cut on Fega's "update the launcher."
4. **Silent-failures batch** #150/#151/#152 (+#153) — session-92 plan.
5. **Projects tab finish** (premium header + width-capped column + hover-to-play + REVIEW pill).

## Watch Out For
- **PNG rendered pixels never eyeballed** — geometry dry-run only. Fega said the card "looks fine" pre-rewrite; if the 9:16 PNG looks top-heavy (content flows from top, mark anchored bottom → possible mid gap on short headlines), rebalance by vertically centering the content block.
- **Switch-game popover is `position:fixed`** — it will NOT follow the button if the page scrolls while open (closes on outside-click, so low risk); and any future `transform` on an ancestor re-introduces clipping.
- **XP ledger append-only; calendar dates LOCAL (`localISO`)** — standing Phase 1 invariants, see session 94–95 handoff notes / memories `user_timezone_est`.
- **Fega tests in the DEV profile right now** (`npm run dev`, `clipflow-dev` data) — his dev-profile XP/test entries are throwaway; prod is untouched until an installer ships.
- **`package.json` silent-strip gotcha** ([[project_package_json_strip]]) — check 99 lines if builds break.

## Logs / Debugging
- **Builds:** `npm run build:renderer` clean ×3 this session (~12–13s, standing >500 kB chunk warning only). Dev instance (`npm run dev`, Vite :3000 + Electron, profile `clipflow-dev`, booted 0.1.8-alpha.12) ran clean all session — no renderer errors surfaced during Fega's verification.
- **Two build-can't-catch traps checked by hand** (worth repeating after subagent UI work): a missing React hook import (`useLayoutEffect`) and a component silently dropping a passed `style` prop both pass Vite build and only fail at runtime.
- **Commits this session:** `4eafac9` (5 verification fixes), `6f3b791` (TODAY label + ClipFlow watermark), plus this wrap commit.
