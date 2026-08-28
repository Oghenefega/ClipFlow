# HANDOFF — Session 216 (2026-08-28)

## Current State

**Session 3 of the approved 8-request plan is done: the Settings revamp (#331) is on master in
`5938b26`.** Six stacked accordions became a sticky left rail with seven sections, a cross-section
search box, and one content pane at a time. Closed `status: untested`.

**It is NOT in an installer.** The live update feed is still `0.4.0-alpha.9`, which does not contain
this. Fega cannot see the new Settings on his daily driver until the next cut.

**Fega has still not installed or tested alpha.9.** #325 and #324 remain `status: untested` from
session 215, and #331 now joins them — three issues waiting on one installer.

**Answered from last session's open question:** the What's New screen (#330) works. The dev boot this
session opened straight into it with alpha.9's full notes rendered — Added / Changed / Fixed, "Got
it" dismisses. That was listed as "the bug to chase if it doesn't appear"; it appeared.

**Still outstanding from session 214, still no response from Fega:** the two GTA 6 clips the dev
profile auto-published are partially published (Facebook/TikTok/Instagram out, YouTube failed on an
expired token). They need a YouTube reconnect in Settings then Retry from the Queue. Their tracker
entries are in the DEV store, so the prod Tracker will not show them.

## Key Decisions

1. **Seven sections, not the six the issue described.** "Files & Folders" carried eight cards — a
   third of Settings — and three of them were not folders, so Video Splitting, Recording Layout and
   Pipeline Quality became a **Pipeline** section. Presented to Fega with the mock and approved
   explicitly ("left rail with 7 sections, go"). Also renamed: Content Library → **Games**, Tools &
   Credentials → **Tools & Keys**.
2. **Left rail over top pills.** Both were built into the mock behind a toggle so Fega could compare
   in one click. He chose the rail. It is `position: sticky` inside the tab's scroll container, which
   is what satisfies the issue's "current section always visible" bar.
3. **Search indexes keywords, not just titles.** A title-only index would not answer "where do I
   connect YouTube" — the word appears in no card title. The 24-entry index carries a `kw` string of
   the words someone would actually type, plus the section name, so "youtube" returns Connected
   Platforms *and* API Credentials from two different sections.
4. **`Card` gained an optional `id` prop** (`src/renderer/components/shared.js`) so search can scroll
   to a specific card. Backward compatible — every existing call site passes nothing. The six nested
   sub-components that render their own Card get their anchor from a wrapper `<div id>` at the call
   site instead, since `cardProps` is not in their scope.
5. **The mock's rail-footer buttons were deliberately NOT built.** "Open app data folder" and "Check
   for updates" were filler I invented for the mock; making them real is new feature work, not a
   layout reshuffle. Flagged to Fega in the wrap message. The version number stays where it was —
   inside the Dev Dashboard's click counter, untouched.

## Next Steps

1. **Remaining plan sessions, in order:** #328 (themes), then #329 (publish mode — already decided as
   option (b), a main-process scheduler; formally amends "Close = quit").
2. **Cut an installer when the batch justifies it.** Three `status: untested` issues are queued
   behind one (#325, #324, #331). Two more plan sessions would make it a natural cut point — but
   don't cut per-fix; wait for the batch or an explicit ask.
3. **Flip #325/#324/#331 off `status: untested`** once Fega confirms on the installed build.
4. **Fega's call on the two half-published GTA clips** (keep or delete), then reconnect YouTube and
   Retry to finish their YouTube legs.

## Watch Out For

- **`src/main/release-notes.js` has an `"unreleased"` entry again** — this session created it, holding
  the Settings revamp's three user-facing lines. The next cut RENAMES it to the real version. If a
  future session cuts an installer and then adds more work, it must open a new one or the following
  update ships silent (this is exactly what happened after alpha.9).
- **The dev tokens file reads `{"accounts":{}}`, not literally `{}`.** That is still empty and safe.
  Check for an empty `accounts` map before any dev boot, not the literal string. Verified empty both
  before and after this session's boot.
- **SettingsView's cards were re-parented, not re-indented.** Section fragments open at
  `{!searching && activeSection === "x" && <>` and close at `</>}`; everything between keeps its
  original indentation on purpose, exactly as QueueView's left column was handled in s215. Don't
  "fix" the indentation — it would bury the next real diff under a thousand whitespace lines.
- **Games and Content Types share one `<Card>`.** Two headings, one box. Both are in the search index
  pointing at the same anchor id (`set-games`), and the rail count deduplicates by id — which is why
  Games shows **3**, not 4. If anyone "corrects" that count to 4, they have miscounted the boxes.
- **The `[data-secret]` blur is global CSS keyed on the attribute** (`src/globals.css:164`), and the
  spans only render once a credential service pill is expanded — `activeApi` defaults to `null`, so a
  fresh Settings render legitimately has zero of them. Don't read that as the hook being broken;
  expand Anthropic first, then count.
- **The Dev Dashboard renders full-width BELOW the rail/content layout**, outside it. That is
  deliberate — it is the dev easter egg, not a section. Leave it out of the rail.

## Logs/Debugging

- **CDP driver** (reusable, no `ws` dependency — Node 24's global WebSocket):
  `<scratchpad>/cdp.mjs`. Usage: `node cdp.mjs <file-with-js-expr> [--shot out.png] [--w 1280] [--h 860]`.
  Sets `Emulation.setDeviceMetricsOverride` first, so probes measure at a chosen window size.
  Probe scripts `p1.js`–`p5.js` and `s1.js`–`s6.js` beside it.
- **Boot line:** `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`.
  Kill with `taskkill //F //IM electron.exe`, never TaskStop, or CDP attaches to a zombie on 9222.
- **Bottom-nav buttons carry their emoji in `textContent`** ("⚙️Settings", "📋Queue19" with the badge).
  An anchored regex like `/^Settings/` silently matches nothing and the probe dies on
  `undefined.click()` two lines later. Use `includes`/unanchored regex. Cost two probe re-runs.
- **The API Credentials service pills are `<div onClick>`, not `<button>`** — a `querySelectorAll("button")`
  sweep of that card returns an empty list. Query divs by text and click the nearest
  `div[style*='cursor']`.
- **Restructure script:** `<scratchpad>/restructure.py` — the assertion-guarded bytes-mode pass that
  did the SettingsView surgery. Every anchor asserted before the single write at the end; its first
  run failed a needle and wrote nothing. Kept as the working template for this shape of edit.
- Proof screenshots: `shot-folders-1280.png` (Folders at 1280×860), `shot-search-1280.png`
  (cross-section search results), `shot-tools-1100.png` (Tools & Keys at the small 1100×720 window).
- Approved mock, committed for reference: `tasks/mocks/settings-revamp.html` — contains both the
  chosen left rail and the rejected top-pills variant behind a toggle.
