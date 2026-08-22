# HANDOFF — Session 182 (2026-08-22)

## Current State
**Three issues shipped and 0.4.0-alpha.2 is cut and published.** #284 (the
affiliate-link leak in the description generator), #285 (YouTube tags reaching
the publish call) and #286 (`{schedule}` substitution) are on master in
`82bcb86`; the version bump is `deb2a4a`. The feed at
`https://engine.flowve.app/updates/alpha.yml` reads `0.4.0-alpha.2` and the exe
returns 200, so **every installed copy will offer the update on next launch** —
desktop and laptop both.

The installer question that stayed open through s180 and s181 is **closed**:
Fega said "cut the installer" this session. alpha.2 promotes six issues —
#281, #282, #283 from the previous two sessions plus today's #284/#285/#286.

**Awaiting Fega's in-app pass:** #284, #285, #286 (all three left OPEN on
purpose, commented not closed), plus the older backlog — #263/#269, #270, #271,
#275, #276, #278, #279, #280, #281, #282, #283.

**#285 has one leg I could not test:** a real YouTube publish. Set tags on a
game, publish one Short manually and one on a schedule, check the Tags field on
the live videos. Until that passes, **the comma-separated keyword wall stays in
the description templates** — it is currently the only keyword signal on the
channel.

## What Was Built

Three issues from Mushu's 2026-08-21 live audit of 8 published Shorts, scoped by
Wick. Order shipped: #284 → #286 → #285.

### #284 — Regenerate from Template shipped Fega's monetisation to every user
`buildYtDescription()` at `CaptionsView.js:12` was the pre-#262 body: subscribe
and membership links, five social handles, **eight `amzn.to` affiliate links**, a
CharaChorder referral code, the "all links above are affiliate links" line, the
stale "Live every day 5PM" opener and `#Fega`. Commit `d223693` (#262) swept
`main.js`, `App.js` and `useAIStore.js` and missed this file. Factory default is
`ytDescriptions: {}`, so any user pressing **Edit → Regenerate from Template**
got that body and could publish a Short carrying someone else's affiliate links.

Fix was de-duplication, not a rewrite: the clean starter already existed inline
in `handleNewGame`. It moved to **new `src/renderer/utils/ytDescriptionTemplate.js`**
(`buildStarterYtDescription`), both call sites import it, and the bad generator
is deleted. One generator now, so the two paths cannot drift again.

### #286 — `{schedule}` substitution variable
- `streamSchedule: ""` added to `STORE_DEFAULTS` (`main.js`).
- `App.js`: state + load + persist effect, mirroring `requireHashtagInTitle`
  exactly; passed to `SettingsView` and `QueueView`.
- **Settings → Publishing → Stream Schedule** — one text field with the
  Edit/Save idiom the neighbouring cards use, trimmed on save, sitting directly
  above Queue Settings.
- `resolveCaption` gains a third `.replace()` — **on both branches**, the
  YouTube one and the platform-template one, so TikTok/IG/Facebook templates get
  the variable too.
- `CaptionsView` now lists the three variables under the description box.

### #285 — YouTube Shorts published with an empty Tags field
Everything downstream was already correct (`main.js:4545/4601`,
`youtube-publish.js:131/150`); only the renderer hardcoded `tags: []`.
- **Store:** `ytDescriptions[game].tags`, a string array beside `desc`/`ytTitle`.
  No new key, no migration — absent reads as `[]`.
- **UI:** comma-separated box under the description with a live count against
  YouTube's 500-char budget for the whole list, counted the way YouTube charges
  it (tags + separators, +2 for any tag containing a space). Over the limit the
  counter goes red, the warning line names the overage, and **Save is blocked**.
  Normalised on save: trim, drop blanks, case-insensitive dedupe. Collapsed rows
  show `N tags` / `no tags`.
- **Resolution:** the game-key match was lifted out of `resolveCaption` into a
  shared `resolveYtGameKey`; `resolveTags` calls it. Descriptions and tags
  cannot resolve differently on the same clip.
- **Wired:** `QueueView.js:1375` (manual) and `:1690` (scheduled).

## Key Decisions
- **Tags stored as an array, not a comma string.** The UI edits a string and
  normalises on save; the store and the API both see a clean array. One shape,
  one normalisation point.
- **Over-limit blocks Save rather than truncating at publish.** A failed upload
  at the end of a render is an expensive way to learn you had 501 characters.
- **`{schedule}` applies to platform captions too.** The issue only asked for
  the YouTube branch; it is the same variable and one extra line, and a
  YouTube-only variable would be a trap.
- **The starter template gains no schedule line.** A generic starter has no
  business asserting when anyone streams (scoped that way in #286).
- **Issues left open, not closed.** All three are commented with what shipped
  and what is still owed; Fega closes them after his in-app pass.
- **Version ticked alpha.1 → alpha.2.** Counter only, never the minor.

## Next Steps
1. **Install alpha.2** (relaunch → banner → Install) and do the in-app pass on
   #284/#286.
2. **#285's live publish test** — one manual, one scheduled, check the Tags
   field on both videos. This is the only unverified leg of the whole batch.
3. **Then, in this order:** keywords move from the description wall into the
   tags field → the wall comes out of the templates → the 11 hand-written
   templates switch their literal schedule line to `{schedule}`. All three are
   content work (Mushu's lane), not code.
4. **#287** — migration-injected `ytDescriptions` entries + a CaptionsView Add
   path. This was the one that genuinely depended on #284's shared helper, and
   that helper now exists.
5. **#288** — userData latch. Independent, not urgent.
6. Optional 3-line sweep: `App.js:325-328` still carries `#fega #fegagaming` in
   the `captionTemplates` `useState` initialiser. It never reaches a user (the
   generic `main.js` defaults overwrite it on load, so it is a pre-load flash,
   not a leak) — offered and deliberately left alone this session.

## Watch Out For
- **`resolveYtGameKey` is now shared by two callers.** Any change to the
  matching affects descriptions AND tags. That is the point — do not "fix" one
  by forking it.
- **A clip whose `gameTag` is a display name with a space** (`"Rocket League"`)
  resolves to nothing, for tags and descriptions alike. Pre-existing behaviour,
  identical on both paths; clips store the short tag, so it does not occur in
  practice. Do not treat it as a tags regression.
- **`handleSave` in CaptionsView now always writes a `tags` key.** A game saved
  once gains `tags: []` even if the user never touched the box. Harmless, but it
  means "has a tags key" is not a signal that tags were set — check `.length`.
- **`tagsOver` is referenced inside `handleSave` above its own `const`.** No TDZ
  problem (the function only runs after render) but do not reorder it into a
  module-scope helper without thinking.
- **The version lives only in `package.json`.** Nothing in the renderer hardcodes
  it.

## Logs/Debugging
- **Verification ran against the dev profile via CDP**, launched as
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`. There is
  **no `ws` or CDP client in `node_modules`** — Node 24's global `WebSocket` is
  enough to hand-roll a driver (one lives in this session's scratchpad).
  `Runtime.evaluate` needs the expression wrapped in an async IIFE or top-level
  `await` is a syntax error.
- **`window.clipflow` cannot be patched from the page** — contextBridge freezes
  it and the property is non-configurable, so wrapping `youtubePublish` to
  capture a payload does not work. To observe a resolver against live data, add
  a temporary in-source hook (`window.__cfResolveTags = ...`), rebuild, read it,
  then remove it and rebuild again. Confirmed absent from the shipped bundle
  (`grep -c __cfResolveTags build/assets/*.js` → 0).
- **Caption previews only render for connected platforms** (`activePlat =
  platforms.filter(p => p.connected)`). The dev profile has none, so a
  preview-only platform entry had to be seeded into the store and the app
  restarted. It was removed afterwards.
- **Walking up N fixed levels from a text node to find its card is fragile** —
  it lands on the container holding every card and clicks the wrong one. Walk up
  until the ancestor contains the button you want instead.
- Renderer console after a full reload of the final build: **no errors, no
  warnings**.
- Dev profile was restored to its pre-session state: throwaway game removed,
  the two edited templates reverted from backup, tags cleared, schedule blanked,
  seeded platform removed.
