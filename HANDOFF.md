# HANDOFF — Session 190 (2026-08-24)

## Current State

**Batch 2 review is DONE and clean.** This session was the s188-cadence fresh-eyes review
of `713477d` (#301 rotatable gateway token, #302 de-Fega defaults), run by Fable in its
own session per the batch loop. The implementation held up under two full passes; **two
small gaps** were found and fixed on master, both in `SettingsView.js`, both consequences
of #301's new field semantics. Review results recorded as a comment on #301.

No installer cut — desktop and laptop remain on **0.4.0-alpha.4**. Batches 1 and 2 have
both shipped to master and both passed their reviews; nothing has reached a machine yet.

`npm run build:renderer` exits 0 with the review fixes. Control-char scan clean on the
edited file. Working tree clean after the wrap commit.

## What Was Just Built (review fixes)

1. **Gateway Auth Token Save now trims (#301 follow-up).** Batch 2 made an empty field
   mean "use the built-in token", and main trims the stored value before deciding whose
   token a call sends — but Save stored the pasted text verbatim. A trailing space/newline
   from a paste, or a whitespace-only field that looks empty, made Settings show a
   personal token as active while calls had already fallen back to the built-in one.
   Save now trims (matching the Gemini key save one panel down).
2. **Gemini panel help copy (#301 follow-up).** Still pointed at "the gateway token in
   the Anthropic panel" — a field that post-#301 is empty and labeled "Built-in beta
   gateway" on a normal install. Now says: a key here, or Corva's built-in gateway.

## What The Review Verified (no change needed)

- Migration ordering: `runStoreMigrations` runs before `createWindow`, so the renderer
  can never observe the pre-migration token via `store:getAll`.
- `bundledGatewayToken()` genuinely reads the JSON from disk per call — no caching, so
  "rotate by shipping a build" holds.
- Every AI-availability gate routes through `resolveGatewayToken` (main) or
  `gatewayActive`/`aiReady` (renderer); no stragglers still checking the store token.
- The two copies of the neutral schedule default (main STORE_DEFAULTS / App.js
  DEFAULT_TEMPLATE) are byte-identical; every template consumer iterates `timeSlots`
  generically — no hardcoded column counts; `savedTemplates` and `weekTemplateOverrides`
  also pass through `migrateTemplate`, so old-format presets get LEGACY_TIME_SLOTS too.
- `gameVocab` always starts with ", " so the Whisper "Fega" removal can't mangle the
  prompt concatenation; both prompt arrays are identical.
- Remaining "Fega" hits in src/ are comments, test fixtures, and the deliberately-kept
  `fega-default` id only.

**Noted, deliberately left:** `store:getAll` ships the dead `gatewayAuthTokenPreMigration`
stash into the renderer. No reader, feeds nothing, on-disk anyway — filtering it would be
machinery for no behavior. Also pre-existing and untouched: "Direct (no gateway)" label
vs actual passthrough mode when a URL is set but no token exists anywhere (dev-only
scenario), and the 402 wording assumes the shared beta gateway (a user running their own
CF gateway with budgets would get slightly-wrong copy — nobody does).

## Key Decisions

1. **Both review fixes were judged in-scope for the review session** because the
   semantics that made them wrong shipped in batch 2 itself (empty-means-built-in). The
   untrimmed Anthropic API key save is the same latent shape but pre-existing — left
   alone per surgical-changes.
2. #301/#302 stay OPEN — closing is Fega's call after in-app verification, per the
   standing batch rule.

## Next Steps

1. **Batch 3 — recordings that aren't mine still work.** #62, #300, #178. #178 and #300
   share a root shape — the `<video>` has no `onError`; add that regardless. Opus@high
   builds it; Fable reviews it in its own session after it lands, given the commit hash.
2. **Batch 4 — the first ten minutes don't look broken.** #153, #74 (**needs Fega to
   approve replacement copy** — the long pole), #152.
3. **Then cut ONE installer** covering all batches (~14 issues). Optional batch 5 if
   there is room: #157, #151, #158.

## Watch Out For

- **`gatewayAuthTokenPreMigration` still has no reader** — keep it until the installer
  reaches the laptop; only then is dropping it on the table.
- **The prod profile has NOT run the #301 migration** (installed 0.4.0-alpha.4 predates
  it); `%APPDATA%\clipflow\clipflow-settings.json` still holds the stale token until the
  first boot of a build carrying batch 2.
- **"Corva Default" still never seen on screen** — `builtInTemplateDeleted: true` on both
  of Fega's profiles hides the built-in preset; verifying it visually needs a fresh
  profile.
- **Fega's prod store is old-format** (`weeklyTemplate` with no `timeSlots`) —
  `LEGACY_TIME_SLOTS` in App.js is load-bearing; breaking it truncates his schedule to
  three columns.
- **All s187/s189 warnings still stand:** control-char scan after script-driven edits;
  assume-success audit covered the editor only; `clipflow.db.bak` is rewritten every save
  (the manual `clipflow.db.bak-20260805-pre239` is the safe one); untracked `.agents/`
  `.codex/` `AGENTS.md` `tasks/mocks/*` pre-date all this and were left alone again.

## Logs / Debugging

- **Dev boot-verify recipe:** `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`,
  poll `http://127.0.0.1:9222/json/list` for the "Corva" page, then read
  `%APPDATA%\clipflow-dev\logs\app.log`. Clean boot = `Database initialized … (schema v9)`
  and no `is unreadable` / `Recovered from` lines.
- **#301 migration log line, once per profile that held a token:** `Cleared the persisted
  gateway token (#301) — …stashed as gatewayAuthTokenPreMigration`. Fresh profiles set
  the flag silently (nothing to clear) — absence of the line on a fresh profile is normal.
- **Fastest end-to-end AI check:** Settings → Dev Dashboard → Providers → Test
  Connection; returns `OK — <ms>` or the exact user-facing error string.
- **Gateway status codes** land in `app.log` as `[anthropic] Response: HTTP nnn (n bytes)`
  right after `[anthropic] Gateway (BYOK) → …`.
- `taskkill //F //IM electron.exe` between runs, or CDP attaches to a stale zombie on 9222.
