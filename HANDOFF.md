# HANDOFF — Session 220 (2026-08-28)

## Current State

**The five alpha.10 commits are now audited** (038262f small wins, 39c2ebd Queue redesign,
5938b26 Settings revamp, 42574c5 themes, 73066d0 scheduler+streaming). Findings fixed and
pushed in `fbebff3`; `28173aa` opened the next release-notes "unreleased" block. The fixes
are on master only — **not yet in Fega's installed alpha.10**; they ride the next cut.

What was fixed: 18 `${T.colour}NN` hex-alpha concats that became invalid CSS when #328 made
T values var() strings (banner tints, engine-setup boxes, Tracker glows, Projects player
glows, both new Settings info boxes — all silently flat in alpha.10); a scheduler wedge
(`onTick` outside `tickOnce`'s try/finally could stick `running=true` forever); a
tray-creation failure during streaming-mode entry leaving a windowless, trayless resident
process; tray-quit skipping `database.close()`; the boot `applyTheme({persist:false})` call
theme.js documented but nobody wrote; three inert `dark` classNames.

Everything else in the batch held up: claim arbitration, the pending-union anti-clobber
guards, the shared caption/tracker-row resolvers (field-for-field vs. consumers), the
What's New version walk, splash min-hold, Settings search index.

## Key Decisions

- **`editorPrimitives.js` is a dead file (zero importers) — left in place, noted on #40.**
  Its `EditableTC` popover was themed anyway (correct if ever wired in). Deleting vs. wiring
  is Fega's call in the hygiene pass.
- **Remaining literal violet washes (~25 sites, e.g. `rgba(139,92,246,0.08)` drag overlays)
  left alone.** They're readable on every theme; they just don't follow the pink accents on
  Rose/Blush. Cosmetic follow-up candidate, not shipped-broken like the concats were.
- The orphaned dev-store XP entries (`clip:mtdeiwr9…`/`clip:mtdejch8…`, no matching tracker
  rows) are **s218's anti-clobber delete test as designed** — XP is append-only on purpose.
  Not a leak; don't re-investigate.

## Next Steps

1. **Fega verifies alpha.10 on his install** (unchanged from s219): #331 Settings rail +
   search, #328 four themes incl. editor, #329 streaming mode (tray + a scheduled clip with
   the window closed), #324/#325 Queue redesign. Pull `status: untested` as confirmed.
2. **Next installer cut picks up the audit fixes** — the restored-colours What's New entry
   is already queued in release-notes.js. Batch per policy (~10 changes or explicit ask).
3. #332 (GPU process doesn't retire in streaming mode) — open, measured, not urgent.

## Watch Out For

- **`npm start` is a publishing action** (prod profile boots a live scheduler since #329).
  Verify with `CLIPFLOW_PROFILE=dev` (refuses to auto-publish) and confirm
  `clipflow-dev\clipflow-tokens.json` is `{"accounts": {}}` before any dev boot.
- **Never `taskkill //F //IM Corva.exe`** — shared image name with the daily driver. Kill
  dev electron by PID.
- **New colour code near themes:** never `${T.x}NN` — Dim/Border tokens or
  `color-mix(in srgb, ${T.x} N%, transparent)`. Rule now in ui-standards.md +
  clipflow-ui-debug; grep `\$\{T\.\w+\}[0-9a-fA-F]{2}` before shipping.
- Release builds need `NODE_OPTIONS=--max-old-space-size=8192` (s219, in the launcher skill).

## Logs / Debugging

- **Attribute app.log lines by `sess_` id, not tail recency** — a fresh boot's lines flush
  late; s220 chased a phantom for 15 min on the previous boot's lines (now in trace-verify).
- CDP against the dev boot: connect with `suppress_origin=True` (websocket-client sends an
  Origin header Electron 40 rejects with 403 otherwise). The What's New modal (z-1000)
  swallows synthetic clicks on everything under it — dismiss via its "Got it" before driving.
- `color-mix` verified resolving in Electron 40: probe returned
  `color(srgb 0.133 0.827 0.933 / 0.53)` for the cyan glow — the pattern is safe app-wide.
- Audit verification run: dev boot `sess_a039d0b87dc6` (18:22) — scheduler refused on dev,
  What's New fired for alpha.10 and acked (dev store's lastSeenVersion now alpha.10), real
  clip opened in the editor (`.editor-scope` present, 2 videos, 4 canvases, no crash).
