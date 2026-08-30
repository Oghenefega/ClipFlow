# HANDOFF — Session 221 (2026-08-30)

## Current State

**Two installers cut this session, and everything on master is shipped.**

- **alpha.11** (`a3e2df0`) promoted session 220's audit fixes — the 18 `${T.colour}NN` concats,
  the scheduler wedge, the tray-failure zombie. It was already written and waiting; this
  session just cut it.
- **alpha.12** (`d29672c`) promotes the session's own work: YouTube tags are now edited as
  removable pills instead of a flat comma string, plus a "Clear all" button. Both editors —
  the Queue's per-clip tags box and the per-game field in Captions & Descriptions — share one
  new `TagInput` in `src/renderer/components/shared.js`.

Feed is live at `0.4.0-alpha.12`; alpha.11's files were pruned. **Fega has not yet installed
either** — he'll get the banner on next launch, and a What's New card explaining the tag change.

## Key Decisions

- **`TagInput` is fully controlled on BOTH the committed list and the half-typed word.** The
  draft can't live inside the component: the click that leaves the field blurs the input in the
  same event that would read state back, so an internal draft is lost exactly when the user
  expects it saved. Same reason `onCommitBlur` hands the caller the finished list — callers save
  from that argument, never from their own state.
- **Clear all has no confirm step.** Nothing is written until the field is left, so Escape
  (Queue) / Cancel (Captions) is already a complete undo, and a cleared-then-saved Queue list is
  just an empty override that "Reset to game tags" reverses.
- **It's a "✕ Clear all" chip, not a bare ✕** (Fega asked for "pretty much an X"). A lone ✕ among
  nineteen pills that each carry their own ✕ reads as one more pill-remove. Flagged to him; he
  can have the naked glyph if he prefers.
- **The pill ✕ uses `textTertiary`, not `textMuted`** — at 9px the muted token (16% dark /
  26% light) doesn't read as a control.

## Next Steps

1. **Fega installs alpha.12 and judges the pills** — size, spacing, how obvious the ✕ is, and
   whether "✕ Clear all" belongs at the right end of the box or up in the header by the counter.
2. Nothing else is queued. Next session starts from the open backlog
   (`gh issue list --repo Oghenefega/ClipFlow --search 'is:open -label:"track: launch-ops"'`).

## Watch Out For

- **The Queue's per-platform cards only render for a CONNECTED account**
  (`activePlat = platforms.filter(p => p.connected)`, QueueView.js:1420), and the dev profile has
  `platforms: []`. Any future work on that UI needs a **credential-free** platform entry written
  into `%APPDATA%\clipflow-dev\clipflow-settings.json` — a settings entry, never a token. Add it,
  back up the file, restore afterwards. (Already documented as gotcha 54 / s215 in
  `project_cdp_verification_gotchas` — I re-derived it the hard way.)
- **Buttons wired to `onMouseDown` ignore a synthetic `.click()`.** The Queue's Cancel buttons and
  everything in `TagInput` use `onMouseDown` + `preventDefault` deliberately, to stop a click
  blurring the field into a save. A probe using `.click()` reports success and does nothing.
- **`asar extract-file` still writes to the basename in CWD.** Verify packaged contents by reading
  the asar bytes instead. I reached for the dangerous form again this session; no damage, but the
  trap is live.
- `TagInput` keys its pills by tag string. Safe because both save paths normalize through
  `parseTags` (which dedupes case-insensitively), but a legacy list with true duplicates would
  collide — the pre-existing read-only display has the same exposure.

## Logs / Debugging

- Dev boots this session: `%APPDATA%\clipflow-dev\logs`. Scheduler correctly refused each time
  (`Scheduler: dev profile — scheduled publishing disabled`). Dev tokens verified `{"accounts":{}}`
  before every boot and left that way; `platforms` restored to `[]`; no test tags left in any
  game's list.
- CDP driver used: `scratchpad/cdp.py` (Python `websocket-client`, `suppress_origin=True` — the
  handshake 403s without it). Its `key()` sends `keyDown`-with-`text` then `keyUp` **only**;
  adding a separate `char` event double-types and defeats `preventDefault`.
- Release builds still need `NODE_OPTIONS=--max-old-space-size=8192` and must run in the
  FOREGROUND — both cuts went clean with it.
