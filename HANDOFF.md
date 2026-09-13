# HANDOFF — Session 255 (2026-09-11 → 13)

## Current State

Master is clean at `77be529` plus this wrap. **No installer was cut** — one commit since
alpha.3, well short of the batch rule, so #406 and #407 are closed `status: untested` and
reach Fega's machine on the next cut.

The session started from a real symptom: connecting platform accounts on the **laptop** (the
de-Fega'd fresh-customer machine) produced four "Configure your Client ID and Secret" dialogs.
Fega chose to treat that as a product finding rather than paste his own credentials over it,
so the laptop keeps its job as the customer simulator. The output is a full first-run audit,
two fixes, a map, and an ops handoff to Wick.

**The map:** https://claude.ai/code/artifact/6ac33ed0-5120-4816-b735-d574c9e550b1 — all ten
gates between download and first published clip, ownership per gate, platform readiness,
recommended order, issue ledger. Updated after the fixes landed; gates 06–08 read Fixed with
a "Was:" line preserving the original finding.

## Key Decisions

- **Dependency issues gained a weight rather than a blanket gate.** Adding the output folder
  to `deps-check` naively would have blocked clip generation, which succeeds fine without one.
  `checkDependencies` now returns `canRunJobs` alongside `ok`; the pipeline refuses only on
  blockers. Fega's call: **warn, don't block**.
- **With no games set up, a recording reads `Unknown`, not `Just Chatting`.** Fega's call.
  Accepted edge case: a library holding *only* content types and no main game now reads
  Unknown where it read the first content entry. That is the state the new strip row exists
  to fix; revisit if a genuinely content-only creator ever hits it.
- **The laptop stays a customer simulator.** Copying the six credential values across would
  have had it publishing in 15 minutes and burned its testing value. Not done.
- **No installer.** Deliberate, per the batch rule.

## Next Steps

1. **Google OAuth consent screen — verified, or just published?** (Fega, 5 minutes, Google
   Cloud console → APIs & Services.) `youtube.upload` + `youtube.readonly` are restricted
   scopes; published-to-Production is not the same as verified, and unverified means a warning
   screen and a 100-user cap. **This changes sequencing** — it decides whether YouTube is
   ready for strangers or joins the weeks-long lane. Cheapest unknown on the board.
2. **#265 — first-run setup checklist.** Now the largest remaining code item and the one that
   makes the walk coherent: ask for the folders and a game up front instead of asking about
   content vibe. Multi-session; wants a clean context.
3. **#408** — Settings claims Gemini is configured and "titles see the clip video" on a
   bundled-token install, while `gemini-watch` hard-requires a raw key. An hour, same
   honesty family as this session's work.
4. **#405** — dead Instagram OAuth connect flow (cosmetic, misleads anyone debugging IG login).
5. **#21** — the credentials Worker. Well scoped already, but see the bottleneck below: it
   only pays off for TikTok and probably YouTube until the ops lane moves.

## Watch Out For

- **The launch critical path is not code.** Meta App Review needs Tech Provider → business
  verification → **a registered legal entity**, and an OV/EV code-signing cert (#51) is issued
  against that same registry. **Flowve is not incorporated.** These are the only two blockers
  measured in weeks. Routed to Wick's inbox 2026-09-11 with the full chain; do not re-derive
  it in a dev session, and do not let a plan imply #21 alone unblocks four platforms.
- **A "virgin" profile on this machine is not a fresh customer.** Deleting `%APPDATA%\clipflow-dev`
  and letting the app recreate it produced a profile showing **167 of Fega's real clips** —
  `main.js:501` pins the legacy `W:` watch folder whenever that path exists on disk, and
  `libraryRoot()` falls back `projectsRoot || watchFolder`. Nothing looks broken. Before any
  test that writes through the app, print `projectsRoot`, `watchFolder` and the clip count and
  require the count you expect. Repoint `projectsRoot` at a scratch dir. Now in
  `clipflow-trace-verify`.
- **Fresh-install behaviour guarded by `fs.existsSync` on a Fega path cannot be reproduced
  here at all.** The NO FOLDER SET + NO GAMES stacked case is one of them. Say so rather than
  reporting it verified.
- **AI already works with zero setup** — the gateway ships on and the installer carries a
  bundled token, so detection and titles run on a clean install. Don't plan onboarding work
  that asks a customer for an API key.
- **`deps.ok` is now informational.** Only `canRunJobs` gates the pipeline; the banner keys on
  `issues.length`. Anything new reading `.ok` as "can we run" is wrong.

## Logs / Debugging

- **CDP probe used this session:** `scratchpad/probe.js`, a port-parameterised copy of
  `scripts/dev/cdp.js` (`CDP_PORT=<port> node probe.js "<expr>"`). Boot with
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=<port> --disable-backgrounding-occluded-windows`.
  That runs the **built** renderer from `build/`, not Vite — the profile is isolated, the code is not HMR.
- **Never type a Windows path through the shell into a CDP expression.** One did, and stored
  as `C:UsersIAMABS~1...(0x0F)9c7f5b...`; the assertion that followed still passed, because a
  corrupt non-empty string is truthy. Build it as
  `['C:','Users',…].join(String.fromCharCode(92))` inside the evaluated JS and read it back
  checking for control chars.
- **Scan generated files for control bytes before committing.** `grep` reporting
  "Binary file … matches" is the tell; it caught four real control bytes this session — in the
  lessons entry describing that exact trap.
- **Nav elements are not buttons.** The tab rail's label is a `<span>` inside a `<button>`;
  select the span by exact text and click `.parentElement`. Allow ~700–900ms after a synthetic
  click before asserting.
- `taskkill //F //IM electron.exe` (double slash). Killing a backgrounded boot surfaces as a
  failed task notification — expected, not an error.
