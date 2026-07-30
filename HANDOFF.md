# ClipFlow — Session Handoff

_Last updated: 2026-07-30 — Session 140 — **Two quality-of-life features Fega asked for are built, verified against his real data, and shipped as `0.3.0-alpha.34`. He installed it and said "I'll check it later" — nothing is confirmed.**_

---

## One-line TL;DR

Fega asked for split/merge on the subtitle line itself, and for the Tracker's week
log to stop being "vague and bare"; both were mocked, approved, built, verified in
the running app over CDP, and cut as alpha.34 — plus a follow-up he approved
mid-session that greys out Merge wherever the line it would swallow isn't visible.

## Current State

**`0.3.0-alpha.34` is built (`dist\ClipFlow Setup 0.3.0-alpha.34.exe`, 124 MB,
commit 05a0dd0) and Fega has INSTALLED it.**

- 🟡 **Nothing this session has his confirmation.** #217 and #218 are OPEN with
  `status: untested`. He installed and will look later.
- 🟡 **Still unconfirmed from session 139:** #214 and #215 (alpha.32 — Audio panel),
  and the Rename-button halo (alpha.33). He never confirmed alpha.33 was installed
  before alpha.34 replaced it.
- **#216** (root cause behind #214 — scan-time asset ids) open and unstarted.
- **#206** (library hygiene — 23 orphan renders, ~1.37 GB) still awaiting his call.
- **#213** — bulk tagging still has no row multi-select; 487 tracks untagged.
- **Still unverified from earlier sessions:** #209–#212 (closed, `status: untested`),
  the two alpha.30 loudness changes, plus **#188**, **#204**, **#205**, **#207**.
- Working tree clean apart from the perpetually-dirty `data/clipflow.db` and the
  pre-existing untracked `.agents/`, `.codex/`, `AGENTS.md`, `tasks/mocks/bb*.md`.

## What Was Just Built

### #217 — Split/Merge on the subtitle line

- Clicking any word shows three icon-only buttons **under that line**: Split here /
  Merge up / Merge down, each named on hover. Fega picked icons-only for
  compactness, and the under-the-text row over a floating pill.
- The only *visible* control before was the panel toolbar. A per-word right-click
  menu already existed in `SegmentRow.js` but was undiscoverable — Fega had never
  found it. It still works, and now shares the same three extracted handlers.
- **Merge is greyed wherever the line it would swallow isn't visible.** Found during
  verification: `editSegments` is source-wide while the panel renders only the
  trimmed window, so Merge up on the top line pulled in `"he's going to be pissed
  man"` from before the clip's in-point. Fega approved the fix mid-session. The
  guard is *"is the raw neighbour in the visible set"* — which also covers a line
  whose neighbour was cut out mid-clip, and leaves `mergeSegment` untouched, because
  when the control is enabled the raw neighbour IS the visible one. Applied to all
  three surfaces: row buttons, right-click menu, toolbar Merge button.

### #218 — Tracker week log: clip identity + scheduled preview

- Cards carry the **published title** over a game-coloured tint plus a corner glow
  ("treatment C" of three mocked options), keeping the tag pill. **No new data was
  needed** — all 83 tracker entries already had `title`, written by `logPost` at
  publish time and never displayed. Trailing `#rocketleague` is stripped.
- **Clips scheduled from the Queue now appear**, as dimmed dashed cards with an
  amber dot, replacing (not stacking on) their template slot. Future days show their
  open `+` slots again, so Fri/Sat aren't blank.
- **Scheduled clips deliberately do not count** toward posted / pace ring / streak /
  XP. Verified: XP stayed at +180 with ghosts on screen.
- The detail popover leads with the title, shows the clip's frame, and gains **Open
  in editor** / **📁 Show in Explorer**; scheduled clips get **Manage in Queue**
  instead of Remove.
- Future-day column opacity raised 0.4 → 0.72 (those columns hold real content now).

## Key Decisions

1. **Cards show the title as TEXT; thumbnails live only in the popover.** Fega's
   clips are on `W:` (external). A thumbnail per card would blank out whenever that
   drive is unplugged; the popover degrades to a tinted block instead.
2. **Scheduled ≠ posted, but existing `scheduled: true` entries keep counting.**
   Three such rows exist (platform-native scheduling via the publish modal). Their
   XP is already banked; re-classifying them would rewrite streak history. They get
   the amber dot for consistency and nothing else.
3. **Merge guard is neighbour-visibility, not first/last row.** Strictly better, and
   it required no change to the shared `mergeSegment` action.
4. **Action row keyed on SELECTION, not `isActive`** — it appears on click and
   clears itself when playback reclaims the highlight.
5. **Guards computed in the parent against the RAW store list.** The `seg` prop is
   the trim-filtered timeline copy; its neighbours and word count are not the ones
   split/merge actually operate on.

## Next Steps

1. **Ask Fega whether alpha.34 works** — #217/#218 are `status: untested`, as are
   #214/#215 and the Rename halo from session 139.
2. He noted the merge-up / merge-down **icons read similarly** at that size (same
   lucide `Merge` glyph, one rotated 180°). Tooltips cover it; offer clearer icons
   if he raises it again.
3. **#216** — derive folder asset ids from the file path so a rebuilt index can't
   detach clip references.
4. **#213** — row multi-select for bulk tagging (487 tracks untagged).

## Watch Out For

- **`textContent` omits an open inline editor's value.** A subtitle row reads as
  `"what takes"` while the store holds `"what it takes"` whenever that word is being
  edited. This cost real time this session — see Logs/Debugging.
- **Editor autosave is real.** Any split/merge driven during verification persists
  unless the window is reloaded before the timer fires. `location.reload()` discards
  in-memory editor state; then re-read the project JSON to confirm.
- **Never leave a test `scheduledAt` behind** — the Queue scheduler auto-publishes
  once the time passes. Two were set this session (Fri/Sat), both removed, disk
  re-checked afterwards: zero remain.
- **`data/clipflow.db` must never be staged.** Always dirty; stage files explicitly.
- `App.js`'s `scheduledClips` memo now also carries `clipId`, `projectId`,
  `thumbnailPath`, `renderPath`. `TrackerCalendar` still consumes only
  `date`/`time`/`title`/`game` — verified unbroken, but it's a shared shape now.

## Logs/Debugging

**Verification harness** (reusable; scripts in this session's scratchpad):

```bash
npx electron . --remote-debugging-port=9222
```

Then drive it with a tiny CDP client (`ws` is already a dependency): connect to the
`index.html` page target and `Runtime.evaluate` with `returnByValue` +
`awaitPromise`. `Page.captureScreenshot` gives PNGs. Run
`taskkill /F /IM electron.exe` before packaging, or `electron-builder` trips over
the running instance.

**Two false alarms, both mine, both worth remembering:**

1. **"A word was deleted."** It wasn't. The row read `"what takes"` because that
   word was an `<input>` at the time. Disk was intact on the first check and said
   so. The four Ctrl+Z presses that "failed to restore it" were no-ops against an
   *empty* undo stack — which was itself the evidence that nothing had changed.
   → Check for `input`/`textarea` in the node and read `.value` before ever
   reporting corruption.
2. **"The action row didn't render."** It did. The `.click()` and the assertion sat
   in the same synchronous block, so React hadn't flushed — all six loop passes
   measured the pre-gesture DOM and returned a uniform, confident, wrong `[]`.
   → `await new Promise(r => setTimeout(r, 300))` between gesture and measurement,
   **inside** the loop body.

Both routed into `clipflow-trace-verify`; the marker in `tasks/lessons.md` is
advanced to s140.

**Real bugs caught by verification (fixed before commit):**

- The detail popover measures itself to decide whether to flip above the card, and
  grew ~2.5× once it gained the title + frame — the bottom edge hung off the window
  for cards low in a column. It now clamps into the viewport both ways and re-places
  via `ResizeObserver` when content settles (font swap, image decode). Re-checked on
  cards in every column.
- `popBtn` used `flex: 1` only, which does nothing on the standalone Remove button —
  it rendered as a narrow stub. `width: 100%` added.
