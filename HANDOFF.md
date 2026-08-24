# HANDOFF — Session 189 (2026-08-24)

## Current State

**Batch 2 shipped: `713477d` on master, pushed.** #301 (rotatable gateway token) and #302
(de-Fega sweep round 3) are both fully implemented and runtime-verified on the dev profile.
No installer cut — desktop and laptop remain on **0.4.0-alpha.4**, so nothing here has
reached a machine yet.

`npm run build:renderer` exits 0. Dev-profile boot is clean (schema v9, migration logged
exactly once, no DB-recovery lines). `node --check` passes on all six touched main-process
files; control-char scan clean on every edited file.

**Batch 2 has NOT been reviewed yet.** Per the s188 cadence, the next thing that should
happen is a separate **Fable session at effort extra**, given the commit hash **`713477d`**
explicitly, doing the same fresh-eyes review s188 did for batch 1.

## What Was Just Built

### #301 — the bundled AI token can now be rotated by shipping a build
- `gatewayAuthToken` defaults to `""` and holds **the user's own token only**
  (`main.js` STORE_DEFAULTS). The bundled token resolves at call time via new
  `llm-provider.resolveGatewayToken()` — user's wins, else the build's, read fresh off disk.
  Wired into `anthropic.chat()`, `gemini.resolveRouting()`, `gemini.isConfigured()`.
- **One-time boot migration** `_migrated_gatewayToken_v1` clears the persisted copy and
  stashes it as `gatewayAuthTokenPreMigration`.
- The renderer never receives the token. New IPC `ai:gatewayInfo` → `{ hasBundledToken }`
  (boolean only), exposed as `getGatewayInfo()` in preload. `aiReady` (App.js) and
  `gatewayActive` (SettingsView) derive from it; Settings shows **"Built-in beta gateway"**
  in place of "Direct (no gateway)", and the "Gateway active" chip keys off `gatewayActive`.
- Gateway **401/402/429** map to plain language in `llm-provider.gatewayErrorMessage()`.
  The 401 text branches on whose token was refused (build's vs. one pasted in Settings).
- Both providers now recognise Cloudflare's error array **wrapped in `.error`**, not just
  the bare array — see Key Decision 2.

### #302 — four pieces of personal data out of the defaults
- `"Fega"` deleted from both Whisper `initial_prompt` arrays (`stable-ts.js` single + batch).
- Built-in Brand Kit preset display name → **"Corva Default"**; `fega-default` **id unchanged**.
- `App.js` caption seed now byte-identical to `STORE_DEFAULTS.captionTemplates`.
- Default schedule → **three slots (12:00 PM / 4:00 PM / 8:00 PM), Mon–Sat, all `main`**,
  `weeklyTarget: 18` (3 × 6). Main-process and renderer copies now written identically in
  the `timeSlots` + `grid` shape (the main-process one previously had no `timeSlots` at all).
- New `LEGACY_TIME_SLOTS` constant in App.js: pre-`timeSlots` stores convert against the old
  eight slots, not the new three.

## Key Decisions

1. **The #301 migration clears unconditionally, not on an exact match** — a deliberate
   deviation from the issue text, recorded as a comment on #301. Both of Fega's profiles
   were found holding a token that **no longer matches the build's** (same 53-char length,
   different value; prod and dev both `sha adefa84b`, build `sha 11026d2b`). That is the
   defect already live, and a match-only migration would have skipped exactly those
   machines. The stash key makes it non-destructive.
2. **The plain-language gateway message needed a payload-shape fix that only live testing
   exposed.** Cloudflare returns `{"error":[{"code":2009,"message":"Unauthorized"}]}` for a
   rejected token — the array **wrapped in `.error`**. Both providers only tested the bare
   array, so the generic Anthropic/Google `result.error` branch caught it first and printed
   raw JSON. The gateway check now runs first and accepts either shape. **Static review
   would not have caught this** — the first Test Connection did.
3. **Clearing the token field now means "use the built-in token", not "no gateway".**
   Clearing the **Gateway URL** is the off switch (it always was, in code). Approved by
   Fega in chat; the field's help text and placeholder were rewritten to say so.
4. **Neutral schedule over an onboarding question** (Fega approved). A fourth onboarding
   step was real UI work and the issue accepted a neutral default; the target is derived
   from the visible grid rather than being a personal number.
5. **Bundled token confirmed live before switching anyone onto it** — a direct gateway call
   returned HTTP 200. Without that check this batch could have silently killed AI on every
   install that gets the migration.

## Next Steps

1. **Review batch 2 first.** Fable, effort extra, own session, pointed at **`713477d`**.
2. **Batch 3 — recordings that aren't mine still work.** #62, #300, #178. #178 and #300
   share a root shape — the `<video>` has no `onError`; add that regardless.
3. **Batch 4 — the first ten minutes don't look broken.** #153, #74 (**needs Fega to
   approve replacement copy** — the long pole), #152.
4. **Then cut ONE installer** covering all four batches (~14 issues). Optional batch 5 if
   there is room: #157, #151, #158.

## Watch Out For

- **`gatewayAuthTokenPreMigration` has no reader.** It exists so a hand-pasted token is
  recoverable. If a future session decides nobody ever pasted one, it can be dropped — but
  don't drop it before the installer reaches the laptop.
- **The prod profile has NOT run the migration yet** (the installed 0.4.0-alpha.4 predates
  it). `%APPDATA%\clipflow\clipflow-settings.json` still holds the stale token; it will be
  cleared on the first boot of a build carrying this commit.
- **"Corva Default" is verified at source and in the built bundle, but never seen on
  screen** — `builtInTemplateDeleted: true` on both of Fega's profiles hides the built-in
  preset. A reviewer wanting eyes on it needs a fresh profile.
- **Fega's prod store is old-format** (`weeklyTemplate` with no `timeSlots`, eight-entry day
  arrays), so `LEGACY_TIME_SLOTS` is load-bearing, not defensive. Breaking it truncates his
  schedule to three columns.
- **#297/#298/#299 and now #301/#302 all remain OPEN by design** — fix notes are comments
  on each issue; closing is Fega's call after he verifies in-app.
- **All s187 warnings still stand:** control-char scan after any script-driven source edit;
  the assume-success audit covered the editor only (Projects rail / Queue clip writes
  unreviewed); `clipflow.db.bak` is rewritten every save — not the manual
  `clipflow.db.bak-20260805-pre239`; untracked `.agents/` `.codex/` `AGENTS.md`
  `tasks/mocks/*` pre-date all this and were left alone again.

## Logs / Debugging

- **Dev boot-verify recipe (used repeatedly this session):**
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`, poll
  `http://127.0.0.1:9222/json/list` for the "Corva" page (~2–20s), then read
  `%APPDATA%\clipflow-dev\logs\app.log`. Clean boot = `Database initialized … (schema v9)`
  and no `is unreadable` / `Recovered from` lines.
- **New log line to expect once per profile:** `Cleared the persisted gateway token (#301)
  — it now resolves from the build at call time; previous value stashed as
  gatewayAuthTokenPreMigration`.
- **Fastest end-to-end AI check:** Settings → Dev Dashboard → Providers → **Test
  Connection**. Returns `OK — <ms> (anthropic/…)` on success and the exact user-facing
  error string on failure — this is how both 401 wordings were verified.
- **Gateway status codes** land in `app.log` as `[anthropic] Response: HTTP nnn (n bytes)`,
  right after `[anthropic] Gateway (BYOK) → …`.
- **Fresh-install simulation** (safe, reversible): kill electron, `mv clipflow-settings.json
  clipflow-settings.json.saved` in `%APPDATA%\clipflow-dev\`, boot, inspect the regenerated
  file, then restore. DB and OAuth tokens are untouched by this.
- `taskkill //F //IM electron.exe` between runs, or CDP attaches to a stale zombie on 9222.
- CDP driver script used this session:
  `%TEMP%\claude\C--Users-IAmAbsolute-Desktop-ClipFlow\<session>\scratchpad\cdp.js`
  (reads `exprs.json`, a list of `[label, expression]` pairs). Note: escape sequences like
  `\n` do not survive the heredoc → JSON → CDP path — use `String.fromCharCode(10)`.
