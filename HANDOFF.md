# HANDOFF — Session 225 (2026-08-31)

## Current State

**alpha.15 is cut, on the feed, installed, and CONFIRMED by Fega** ("It all looks
good") — it promotes the s224 AI caption fixes (#343/#344) and this session's Queue
tab rework (#346, closed confirmed): 440px click-to-edit Captions & Descriptions
panel, densified layout, the duplicated schedule/status columns merged into one,
per-game `captionTags` on gamesDb + a `{gametags}` placeholder (idempotent boot
migration appended it to the three stored platform templates), the `#{gametitle}`
short-code/full-hashtag asymmetry fixed, the write-only per-game YouTube TITLE
field removed, and the render pill showing a percentage instead of stage internals.
alpha.13/alpha.14 confirmation chasing is moot — he's on .15.

## Key Decisions

- **Game tags = ONE shared line per game across TikTok/IG/FB** (Fega chose over
  per-platform variants and full per-game templates — matches his actual pain).
- **`captionTags` lives on the gamesDb record**, not a new store key — `resolveCaption`
  already receives gamesDb at every call site, so zero settings-bundle changes anywhere.
- **Migration edits Fega's stored templates** (append `{gametags}` if absent) rather
  than asking him to hand-edit three fields.
- **TITLE field removed, not wired** — Fega picked removal when told it was write-only.

## Next Steps

1. **#341** (content-type-aware rejection chips) and **#342** (ambient background for
   non-editor tabs) — filed s223, still unbuilt.
2. **ALL-CAPS caption rule** (s224 offer, unfiled, not taken up): rules say "at most
   once", his real captions routinely use two runs. One-line change if he wants it.
3. Two #346 paths were logic-verified but never exercised live (dev queue had no
   scheduled clips): the merged cell showing a date, and the over-limit tag
   blur-refusal. Fega's normal use covers the first; if either misbehaves, start at
   QueueView's merged cell / CaptionsView's `saveTags`.

## Watch Out For

- **`resolveCaption` now runs `resolveYtGameKey` for every platform** (needed for
  hashtag + gametags) — it's in queue-card preview paths. Cheap at 16 games; don't
  let a future gamesDb blowup make it hot.
- **statusBadge branch order changed**: "Not rendered" now outranks the scheduledAt
  date pill (deliberate — the merged cell already shows the date).
- **CaptionsView click-to-edit saves on EVERY click-away**; Escape is the only
  no-save exit. The skipSave ref pattern gates all four field types.
- **Fega's stored platform templates contain NO `#{gametitle}`** — the hashtag
  symmetry fix changes nothing for him until a template re-adds it; `{gametags}`
  WAS migrated in and is live.
- The `ytDescriptions[game].ytTitle` orphan values remain on disk (harmless, spread
  preserves them); nothing reads or writes the key anymore.

## Logs/Debugging

- **Python `websocket-client` → Electron 40 CDP needs `suppress_origin=True`** or the
  handshake 403s (node's global WebSocket sends no Origin — that's why old drivers
  never hit it). Routed to the CDP-gotchas memory (#61).
- **After any version bump, the boot What's-New modal swallows ALL CDP clicks** —
  probes report success while nothing happens. Dismiss "Got it" first (memory #62).
- **`$TMPDIR` is empty in the Bash tool** — `"$TMPDIR/x"` writes to `C:\` silently.
  Full scratchpad paths only (routed to the bash-backslash memory).
- Migration verified against the REAL dev store: `{gametags}` appended exactly once
  across a double boot, 11 games backfilled `captionTags: ""`. Dev scheduler
  correctly logs "scheduled publishing disabled"; dev tokens still `{"accounts":{}}`.
