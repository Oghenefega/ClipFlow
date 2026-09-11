# HANDOFF — Session 254 (2026-09-10)

## Current State

**0.5.0-alpha.3 is on the feed**, cut and published from `133d522`. It promotes one change: the
Analytics tab declutter (`3023a17`). The served installer was content-verified — its ETag matches
the local build's MD5 byte-for-byte — not just size-matched, which is the trap #403 fell into.
alpha.2's exe and blockmap were pruned from the feed.

Master is clean at `133d522` plus this wrap. Fega's installed app was on alpha.2 when the session
ended (he took that update mid-session); the alpha.3 banner appears on his next relaunch.

Carried forward from the parallel s254 session: #401 (Analytics clip panel) and #402 (editor
glow/text colour link) are still **`status: untested`** — Fega has only confirmed that setup runs
through to the end (#403).

## Key Decisions

- **Analytics clip tile keeps five elements, not three.** Fega's call. The rank number and the
  multi-colour platform share bar are gone; the `N× median` badge, duration, title, views and
  game·date all stay. "Only 3 things" was the framing, but he chose the smaller change when shown
  the full seven-element inventory.
- **"Copy what worked" is caption-only.** Title and Hashtags both removed. Evidence, not taste:
  titles are byte-identical across Facebook/Instagram/TikTok in **121 of 121** logged posts *and*
  the title is already the panel's `<h2>`; hashtags were `hashtagsOf(capText)`, a regex extraction
  from the caption printed directly above. The caption is the only field that genuinely varies
  (0 of 121 identical — each platform gets its own tags), so the platform switcher stays.
- **The alpha.2 What's New entry was left unedited** even though it promises "title, caption and
  hashtags" in that panel, which alpha.3 makes untrue. `lastSeenVersion` is `0.5.0-alpha.2`, so
  Fega has already read it; the alpha.3 note supersedes it rather than rewriting what was shown.
- **The redesign effort was abandoned and its artefacts deleted.** Two before/after mockups
  (`mockups/redesign-pass-*.html`) were binned at Fega's request — "none of them are good". See
  Watch Out For; the failure is worth not repeating.

## Next Steps

1. **Visually confirm alpha.3's Analytics changes.** See the warning below — they were never seen
   running. Open Analytics, check a clip tile has no rank circle and no share bar, and that the
   clip panel's platform table has no `share` column and the copy block shows only Caption.
2. **#404 — 79 hardcoded Midnight colours** across 11 renderer files, leaking into the other eight
   themes. Filed this session with per-file counts, two worked examples and a repro grep. Most
   visible on Blush and Sunset.
3. **#401 / #402 still need Fega's confirmation** to drop `status: untested`.

## Watch Out For

- **The alpha.3 Analytics change was never visually verified.** It is source-traced (mount point
  confirmed at `App.js:1187`, every removed identifier grep'd to zero references) and the renderer
  builds clean, but no one has seen it render. Two attempts to screenshot the dev build were lost
  to window-focus fights, then Fega asked for the installer instead. Treat step 1 above as real
  work, not a formality.
- **`open_application "Electron"` launches Electron's built-in demo app**, not this project's dev
  instance. It opens a window titled "Electron" showing the atom logo and
  `$ electron.exe path-to-app`. Close it and use the AppActivate recipe below.
- **Three skills were installed into `~/.claude/skills/` this session** at Fega's request —
  `ui-ux-pro-max`, `ui-styling`, `design-system` (from `nextlevelbuilder/ui-ux-pro-max-skill`).
  They are not part of this repo. Worth knowing: `ui-ux-pro-max`'s top style hits for this product
  are *Aurora UI*, *Glassmorphism* and *Soft UI Evolution* — families `impeccable` explicitly bans.
  Its narrower queries are better (Adobe Spectrum for creative tools). Use it as a lookup, never as
  a driver.
- **`PageHeader` is one shared component** (`src/renderer/components/shared.js:364`) used by five
  views at 28px/800 with a 14px subtitle and `marginBottom: 28`. Anything about "the page header"
  is one edit, not eight — but it also means one edit changes five tabs at once.

## Logs/Debugging

- **Focusing the dev window from a script** (when the Browser/other apps keep stealing front):
  ```bash
  powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).AppActivate('Corva')"
  ```
  Returns `True` on success. Note both the installed exe and a source run title their window
  "Corva", so this can grab the wrong one when both are up.
- **Booting current source without touching the daily driver:**
  `CLIPFLOW_PROFILE=dev npx electron .` — loads from `build/`, no Vite. The dev profile is fully
  populated and its `clipflow-tokens.json` is `{"accounts":{}}`, which is the required pre-boot
  state. The boot log confirms `Scheduler: dev profile — scheduled publishing disabled`.
  Clean up with `taskkill //F //IM electron.exe` (double slash; **never** `Corva.exe`).
- **A probe that reported "121 of 121 identical" was reading fields that don't exist.** The publish
  log stores `clipCaption`/`clipTitle` and capitalised platforms (`"YouTube"`); the probe used
  `caption`/`title`/`"youtube"`. `filter(Boolean)` dropped every `undefined` and count-distinct
  over the empty result scored as "all identical" — a clean, plausible, exactly-backwards answer
  that got stated to Fega before it was caught. Real answer: 0 of 121. Distilled into
  `clipflow-trace-verify`; dump one raw record before trusting any aggregate.
- Publish-log entry keys, for future probes:
  `clipId, clipTitle, clipCaption, platform, accountId, accountName, videoPath, status, publishId, postId, apiResponse, timestamp`
