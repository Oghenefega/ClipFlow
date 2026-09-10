# HANDOFF — Session 250 (2026-09-10)

## Current State

**Facebook and Instagram are reconnected on the installed alpha.33** (both in
`%APPDATA%\Corva\clipflow-tokens.json` with the #387 insight scopes, expiring 2026-11-09 and now
renewing themselves past the 30-day mark) and **Analytics reads all three platforms** (YouTube
167, Instagram 165/166, Facebook 151/167). Master is at `f2172e9` plus this wrap, clean. **Five
commits since alpha.33 are waiting for a cut**: the hosted https return page + `state` check
(#391), the Analytics tile fix (#393), the halfway token renewal (#394), the corva.gg-style
sign-in result pages, and `edc1697` from s249. The installed app still runs the OLD sign-in code
(localhost return address, grey result card) — that only matters if a reconnect is attempted from
it before the next installer; publishing and the monthly renewal work from it as is.

## Key Decisions

- **The Meta return page lives on `engine.flowve.app` (R2), not the marketing site.** The address
  is baked into every installed copy; a website redesign must never be able to break sign-in.
- **The Meta app stays Live, permanently.** A Development-mode app hides its posts from the
  public — the s249 "flip to Development" idea is dead, not deferred.
- **Pages that open in a browser tab follow the WEBSITE's type (Unbounded + Inter), not DM Sans.**
  Fega tried DM Sans on the mock and sent it back. Recorded in memory `feedback_dm_sans_only`.
- **Meta dev app renamed to Corva by Fega as a one-off ("I just did it").** The trademark gate
  still stands for the Google app, the GitHub repo and corva.gg. CLAUDE.md + memory updated.
- **#395 (5-minute auto-refresh of recent clips while Analytics is open) parked** on Fega's
  "not now"; plan and rate-limit numbers are on the issue.

## Next Steps

1. **Next installer batch** carries the five commits above. Before publishing: `npx asar list
   dist/win-unpacked/resources/app.asar | grep brand` must show `clipflow-mark.png` — a new
   `build.files` entry (`src/renderer/assets/brand/**/*`) feeds the result page; a miss renders the
   page without the mark (guarded), not a crash.
2. **#392** — the 16 legacy Facebook uploads that return no view count. Probe one id read-only
   first (memory `project_safestorage_probe`); they may be post ids, not video ids.
3. Carried: #383 confirmation, #384, #385, the s247 interfaces-audit follow-ups; #395 when asked.
4. Optional, only if a "reconnect" ever fires while the Page token is fine: #394 item 2 (try the
   Page token on the publish paths before flagging).

## Watch Out For

- **Any NEW Meta scope must be declared on the app's use case before a developer can request it**
  (Use cases → Customize → Permissions and features → Add) — otherwise the dialog dies with
  "Invalid Scopes". Facebook also silently attaches `pages_read_user_content` to
  `pages_manage_engagement` and then rejects it as undeclared; all four are declared now. Customers
  sail through ("users of your app will ignore these permissions"); the app admin cannot.
- **Driving the Meta dashboard in Chrome:** on the Facebook Login for Business settings page,
  ref-based clicks on the redirect-URI combobox land on a 1×1 offscreen "Close" anchor and typed
  keys vanish — click by screenshot coordinates; Save via JS `.click()` needs a match tolerant of
  zero-width spaces in the button text. Screenshots time out after interactions on Meta pages —
  read state with page text / JS instead.
- **A source run (`npm start`) writes its DB to `<repo>/data/clipflow.db`, not
  `%APPDATA%\Corva\data`** (`database.js:19` keys on `app.isPackaged || dev`). `git checkout --
  data/clipflow.db` after any source run (done this wrap). Tokens ARE shared — both read
  `%APPDATA%\Corva\clipflow-tokens.json`, which is why the installed app got the accounts back.
- **The Instagram account's stored `accessToken` is the PAGE token** (`meta.js:292`); the halfway
  renewal exchanges it through `fb_exchange_token` and Meta returned a working token in the s250
  test. Keep an eye on the first natural renewal (~2026-10-10).
- Both Meta flows share port 8083; a pending flow blocks a second click until the 5-minute
  timeout. The installed alpha.33 still shows the pre-`edc1697` EADDRINUSE alert for that.
- The hosted page and the mark are two R2 objects (`auth/meta/callback`,
  `auth/meta/corva-mark.png`); `scripts/publish-callback.ps1` republishes both and checks the
  content types. Never move or rename the callback key.
- `public/icon.svg` is the pre-#252 bolt logo, unreferenced — not the mark. The mark is
  `src/renderer/assets/brand/clipflow-mark.png` (and `public/icon.png/.ico`).

## Logs / Debugging

- Meta connect: `%APPDATA%\Corva\logs\app.log`, scope `(meta)` — "Opening system browser" →
  "Got auth code" (logged only after the `state` check passes) → "Account saved" /
  "IG account saved". "OAuth state mismatch" = a return that Corva did not start.
- Token renewal logs nothing on success — check `expiresAt` in `clipflow-tokens.json` (60 days out
  after a pre-flight past halfway). Failures log "Meta pre-flight refresh failed".
- Analytics: `(analytics) View refresh {...}`. Since #393 a platform-level `error` means nothing has
  EVER worked for that platform; a per-post failure only shows in the preceding `warn` line.
- Render the result pages without a sign-in:
  `node -e "console.log(require('./src/main/oauth/result-page').renderResultPage({ok:true,platform:'Instagram',account:'x'}))"`
  — serve from a scratch http server to view (the Browser pane cannot drive `file://` pages).
- Dashboard truth without the browser: `GET graph.facebook.com/v21.0/{app-id}?fields=name,app_domains&access_token=appId|appSecret`
  (ids from `clipflow-settings.json`). The redirect-URI whitelist is NOT readable via Graph.
