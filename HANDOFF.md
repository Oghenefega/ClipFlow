# HANDOFF — Session 217 (2026-08-28)

## Current State

**Session 4 of the approved 8-request plan is done: the theme system (#328) is on master in
`42574c5`.** Four themes ship — Midnight (the existing look, still the default), Daylight,
Neon Rose (dark pink) and Blush (light pink). Fega picked all four rather than one pink;
the mock is at `tasks/mocks/theme-palettes.html` and still opens standalone.

**It is NOT in an installer.** The live update feed is still `0.4.0-alpha.9`. Four issues now
sit `status: untested` behind one cut: #325, #324, #331 and #328.

**The deliverable is the engine, not the palettes.** Adding a fifth theme is three edits and
no component changes: a block in `src/renderer/styles/themes.css`, an id in `THEMES`
(`theme.js`), a canvas colour in `THEME_CHROME` (`main.js`). The #277 epic has a comment
spelling this out so the blue retheme lands as a theme rather than a competing hardcode.

**Still outstanding from session 214, still no response from Fega:** the two GTA 6 clips the
dev profile auto-published are partially published (Facebook/TikTok/Instagram out, YouTube
failed on an expired token). They need a YouTube reconnect in Settings then Retry from the
Queue. Their tracker entries are in the DEV store, so the prod Tracker will not show them.

## Key Decisions

1. **Four themes, not three.** The issue's launch set was dark/light/pink. The mock presented
   pink two ways — dark plum (Neon Rose) and light blush (Blush) — because either is a
   defensible reading of "for the girlies", and picking for him would have been a guess.
   He took both. Cheap, because a theme is one file.
2. **`T` keeps its exact shape; only its values changed.** Every key is now `var(--x)`.
   `var()` is legal in inline styles and re-resolves when the root attribute changes, so all
   23 consumers follow the theme with zero edits, no context, no re-render. The alternative —
   threading a theme object through props — would have touched every one of them.
3. **`--lift` is the whole trick.** The app tints surfaces with `rgba(255,255,255,0.04)` about
   230 times. Rather than 230 judgement calls, `--lift` is white on dark themes and near-black
   on light ones, so one alpha reads correctly both ways. `--shade`/`--shadeK` do the same for
   shadows. A new theme inherits all ~307 converted sites for free.
4. **The editor's `.dark` class is deleted, not toggled.** Once the shadcn tokens moved to
   `[data-theme]` on `<html>`, the class had nothing left to switch — and Radix popovers,
   which portal to `<body>`, inherit from the root anyway. That removed the class AND the four
   portal re-applications the issue listed as work.
5. **Track hues are identity, lettering is not.** Caption blue / subtitle lime / audio amber
   never change. Only how light the text on them is (`--trackTextL` and friends), because an
   88%-light label vanishes on a white panel.
6. **`T.onSolid` is a new key and it is not `T.text`.** It is text on a full-strength
   accent/green fill — near-black on dark themes, white on light ones. Exactly inverted from
   `T.text`. Do not "simplify" one into the other.

## Next Steps

1. **Remaining plan session:** #329 (publish mode — already decided as option (b), a
   main-process scheduler; formally amends "Close = quit").
2. **Cut an installer.** Four `status: untested` issues are queued behind one, and #328 is the
   most visible thing Fega has been unable to see. This is a natural cut point.
3. **Flip #325/#324/#331/#328 off `status: untested`** once he confirms on the installed build.
4. **Fega's call on the two half-published GTA clips** (keep or delete), then reconnect YouTube
   and Retry to finish their YouTube legs.

## Watch Out For

- **`src/main/release-notes.js`'s `"unreleased"` entry now holds session 216 AND 217.** The
  next cut renames it to the real version. If a session cuts an installer and then does more
  work, it must open a NEW one or the following update ships silent.
- **A `var(--…)` cannot resolve in three places, and all three are live in this repo:** a
  `<canvas>` 2D context, the main process, and the subtitle-overlay window. The sweep leaked
  into all three and all three were caught — a preview fade-mask gradient (`addColorStop`
  throws), the caption drop-shadow in `subtitleStyleEngine.js` (also built by
  `subtitle-overlay-preload.js`), and a scrim over video. Each is commented. The code-review
  skill now carries this as a checklist item.
- **Six literal-colour sites are deliberate and commented.** A glass-orb specular highlight, a
  button's inner edge on a blue gradient, a white play button and a timecode over video
  frames, and a scrim under white text on a brand gradient. They are lighting on fixed-colour
  things, not canvas tints. A future sweep that "finishes the job" will break them.
- **`AppErrorBoundary` is deliberately unthemed.** It renders when React has already died; a
  crash screen that depends on the theme substrate loading is a crash screen that can fail to
  draw.
- **The shadcn `--border` and `--accent` are now `--border-hsl` / `--accent-hsl`.** They
  collided with `T`'s own once both sets landed on the same root element. `tailwind.config.js`
  points at the new names. Anyone re-adding a stock shadcn snippet will paste the old spelling.
- **Scripted source sweeps must be bytes mode.** The session-215 lesson exists and I still used
  text mode; it converted 42 files CRLF→LF. `git diff` did not show it (autocrlf normalises
  both sides, and the diff stayed 742/481), but the working tree diverged from a fresh
  checkout. Restored in bytes mode afterwards. Read the file with `open(p,'rb')` next time.
- **The dev store's `theme` is `midnight`** — it was round-tripped through Blush and back
  during verification. Dev tokens confirmed as an empty `accounts` map before every boot.

## Logs / Debugging

- **Which theme is live:** `document.documentElement.getAttribute("data-theme")`, or read
  `theme` out of `clipflow-settings.json`. Open the JSON with `io.open(..., encoding='utf-8')`
  — cp1252 chokes on it.
- **Find surfaces that did not follow the theme:** the scan that caught the ruler, the toggle
  knobs and the "Manual" dot walks every element, parses `backgroundColor`, and flags anything
  opaque and dark while a light theme is active. Worth re-running after any colour change —
  it is the cheapest way to catch a hardcode. Script pattern in this session's scratchpad
  (`darkscan.js`).
- **Boot-verify path:** `isDev` is hardcoded `false`, so
  `CLIPFLOW_PROFILE=dev electron . --remote-debugging-port=9222` runs the BUILT bundle against
  the isolated dev profile — no Vite, and no fight with the daily driver's single-instance
  lock. Add `--disable-features=CalculateNativeWinOcclusion` so rAF keeps running.
- **Editor drive:** click any button whose `title` is `"Open this clip in the editor"`, wait
  ~6s, then assert `document.querySelector(".editor-scope")` exists. That class replaced
  `.dark` as the editor root's marker — old scripts looking for `.dark` will now find nothing.
- **Kill dev Electron with `taskkill`, not the harness task stop,** or CDP reattaches to a
  zombie on 9222.
