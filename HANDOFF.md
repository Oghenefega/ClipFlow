# ClipFlow — Session Handoff

_Last updated: 2026-08-05 — Session 154 (three quality-of-life fixes shipped on alpha.40: #242 pill heal, #243 schedule-conflict warning, #225 Part A readable CSV; installed and pill confirmed by Fega)._

---

## One-line TL;DR

Fega reported three items at session start; all three were diagnosed, built, CDP-verified, and shipped the same session on **0.3.0-alpha.40** (installed): hue-wheel game colors now save as hex and self-heal (Bionic Bay's pill is back — confirmed), the Queue's schedule picker warns when a picked time is already taken by a scheduled clip or tracker entry, and the Tracker CSV export is a readable report with header-aware import.

## Current State

Master pushed (`ff21365` features, `e6d6158` bump). Daily driver = **0.3.0-alpha.40, installed; Fega confirmed #242 visually** and gave blanket "I'm sure it all works" on the rest — #242 closed clean, #243 closed with `status: untested` (clears when he exercises the picker), #225 stays OPEN for Part B. Batch counter reset. Epic [#231](https://github.com/Oghenefega/ClipFlow/issues/231) open; [#234](https://github.com/Oghenefega/ClipFlow/issues/234) still data-blocked; [#183](https://github.com/Oghenefega/ClipFlow/issues/183) longitudinal; [#240](https://github.com/Oghenefega/ClipFlow/issues/240) still open — Fega's 6-step import verification remains undone (deferred two sessions now; alpha.40 carries everything alpha.39 did, so it can run on the current install).

## What Was Just Built (session 154)

- **#242 — hex-only game colors + self-heal (CLOSED, confirmed).** Root cause: ColorPicker's hue slider emitted `hsl(h,80%,55%)` strings; `GamePill` and every game-hue tint builds CSS by appending alpha to a hex (`${color}18`) — invalid for hsl, so background/border silently dropped while the text color rendered. Fix: `hslToHex` + `normalizeHexColor` in `shared.js` (slider now emits hex; validated by prod-data probe — Bionic Bay was the only hsl entry), and App.js normalizes any non-hex `gamesDb` color at load (the normalized array is reused by the dayCount migration so it can't reintroduce raw colors).
- **#243 — schedule-conflict warning (CLOSED, untested label).** `autoSuggestSlot`'s taken-slot builder extracted into `getTakenSlots()` (Map `"YYYY-MM-DDTHH:MM"` → `{title, kind: scheduled|published}`; sources = approved clips' `scheduledAt` across projects + tracker entries). The picker computes the conflict live and renders an amber line naming the occupant, same pattern as the #228 `schedPast` line. Warn-not-block by design — Save stays enabled; flipping to a hard block is one line if Fega asks.
- **#225 Part A — readable Tracker CSV (issue open for Part B).** New export layout `Date, Day, Time, Title, Game, Type, Scheduled, Source, MainGame, YouTube, TikTok, Instagram, Facebook, PlatformResults`: display game names via `resolveGameDisplay`, Main/Variety, Yes/No, Source labels (ClipFlow/Imported/Manual/Vizard), per-platform URLs (stored `url` first; YouTube + legacy-Facebook derived from postId; IG/TikTok never fabricated), JSON blob last as the round-trip payload. Import rewritten header-aware with a real quoted-CSV splitter (the old positional regex silently collapsed empty fields — would have broken on the new many-empty-column layout); accepts legacy 10-col AND new layout; reverse-maps labels (Imported→`import`, display game name→hashtag so per-game math keeps matching); no XP on import (locked rule).
- **Fega's CSV question answered in-product:** no "edited with ClipFlow" section needed — `QueueView.js` already stamps tracker rows `source: "import"|"clipflow"` at publish (#240 fence work), and the readable Source column surfaces it per row.

## Verification status

- **Machine-verified (CDP, dev profile, isolated):** 16/16 assertions across two drive runs — pill computed style exact (`#abe83018` → `rgba(171,232,48,0.094)`), export asserted against seeded entries covering every URL-derivation branch, legacy CSV imported through the real file input and persisted correctly, conflict warning appeared at a seeded taken slot / named the occupant / cleared on change, stable over 3 toggle rounds, Save never clicked. Fixture = scratch `projectsRoot` with a synthetic approved clip; dev settings restored byte-identical after.
- **Fega-verified:** #242 pill on the installed build. #243 and #225A ride his blanket sign-off; he'll flag if anything's off.

## Key Decisions

- **Heal-on-load over one-time migration** for bad colors: normalize every boot in App's load path. Commercial users who ever touched the wheel heal silently; no schema/version machinery.
- **Warn, don't block** on schedule conflicts (Fega asked to be "alerted"; deliberate double-posting stays possible).
- **Source column carries "edited with ClipFlow?"** — no duplicate Yes/No column; an explicit one is a one-liner if he wants Excel-filter convenience.
- **Part B of #225 deferred on purpose** (IG permalink fetch + TikTok post-id re-poll) — publish-flow changes that need a real publish to verify honestly.

## Next Steps (priority order)

1. **Fega runs the #240 6-step import script** (standing from s153, now two sessions deferred): drag 5 mixed OpusClip files → grid; bulk-fix a game + add one inline; skip 1, confirm 4; re-select same 5 → nothing offered; schedule 1 → publishes + tracker +1; horizontal file → flagged. Close #240 on his pass.
2. **#243 untested label** — clears when Fega actually collides two schedule times in-app (or reports the warning fired in real use).
3. **#225 Part B** when a real publish can verify: IG permalink Graph call after `media_publish`, TikTok raw-final-status logging + capped re-poll for the post id.
4. **#234 v3 re-test trigger check at session start** (standing): count v3 chips in RL's 50-row rejected window; fire at ≥15.
5. **#183 measurement continues:** `title_source` distribution after a batch of posts on the new build.

## Watch Out For

- **The old broken color only lived in prod's `clipflow-settings.json`** (`gamesDb` → Bionic Bay). It heals in-memory each load; the disk value updates on the next gamesDb write. Don't "fix" the file by hand.
- **Tracker CSVs exported before this session** (old 10-column layout) import fine — the parser is header-aware. But a NEW-layout file edited in Excel and saved may come back with re-quoted fields; the splitter handles standard quoting, not Excel's regional-settings semicolon delimiter. If Fega ever reports "import does nothing" on an Excel-edited file, check the delimiter first.
- **`getTakenSlots` matches exact minutes** — a clip at 2:30 and another at 2:35 do NOT warn. Deliberate (matches auto-suggest semantics); widen only if Fega asks.
- Carried from s153: `ClipFlow Imports` follows `path.dirname(outputFolder)`; retitling an imported clip renames its MP4; removing an import from the queue is permanent-ish (fingerprint stays remembered).

## Logs/Debugging

- **CDP drive scripts** for this session live in the session scratchpad (`a0ee6f6c…`): `qa-drive.js` (full suite), `qa-243-finish.js` (picker sequence), `qa-diag*.js` (fixture-load diagnosis), `qa-config.json`, screenshots `qa-242-pill.png` / `qa-243-conflict.png`.
- **Four new CDP traps recorded** in memory `project_cdp_verification_gotchas` (34–37): the stale `localProjects` store-cache fallback masking seeded fixture projects (delete the key from seeded dev settings), collapsed Settings groups UNMOUNT their content (expand "Content Library" before asserting chips), the shared `Select`'s clickable trigger is a `<button>` inside its root div, and re-clicking an expanded Queue row collapses it.
- No new Sentry-relevant error patterns; builds green (`vite build` chunk-size warning remains benign).
