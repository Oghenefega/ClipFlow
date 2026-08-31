# HANDOFF — Session 223 (2026-08-30)

## Current State

**alpha.14 is on the feed** (`1c8fcfc`), promoting this session's batch (`394f93d`):
the #328 `--radius` regression fixed (editor corners back — one `:root` line in
themes.css), four new themes (Graphite, Forest, Amethyst, Paper — picker now 8, darks
first), and a Settings → About section (version + on-demand "Check for updates" +
"View release history" via new `whatsnew:getAll` IPC, no ack side effects). All
verified live on the dev build via CDP, including a real clip-open in the editor
(0/29 square buttons) and all four themes through the real picker. Fega has not yet
installed alpha.14 — it also carries everything from alpha.13 he hasn't confirmed.

Session opened as a five-item feedback batch; the other two items were investigated
and filed, not built: #341 (content-type-aware rejection chips + "didn't stand alone"
chip — review UI already has `tagEntry?.entryType` at ProjectsView.js:824, vocabulary
lives in THREE unsynced places, all mapped in the issue) and #342 (ambient background
treatment for non-editor tabs, Yomi's "UI sits in the middle" — mock-first, linked
to #277).

## Key Decisions

- **Daylight untouched; Paper is the answer to "the white is sooooo white"** — a new
  warm greige light theme instead of changing an existing theme under people's feet.
- **The skipped-versions ask needed no code** — `whatsnew:get` already accumulates
  every missed entry (array-position walk to `lastSeenVersion`); told Fega, noted in #339.
- **Release history reaches back to alpha.9 only** (when release-notes.js began);
  backfilling older versions from CHANGELOG was left as optional scope on #339.
- **Settings "Install & restart" is the banner's flow behind a new button** — its
  available→install branch can't run from source; first real exercise is the NEXT cut.

## Next Steps

1. **Fega installs alpha.14** and eyeballs: editor corners, the four new themes, the
   About section, and the What's New screen (first live multi-item showing). On confirm
   close #338/#339/#340 — and #333/#334 from alpha.13 (all `status: untested`).
2. **Show polish carry-over from s222** (in-app, no code): per-show art, review the four
   seeded tag/description sets; first react pipeline run should show the CONTENT CONTEXT
   block in the persisted prompt (closes #333's loop).
3. Backlog candidates from this session's batch: #341 (rejection chips — needs Fega's
   input on the react-content reason list), #342 (background treatment — mock two
   directions first).

## Watch Out For

- **`--radius` must stay on `:root` in themes.css** — it's the one non-colour shadcn
  token; per-theme blocks are colours only. If a future theme pass rewrites the file
  from the blocks, this line is the easy casualty (that's exactly how #328 lost it).
- **New theme ids are validated against `THEME_CHROME` in main.js** — a themes.css
  block without its THEME_CHROME entry gets reset to midnight by the boot migration
  (main.js:473). Adding a theme = 3 places: themes.css block, THEMES (theme.js),
  THEME_CHROME (main.js).
- **`ReleaseHistoryModal` must never call `whatsNewAck`** — reading history while an
  un-acked first-launch announcement is pending would suppress it. Close ≠ ack.
- **Forest's accent (#10b981) is deliberately close to T.green (#34d399)** — user
  asked for green-on-green; if status/accent confusion ever gets reported, that's the
  place to look.
- Per-clip `gameTag` overrides exist on EVERY clip of the s222-migrated projects;
  ytDescriptions keyed by display NAME (rename orphans the set) — both still live.

## Logs / Debugging

- Dev boot: tokens verified `{"accounts":{}}` before boot, untouched; dev electron
  launched with `--remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`,
  killed by `//IM electron.exe` at wrap (no Corva.exe was running — checked implicitly
  via the kill list, all six PIDs were electron.exe children).
- CDP driver this session: `cdp.js` (Node's built-in WebSocket, Node 24) in the
  scratchpad — eval + screenshot modes; simpler than s222's python driver.
- Boot What's New overlay was open during the whole Settings drive (dev lastSeen <
  alpha.13) — synthetic clicks passed through it; scope modal queries to the overlay
  div that actually contains the expected text, there can be TWO z-1000 overlays open.
- Release build foreground with `NODE_OPTIONS=--max-old-space-size=8192`, clean through
  `building block map`; feed verified serving `version: 0.4.0-alpha.14`, alpha.13 pruned.
- Dev theme reset to midnight at wrap; dev store briefly persisted `"theme": "paper"`
  mid-verification (proves main-side validation of new ids).
