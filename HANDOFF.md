# HANDOFF — Session 184 (2026-08-22)

## Current State

**#293 shipped (`b28e56d`, pushed to master). No installer cut** — this is one
feature on top of 0.4.0-alpha.3, well short of the ~10-change batch that earns a
version bump. The daily driver does NOT have it yet.

The rest of the session was research and planning. **Three issues filed, one closed,
two plans written to `tasks/todo.md` — one of them approved and awaiting a build.**

| Issue | State |
|---|---|
| [#292](https://github.com/Oghenefega/ClipFlow/issues/292) | Filed. Reactions as its own content type. **Gated — do not build yet**, see below. |
| [#293](https://github.com/Oghenefega/ClipFlow/issues/293) | **Shipped** in `b28e56d`. Left OPEN pending Fega's in-app pass. |
| [#294](https://github.com/Oghenefega/ClipFlow/issues/294) | **Closed as superseded** by #296. No code shipped. |
| [#295](https://github.com/Oghenefega/ClipFlow/issues/295) | Filed. Real bug — "Show subtitles" off still burns subtitles into the render. |
| [#296](https://github.com/Oghenefega/ClipFlow/issues/296) | Filed and **APPROVED by Fega**. Deferred to next session on context grounds. **This is the next build.** |

Still awaiting Fega's in-app pass from before: #284, #285, #286, #263/#269, #270,
#271, #275, #276, #278, #279, #280, #281, #282, #283, #291 — plus #293 now.

**#285's untested leg still stands:** a real YouTube publish with tags attached has
never been verified on a live video. Unchanged by this session.

## What Was Built

### #293 — published clips are now visible on the Queue, read-only

A collapsed **Published** shelf sits between the queue and the publish log, holding
the 20 most recent posts: thumbnail, game pill, title, platform chips linking to the
live posts, and the real published date/time. Opening one expands to YouTube Title /
Description / Tags, each with a copy button. **Nothing on the card is editable** —
editing tags there would write a per-clip override that silently changes what a
*repost* would send.

The clips were never deleted. They vanish because the `approved` list filters out
anything the tracker knows about (`QueueView.js:744`). The shelf rebuilds the other
side of that: tracker entry → clip, newest-first by insertion order, capped at 20.

**`logPost` now freezes a snapshot** (`published: { youtubeTitle, description, tags,
tagsCustom }`) onto each new tracker entry, using the same resolvers the publish call
just used. Without it a card renders the game's *current* lists, which drift the
moment those lists are edited — and a clip that used its game's tag list stores
nothing of its own to fall back on. The 116 pre-existing entries have no snapshot and
are labelled *"Published before Corva started recording this…"* rather than
back-filled. Fega's explicit call: "no need to fake data."

Also pointed the long-dead **Published** filter option at the new shelf. Its old
predicate (`publishStatus[c.id]?.state === "done"`) filtered the unpublished queue —
and a successful publish is exactly what removes a clip from that list, so in normal
operation it matched nothing.

### Everything else was planning — no other code changed

## Key Decisions

1. **Published clips live on the Queue, not the Tracker.** The Queue already shipped
   a "Published" filter chip that couldn't match anything, so the UI was already
   promising this. Capped at 20 in a collapsed shelf — the Tracker keeps the full
   116-entry history, and the Queue has to stay a work surface.

2. **The published card is its own small card, not a third copy of the queue card.**
   `QueueView.js` is ~3000 lines with two near-identical inline card renderers
   (`:2128` unscheduled, `:2718` scheduled). A published card needs no publish
   button, toggles, scheduling, TikTok panel, retry or dequeue — building it fresh
   was less code than reusing either, and refactoring those two into a shared
   component was out of scope.

3. **#294 (mute an SFX) was closed in favour of #296 (disable).** Disable never
   touches the volume slider, so the level survives by construction — a better answer
   to the original complaint than the `preMuteVolume` bookkeeping #294 had planned.
   It also sidesteps a trap: at `volume: 0` the sound popover's "Remember N% for this
   sound" button reads **"Remember 0%"**, which would pin silence as that sound's
   library-wide default for every future drop.

4. **#296 folds in #295 rather than shipping a second subtitle switch.** The Subtitle
   lane's enable state and the existing `showSubs` become ONE flag honoured by both
   preview and render. #295 stays filed separately so it can be fixed alone if #296
   slips.

5. **Video-segment disable is deliberately out of #296.** Segments are concatenated —
   skipping one ripples the timeline and re-maps every subtitle. Fega was offered it
   and left it out.

6. **#292 (Reactions content type) is gated, not ready.** JC's entire taste pool is
   23 decisions; splitting it starves both halves. The issue carries the gate: wait
   until reaction clips alone account for ~20–30 approve/reject decisions.

## Next Steps

1. **Build #296.** The full plan — findings, data model, file impact, steps,
   verification criteria — is at the head of `tasks/todo.md`. It is self-contained;
   it does not need session 184's conversation. Build order matters: sounds
   end-to-end first (smallest complete loop), then captions, then subtitles, then
   lanes, then the source-audio mute, **shortcuts last** once the store actions they
   call are proven.
2. **#295 can be fixed on its own first** if #296 gets deferred again. It is small
   and it is a genuine correctness bug users would hit.
3. **Cut an installer once there's a batch.** #293 alone doesn't justify one.
4. Fega's in-app pass on the backlog above.

## Watch Out For

- **`enabled !== false` must mean enabled on EVERY path in #296.** Absent flag = on
  is what makes the feature migration-free. The regression that matters most: a clip
  with nothing disabled must render byte-identically to today.
- **#293's snapshot WRITE path has never run for real.** The read side is verified
  end-to-end; `logPost`'s snapshot can only be proven by an actual publish, which was
  not done on Fega's accounts. The identifiers are sound — `resolveTags(clip,
  ytDescriptions, gamesDb)` and `getEffectiveCaption(clip, "youtube")` are the
  identical calls already live at both publish sites in the same scope — but **check
  a published card after the next real post** and confirm it reads "Exactly what was
  published."
- **The published shelf orders by tracker insertion order, not by `date`.** A
  scheduled post's `date` is the slot it was aimed at, not when it ran. Don't
  "fix" this into a date sort.
- **A tracker entry whose clip no longer exists is skipped**, not shown as a stub.
  The project was deleted; there are no settings there to copy.
- **`m` is Trim-start, not mute.** Resolve's M-for-mute is unavailable in #296.
  `d` and `shift+d` are free and are what the plan uses.
- **The Audio lane IS the video-segment lane.** There is no separate Video lane in
  `TimelinePanelNew.js` — the waveforms are the segments. That is why #296 gives it a
  *mute* and not a *disable*.

## Logs/Debugging

- **Launching the built renderer on the dev profile:**
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`.
  `isDev` is hardcoded `false`, so this loads `build/` — no Vite, and it sidesteps
  the daily driver's single-instance lock.
- **`npm run dev:seed -- --force`** copies the real prod profile (settings, tracker,
  DB) into `%APPDATA%\clipflow-dev\`. That is how #293 was verified against 116 real
  tracker entries without touching prod. Note the `--` before `--force`.
- **A synthetic `published` snapshot was injected into ONE dev tracker entry** to
  exercise the "Exactly what was published" branch, then **removed**. Prod was
  verified untouched afterwards: 116 entries, 0 carrying a snapshot. If a future
  session sees a stray snapshot in dev, that is a leftover fixture, not real data.
- **CDP driver scripts** live in this session's scratchpad (`cdp.js` plain,
  `cdp-focus.js` adds `Page.bringToFront`, `shot.js` adds `Page.captureScreenshot`).
  Node 24 has a global `WebSocket`, so no `ws` dependency is needed — ~30 lines each.
- **`navigator.clipboard` needs a focused document.** `readText` throws
  `NotAllowedError: Document is not focused` and `writeText` silently no-ops in an
  unfocused window, while the button's tick state still flips — so the UI *looks*
  like it copied. Call `Page.bringToFront` first, and read the result back with
  `powershell -NoProfile -Command "Get-Clipboard"` rather than trusting the button.
- **A bare text match hits CSS-uppercased labels.** Searching the document for
  `/^published$/i` matched the shelf's own `SectionLabel` (rendered `PUBLISHED`) and
  clicking it toggled the shelf instead of picking the filter option. Scope option
  clicks to the portalled `position: fixed` menu first.
- **`Select` (shared.js) renders a wrapper div around a `<button>`.** Clicking the
  wrapper does nothing; click `wrapper.querySelector("button")` to open the menu.
- **`taskkill //F //IM electron.exe`** — double slashes in Git Bash.
- **Heredocs with apostrophes still fail in this shell** (s183's lesson holds).
  Multi-line JS for CDP went through `Write` to scratchpad `.js` files, run via
  `node`, not inline heredocs.
