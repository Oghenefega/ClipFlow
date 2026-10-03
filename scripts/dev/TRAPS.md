# CDP verification traps (archive)

Every trap hit while driving the dev app over CDP, from session 104 onward. Moved out of agent
memory in s286, where it had grown to 60 KB and was read in full every session.
**Start with [README.md](README.md).** It has the tools and the rules that matter every time.
Search this file when a probe misbehaves; don't read it top to bottom.

- Numbering is historical. A few numbers repeat (two 20s, 21s, 22s, 23s and 43s), so cite a
  trap by its first words.
- Every "session-N scratchpad" path below is gone. The maintained tools are in this folder.
- Entries marked SUPERSEDED are kept for the history; follow the note instead.

Two Windows-specific traps when machine-verifying ClipFlow (established session 104, 2026-07-15):

1. **[SUPERSEDED: kill with `dev-kill.js` (trap 43 and 79).]** **Never stop a bash-wrapped `npx electron` dev app with TaskStop** — it kills only the wrapper; the orphaned `electron.exe` keeps holding port 9222, the next launch silently fails to bind, and CDP connects to the STALE bundle (assertions run against old code). Kill with `taskkill //F //IM electron.exe` — source runs only, so the installed daily driver is unaffected. **s218 correction: the installed app is `Corva.exe`, NOT `ClipFlow.exe` (renamed #268), and a packaged build you launch yourself from `dist/win-unpacked/` is ALSO `Corva.exe` — so `taskkill //F //IM Corva.exe` force-kills Fega's running daily driver too (did exactly that in s218). Stop packaged instances by PID, or spare the pre-existing `Corva.exe` PIDs listed before you launched.** Before trusting CDP assertions after a rebuild, confirm the target actually has the new code (probe for a new-bundle-only string).

2. **Headless render harnesses (scripts run via `npx electron harness.js` that call `renderClip`) MUST register `app.on("window-all-closed", () => {})`** — the offscreen subtitle-overlay window closes mid-render, which otherwise quits Electron: FFmpeg never spawns (or dies orphaned), the process exits 0, and there's no output file. A success-shaped failure.

**Why:** both failure modes look like success (exit 0 / assertions "ran") while verifying nothing.
**How to apply:** launch dev app as `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`; reusable CDP drivers + render harnesses live in session scratchpads (session 104: `cdp-polish.js`, `cdp-style.js`, `render-test-real.js` with the guard; session 105: `cdp-bg*.js`). Radix sliders are driven by focusing the thumb (`[role=slider]`) and sending Home/End/arrow keys. See also [[project_computer_use_app_names]].

Three editor-DOM traps that faked failures in session 105 (2026-07-16) — each burned a full driver pass:

3. **Text-click helpers that pick the first "Save" hit the editor TOP BAR's project-Save button**, not the Layout panel's inline Save. Scope clicks to the container (e.g. `input.parentElement.querySelectorAll("button")`). Symptom: "clicked: Save" logs, nothing saves, no error.

4. **CDP `Input.dispatchMouseEvent` is hit-tested — panel content below the scroll fold silently swallows drags** (programmatic `.click()` bypasses hit-testing, so buttons "work" while drags don't, which misleadingly implicates the drag handler). `scrollIntoView` the target and probe `document.elementFromPoint` before dispatching pointer sequences.

5. **`[role=slider]` queries catch the timeline zoom slider too** (a 5th thumb beyond the Layout panel's four). Scope slider assertions to the panel region (thumb rect x>880, y<580 at the default window size) or a panel container query.

Two UI-drive traps from session 108 (2026-07-16, B2 verification):

6. **Every main-view tab pane is ALWAYS mounted (`display:none` when inactive, #33 scroll preservation)** — unscoped `querySelectorAll` matches buttons/text in hidden panes (e.g. the Rename view's buttons while "in" Projects). Filter every DOM query with `e.offsetParent !== null` to scope to the visible view.

7. **Project cards don't react to `.click()` on the matched text div** — the handler lives on an ancestor. Walk up from the text match to the first `getComputedStyle(n).cursor === 'pointer'` ancestor and click that. Session-108 scratchpad (`4e312d69…`) has the reusable pattern: `cdp.js` (one-shot evaluator), `killtest.js`, `successtest.js`.

Four traps from session 109 (2026-07-16, B3 verification):

8. **When DOM probes contradict expected UI state, take a `Page.captureScreenshot` IMMEDIATELY — visual ground truth beats text probes.** Session 109 burned ~6 probe rounds "proving" the calibration boxes weren't rendering; one screenshot showed them working (a probe-side selector had matched a hidden pane's video, and the state had also self-healed between probes). Screenshot first, then reconcile.

9. **FIXED (session 111, ≥0.2.0-alpha.1 — do NOT nudge anymore):** #166 (calibration boxes invisible until first resize) was fixed by sync-measuring the preview container at mount (a66b787); the old ArrowLeft/ArrowRight divider-nudge workaround is obsolete. If boxes ever fail to appear on a fixed build, that's a NEW bug — screenshot + file it, don't nudge past it. The divider keyboard trick remains valid where a driver genuinely needs to force a layout change (see gotcha 11).

10. **Right-rail drawer tabs (Layout etc.) need position-based selection** — text matching hits same-named elements in hidden panes even with offsetParent scoping when reused across editor mounts. Filter candidates to `rect.x > window.innerWidth - 120` and pick the smallest.

11. **Electron's CDP has no `Browser.getWindowForTarget`/`setWindowBounds`** — you cannot resize the app window from outside; use the panel-divider keyboard trick (gotcha 9) to force layout changes. Session-109 scratchpad (`407e91fe…`) has the current driver set: `cdp.js` (with `process.exit` after print — plain `ws.close()` hangs node), `drag.js` (raw `Input.dispatchMouseEvent` drag), `shot.js` (screenshot), `parity/cases.js` (filter-string harness; plain node works because `buildNleFilterComplex` is exported).

Three traps from session 110 (2026-07-17, B4 verification):

12. **[Coordinates SUPERSEDED by trap 80 (the nav moved).]** **Bottom-nav tab items do NOT respond to `element.click()`** (unlike shadcn `<button>`s, which do) — dispatch real `Input.dispatchMouseEvent` press+release at the label's center coordinates. At the default 1280×860 window: Projects tab (461,841), project-row title ~(630, row-y), Review "Open in Editor" (570,663), editor back arrow (29,60), review→projects-list back arrow (268,104).

13. **Never assert the current view via `document.querySelector('h1')`** — with every pane mounted (gotcha 6), the FIRST h1 in DOM order is always the Rename pane's, so the probe answers "Rename" regardless of the visible tab. Screenshot to confirm navigation.

14. **The repo has NO `ws` module anywhere (checked node_modules recursively)** — CDP scripts must use Node ≥22's GLOBAL `WebSocket` (this machine runs Node 24). Session-110 scratchpad (`16bae84b…`) has the rewritten toolkit on it: `cdp.js`, `click.js`, `shot.js`.

When computer-use input dies, pivot to CDP (session 130, 2026-07-26):

16. **A foreground Windows helper can block ALL computer-use input while screenshots keep working.** A snap-layout flyout opened on hover and every subsequent click/keypress returned "Powertoys.mousewithoutbordershelper is not in the allowed applications and is currently in front." Don't grind — relaunch the dev app with `--remote-debugging-port=9222` and drive via CDP: programmatic `.click()`, DOM/computed-style probes and `Page.captureScreenshot` need no foreground grant and aren't hit-tested. Verified a badge's element count, computed colors and per-row placement in minutes after ~4 blocked input calls. (Note: gotcha 14 still holds for the repo, but `npm i ws --no-save` inside the session scratchpad works fine if you'd rather not use the global WebSocket.)

Four traps from session 134 (2026-07-28, #202 verification):

17. **`Input.dispatchMouseEvent` needs an explicit `buttons` bitmask or drags degrade to clicks/nothing** — send `mousePressed` with `buttons:1`, every `mouseMoved` with `buttons:1`, `mouseReleased` with `buttons:0`. Without it, pointerdown/pointerup may not synthesize at all.
18. **A `window.location.reload()` mid-input-sequence WEDGES the browser-process input state** — after it, ALL trusted CDP input (clicks included) stops producing pointerdown/up for the page, across fresh websockets; a bare mouseReleased does NOT unwedge it. Only relaunching the app fixes it. Never reload while any dispatched gesture could be open.
19. **React hover states come from `mouseover`, not `mouseenter`** — synthetic `new MouseEvent('mouseenter')` never triggers `onMouseEnter` (React derives enter/leave from mouseover/out). Dispatch `mouseover` with `bubbles:true`.
20. **Re-read element coordinates immediately before every trusted gesture** — timeline auto-scroll during playback and drawer open/close both move blocks between probes (a block probed at x=100 sat at x=-75 one playback later), so a stale rect makes the gesture hit a neighbor (e.g. the full-width music block). Also: full-screen popover backdrops (`fixed inset-0`) swallow the next pointerdown — close any open popover before dispatching. Session-134 scratchpad (`70c9c478…`): `cdp.js`, `cdp-input.js` (click/drag/rclick/undo/redo with correct buttons), `cdp-shot.js`.

Three traps from session 135 (2026-07-29, #202 follow-up verification):

21. **Alt+drag (and any modifier gesture) needs `modifiers` on EVERY mouse event in the sequence** — press, all moves, release (Alt=1; see gotcha 15's bitmask). Handlers that sample the modifier live off `pointermove` (the Windows-swallowed-Alt workaround) read it from the move events, so a modifier only on the press silently degrades to a plain drag.
22. **A `cdp-input.js` drag can hang the node process AFTER the gesture landed** (websocket close race) — the action succeeded, the script just never exits. Wrap driver calls in `timeout 25 node …` and verify by probe/screenshot instead of trusting the exit code; a killed driver does not mean a failed gesture.
23. **Hover-revealed buttons need a separate `move` command before the `click`, and the row's Y shifts once a status line appears** — the Audio panel's "+" only mounts on hover, and the panel's own feedback line pushes every row down ~23px, so coordinates captured a step earlier miss by half a button. Move → screenshot → click, in that order, for any hover-gated control.

Two traps from session 136 (2026-07-29, #204/#188/#205 verification):

24. **`getComputedStyle` lies about in-flight CSS transitions while the Electron window is BACKGROUNDED** — a hover-revealed element read `opacity: 0` for seconds after its inline style was correctly set to `1` (Chromium suspends compositing/transition ticking in an unfocused window). Firing `Page.captureScreenshot` forces a paint; the very next probe returns the true value. If a computed style contradicts the inline style, screenshot first, then re-probe — don't debug the code.
25. **The Zustand editor stores aren't on `window`, but the open clip is readable from the React fiber tree.** Walk from `#root`'s `__reactContainer$…`/`__reactFiber$…` key up to the root, then over `child`/`sibling`, scanning each fiber's `memoizedState` hook chain for an object with a `clip_`-prefixed `id` and a `renderStatus` key — that's `useEditorStore.clip`, i.e. exactly what `buildRenderPayload` spreads into the render IPC. Lets a render-payload bug be proven without writing a file into the real library. Also: pass the probe as ONE line (`tr '\n' ' '` over a file with `//` comments comments out the rest of the script).

Two traps from session 141 (2026-07-30, #220 verification):

26. **`requestAnimationFrame` fires ZERO times in an occluded Electron window — any rAF-driven feature measures as completely dead.** The new rewind loop (a rAF walking the playhead back) read as broken across three probe rounds: playhead frozen, `rafScheduled: 0`, no errors. `document.visibilityState` was `"hidden"`. The fix is one CDP call before evaluating: `Page.enable` → `Page.bringToFront` (optionally `Emulation.setFocusEmulationEnabled`), then wait ~500ms — after which rAF ran 121 frames/500ms and the feature was provably correct. Note the asymmetry that makes this so misleading: `<video>` playback, `.play()/.pause()`, store writes and DOM updates all keep working while occluded, so only the rAF-dependent part looks broken, which frames it as a bug in the new code. Sibling of gotchas 24 (suspended transitions) and 8 (screenshot first). Driver: `cdp2.js` in the `69384ec0…` scratchpad.
27. **[SUPERSEDED: `dev-fixture.js setup` sandboxes all four folders (see trap 82).]** **The dev profile and prod SHARE `projectsRoot`, so `CLIPFLOW_PROFILE=dev` does NOT sandbox project data.** Only `userData` (settings/DB) and `outputFolder` differ; both profiles read `W:\…\Vertical Recordings Onwards`. A destructive verification (pressing the new "End to playhead" key) trimmed one of Fega's REAL clips from 27.3s to 5s in `.clipflow/projects/<id>/project.json`, and autosave persisted it within the second. Before any destructive dev-profile test: diff `projectsRoot` across both `clipflow-settings.json` files, record the original `nleSegments`, and restore through the app's own undo + Save (then verify on disk) rather than hand-editing the JSON. See [[project_projects_root_path]].

Three traps from session 142 (2026-07-31, #221/#222 verification):

28. **`Page.bringToFront` and user32 ShowWindow/SetForegroundWindow can BOTH fail to flip `visibilityState` back to "visible" — launch with occlusion detection disabled instead.** The reliable fix for gotcha 26: relaunch the dev app with `--disable-features=CalculateNativeWinOcclusion --disable-renderer-backgrounding --disable-background-timer-throttling` — rAF then fires (120 ticks/500ms) no matter what covers the window. Use these flags for ANY dev-profile verification that needs playback/animation loops alive.
29. **Editor autosave fires ~800ms after every edit (`_autosaveTimer`, useEditorStore) — killing the app does NOT discard editor edits.** Combined with gotcha 27 (shared projectsRoot), every CDP editor edit is on Fega's real disk within a second. Capture the clip's `nleSegments` BEFORE the first destructive gesture — sourceStart of the first (id `seg-<clipId>-0`) and sourceEnd of the last segment survive splits/middle-deletes and are the exact restore recipe. Restoring by hand-editing `project.json` (app closed) works and was verified. Standing rule since this incident: pick the test clip per [[feedback-test-on-rejected-clips]] — rejected clips only.
30. **Clicking a timeline section canvas SEEKS to the click position (select+seek in one gesture, WaveformTrack `onSeekClick`)** — a "select the section, then play N seconds" script actually starts from the click X, not from where the playhead was. Compute the click X for the timeline time you want, or your cut/boundary positions land far from where the test assumes (session 142 burned a full false "stale playback store" investigation on this). Also: `S` is NOT split — `S`=trim-end-to-playhead, `U`=split; grep `shortcuts/registry.js` before dispatching any editing key.

Three traps from session 143 (2026-08-01, #230 verification):

31. **First-match button targeting across a card list is ORDER-FRAGILE — the probe's second gesture must be scoped to the card the first gesture touched.** "Click the first 'Reject clip'" and then "click the first 'Remove rejection'" hit DIFFERENT cards on the All tab (already-rejected cards sit earlier in the list), so the un-reject landed on one of Fega's REAL rejections. Either assert exactly-one-match before clicking (on Pending post-#230 the lingering card's Remove-rejection IS unique — itself an assertion), or hold a reference to the first gesture's card. Gotcha 32 is what made this recoverable.

32. **Snapshot-before-touch is the mandatory harness for any test that writes through the app to shared real data (gotcha 27).** Copy `project.json` to the scratchpad BEFORE the first gesture; after the test, field-diff current vs snapshot (statuses AND side fields — a chip toggle leaves `rejectReasons: []`/`rejectNote: ""` residue a status-only diff misses); restore by copying the snapshot back with the app CLOSED and assert byte-identical. This protocol caught and fully reversed the gotcha-31 damage in session 143.

33. **Assert DOM text, not rendered text.** `Rejected` and `Why?` render as REJECTED / WHY? via CSS `textTransform: uppercase`; probes counting visible leaves with the uppercase form returned 0 while the feature worked (structural counters — button titles — passed alongside, exposing the miscalibration). Grep the JSX for the literal string before asserting on it; prefer counting visible leaf elements with the exact DOM string over text-walking up to "the card".

Four traps from session 154 (2026-08-05, #242/#243/#225 verification):

34. **App-load `projectList` can lose to the store's cached `localProjects` fallback — a seeded fixture project then never reaches App state while a direct IPC probe happily returns it.** App.js falls back to `all.localProjects` (stale, from old sessions) when the load-time list comes back empty, so the queue showed 42 phantom approved clips and zero fixture clips. Tell: nav badge/counts disagree with a fresh `window.clipflow.projectList()`. Harness fix: delete the `localProjects` key from the seeded dev settings before launch, then restart. Sibling of the session-130 "prove the fixture loaded through the app's own API" rule.
35. **Settings group panes persist their collapsed state — a collapsed "Content Library" removes the whole Games grid from the DOM** (not hidden: unmounted). Probe for the section label ("Games") first and click the GroupHeader to expand before asserting on chips.
36. **The shared `Select`'s clickable trigger is a `<button>` INSIDE the root div — `.click()` on the root does nothing and the portal menu never opens.** Click `root.querySelector('button')` (mousedown + click). The menu portals to `body`; find options by exact trimmed label text inside the portal containing "Pick date...".
37. **Queue rows toggle: re-clicking an expanded row COLLAPSES it.** A second drive pass that blindly "clicks the row" closes the detail and every subsequent button lookup returns NOTFOUND. Check for the detail's marker button (e.g. "Schedule") first; click the row only if absent.

Three traps from session 163 (2026-08-12, #244 verification):

38. **`safeStorage` encryption is PER-PROFILE — the key is DPAPI-wrapped inside the userData dir's "Local State".** A seed script that encrypts tokens under default-Electron userData produces values the dev app silently decrypts to `""` (falls into missing-token branches, not the intended failure mode). Seed scripts must `app.setPath("userData", …clipflow-dev)` BEFORE `app.whenReady()`.
39. **Document-wide text probes match the always-mounted HIDDEN tab panes.** Every tab pane stays in the DOM under `display:none`, so "is X visible after this filter?" must walk ancestors for computed `display:none` — a scheduled clip's title "leaking" through the failed filter was actually the hidden Tracker pane's calendar preview.
40. **Settings' collapsed groups (PUBLISHING etc.) unmount their cards — and the group headers are CSS-uppercased.** A badge/card assert must first find the header by `textContent.trim().toLowerCase()` ("publishing", not "PUBLISHING"), click its "Show", THEN probe. Sibling of trap 35 (Content Library) — this generalizes to every Settings group.

Three traps from session 170 (2026-08-17, #146 failure-mode pass — engine-setup testing):

41. **[Partly SUPERSEDED: `process.mainModule.require` no longer works, see trap 74. `dev-launch.js --main` does the launch and the wait.]** **Main-process patching via `--inspect=9229` is the tool for simulating machine states the renderer can't fake** (no-GPU, fresh-customer store, forced probe failures). Launch with BOTH `--remote-debugging-port=9222` (renderer) and `--inspect=9229` (main); the same drv.js WebSocket evaluator works on either port. Reach modules with `process.mainModule.require('./x')` (fallback: `process.getBuiltinModule('module')._cache` scan) and patch their EXPORTS (`sr.getState = wrapped`) — call sites using `mod.fn()` property lookup pick it up; destructured imports don't. **Wait ≥15s after launch before attaching** — an early evaluate finds a half-loaded module cache (`undefined.exports`) and 9222 not yet bound ("fetch failed"), looking like a driver bug.
42. **Never `socket.destroy(new Error(...))` on a live TLS socket to simulate a network drop — it can CRASH the whole app.** Node internals (TLSWrap.onStreamRead → getSystemErrorName with a bogus positive errno) throw a RangeError that main.js's uncaughtException handler rethrows by design → exit 7. Real drops surface as ECONNRESET/'aborted' through normal error events; the app's own cancel/abort paths already reproduce that class. If a stall (no events at all) must be tested, it needs a real network cut — code-review the watchdog instead.
43. **The #251 boot migration re-pins `whisperPythonPath` (and hfHome) from the legacy `D:\whisper` paths on EVERY boot when the key is empty and the venv exists** — editing the dev store on disk cannot fake a fresh customer machine on Fega's hardware. Mask in-process instead: wrap the store passed to setup-runtime's getState/start in a Proxy whose `get` returns "" for values starting with `d:\whisper` (fresh installs pass through, so the flow's own `store.set` of the new engine path still reads back correctly). Session-170 scratchpad (`691935f7…`): `drv.js` (dual-port evaluator with `@file` expressions), `patch-store.js`, `patch-nogpu.js`, `patch-verifyfail.js`, `shot.js`, `mkfiller.js` (disk-full filler), `corrupt.js` (byte-flip a .part).

One trap from session 172 (2026-08-18, #261 verification):

44. **Never build Windows paths inside inline `node -e "..."` through bash — double-quoted bash eats backslashes, so `'C:\\nonexistent\\python.exe'` reaches node as `C:<newline>onexistent...` and `%APPDATA%\clipflow-dev\file.json` becomes a flat junk file named `Roamingclipflow-devfile.json` in AppData.** The failure is silent and self-consistent: the mangled-path write "succeeds", the mangled-path read reads it back, and existsSync on the REAL file reports false — session 172 concluded "NO DEV STORE" while the real 821 KB store sat there, then burned a full app-launch cycle on the phantom. Rule: any script touching Windows paths gets Written to a scratchpad .js FILE with paths as JS literals and run via `node file.js`; bash `while read` loops over Windows paths need `read -r` (same class). Clean up: check `AppData\` for `Roaming*`-prefixed junk files/dirs after any inline-script accident.

One trap from session 174 (2026-08-19, #264 verification):

45. **[SUPERSEDED: use `dev-kill.js`.]** **Single-slash `taskkill /IM electron.exe /F` in Git Bash is MSYS-path-mangled ("Invalid argument - 'D:/Git/IM'") and kills NOTHING — with stderr suppressed the miss is invisible, and every "relaunch" after it silently measures the OLD instance.** The tell chain: the fresh `npx electron` bounces off the single-instance lock and its background task reports exit 0 (looks like a detach), CDP still answers on 9222 (the stale session), and in-session state (refs like `lastRenamedGame`) leaks into what you think is a fresh-boot test — session 174 chased a phantom "Day3" bug for three probe rounds this way. Rule: always `taskkill //IM electron.exe //F` (double slash, matches trap 1), NEVER suppress its output, and gate every relaunch on `tasklist | grep -ci electron` returning 0 first.

Two traps from session 177 (2026-08-20, #271 verification):

46. **The audio calibration wizard can be E2E'd through its REAL production path without any dialog: `window.clipflow.generateClips(<multi-track file>, {})` with dev `audioSetup` null fires the #169 gate and mounts the modal** (gate runs before any heavy pipeline work). Two hard rules: NEVER click Done — completing the gate lets the real pipeline proceed (Whisper + AI on the full recording); always exit via Cancel. And Cancel sets a 60s decline cooldown (`calibrationDeclinedAt`) during which the gate auto-cancels WITHOUT mounting — wait 65s between runs. Note the gate structurally cannot exercise prefill (fires only on trackCount mismatch; prefill seeds only on match) — prefill is testable only via Settings → Recalibrate (native file dialog, manual).

47. **Full-screen modal overlays don't protect background UI from synthetic clicks — `.click()` bypasses hit-testing, so an unscoped "find button by text" can fire handlers in the always-mounted panes BEHIND the overlay** (session 177 clicked a Rename-tab row through the wizard). Scope every query AND click to the overlay container (`div` with the modal's zIndex, e.g. 1100). Combines with trap 33 (CSS-uppercased text: compare `innerText.toLowerCase()`) — both hit in the same run.

One trap from session 117 (2026-07-20, #172 verification):

15. **Synthetic `dispatchEvent` clicks are NOT equivalent to trusted input — reproduce UI behavior failures with `Input.dispatchMouseEvent`/`dispatchKeyEvent` (with `modifiers`) before touching app code.** Synthetic clicks skip mousedown/mouseup, so (a) they can FAKE bugs (no mousedown = menus with outside-mousedown-close handlers behave differently) and (b) MASK them; an unpaired synthetic mousedown on a MiniSpinbox leaves its hold-repeat interval running forever. Session 117's shift-click range bug was confirmed real only after a trusted-input replay (`cdp-shift.js` in the `77c88f41…` scratchpad, alongside `cdp.js`, `cdp-hover.js`, `cdp-final.js`, `cdp-repro*.js`). Modifiers bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8.

**s179 additions:** `innerText` is RENDERED text — `text-transform: uppercase` headings come back uppercase and inline children get newline-separated ("6
posted this week"), so exact-string `.includes()` probes lie; match with `/regex/i` + `\s+`, or read refs/fiber state (`__reactFiber$` → first function-component fiber → `memoizedState` chain in source declaration order). Each probe click on a toggle flips parity — reset to a known state first. Prove a probe detects the positive case before diagnosing the app from its negative (40 min lost on a working game picker). Window sizes: `Browser.setWindowBounds` is unimplemented in Electron; use `Emulation.setDeviceMetricsOverride` on the page target (persists across CDP sessions). Dev-profile tracker store is empty — seed `%APPDATA%\clipflow-dev\clipflow-settings.json` (backup first, restore guarded on marker ids) to exercise past/HIT/entry states.

**s180 additions (2026-08-21, #281/#282 verification):**

48. **Gotcha 27 has a clean fix: point the DEV profile's `projectsRoot` + `watchFolder` at a scratchpad dir holding a throwaway `.clipflow/projects/<id>/project.json`.** Dev then reads/writes only fixture data, so schedule/status/render-field tests can be destructive with zero risk to the real library — no snapshot-restore dance (gotcha 32) needed. Build the fixture by cloning a real project.json and overwriting its clips, so the shape is guaranteed valid. Clips must carry `renderStatus: "rendered"` or App's `allClips` memo drops them (and `scheduledClips` with it). Back up `%APPDATA%\clipflow-dev\clipflow-settings.json` first and restore it at the end, or the next dev run silently stays pointed at the scratchpad.

49. **HTML5 drag-and-drop is E2E-testable with synthetic `DragEvent` + `new DataTransfer()` — no `Input.setInterceptDrags`/`dispatchDragEvent` needed** — as long as the app keeps its drag payload in a ref rather than in `dataTransfer` (which it should anyway, since a source node that unmounts mid-drag takes its `dragend` with it). Dispatch `dragstart` on the card, then `dragover`/`drop` on the target with REAL `clientX/clientY` — a default `clientX: 0` bubbles up to any container-level edge/auto-scroll handler and arms it. The drag stays "in flight" across separate CDP eval commands until you dispatch `dragend`, so any timer gated on drag-active keeps ticking in the gaps between probes: that is how the #282 runaway edge-scroll bug surfaced. Treat an unexplained state change between two probes as a live timer, not a flaky probe.

**s181 additions (2026-08-21, #283 colour-picker verification):**

50. **Never fake a `pointerdown` with `new MouseEvent("pointerdown")` on a preview overlay — it crashes the renderer.** `DraggableOverlay.onPointerDown` calls `e.target.setPointerCapture(e.pointerId)`; a synthetic event has no `pointerId`, so the browser throws `NotFoundError: No active pointer with the given id is found`, the error boundary catches it and the whole editor becomes "Corva crashed". Real product code can never hit this (a genuine pointerdown always has an active pointer), so it is a test artifact, not a bug worth filing. Select canvas overlays with **CDP `Input.dispatchMouseEvent`** (mouseMoved → mousePressed → mouseReleased) — that produces a real pointer and `setPointerCapture` succeeds. Radix popovers and plain React `onClick` buttons are still fine to drive with `.click()` from `Runtime.evaluate`.

51. **Don't batch several state-mutating steps into one `Runtime.evaluate`.** An #283 test that seeded localStorage, opened the picker, clicked a swatch and closed it — twice, in one call — reported two false failures: step A left the subtitle colour equal to what step B then treated as its baseline, so a "no change → write nothing" guard correctly did nothing and looked like a broken write. Re-running each check as its own self-contained call (fresh seed, one action, one assertion) passed immediately. When a CDP probe contradicts a mechanism you have already seen work, suspect the probe's own preconditions before the code.

52. **A component that unmounts inside the same handler that changed its value never re-renders, so unmount-cleanup refs hold the PRE-change value.** Real bug found this way: `InlineColorPicker`'s swatch did `onChange(c); onClose();`, React batched both, the component unmounted before re-rendering, and the `latest.current` ref its cleanup read was still the old colour — so the pick was silently never recorded. Fix: have the closing action write its own value directly; keep the unmount path only for inputs that leave the component mounted while their value changes. Worth checking any "save on unmount" effect that coexists with a close-in-the-same-handler control.

**s182 additions (2026-08-22, #284/#285/#286 verification):**

53. **`window.clipflow` cannot be wrapped from the page — contextBridge freezes the object AND defines the window property non-configurable/non-writable, so `Object.defineProperty(window,'clipflow',…)` throws "Cannot redefine property".** There is no way to intercept an IPC payload (e.g. what `youtubePublish` is actually sent) from a CDP probe. When a resolver's OUTPUT must be observed rather than inferred, add a temporary in-source hook inside the component so it closes over the live props (`window.__cfResolveTags = (clip) => resolveTags(clip, ytDescriptions, gamesDb)`), `build:renderer`, drive it with synthetic inputs, then delete it and rebuild — and prove it is gone with `grep -c __cfResolveTags build/assets/*.js` → 0. Cheaper and more honest than arguing from the diff.

54. **[The 'dev has none' premise is STALE (s214): dev tokens must be EMPTY by rule; use `dev-fixture.js setup --accounts` for placeholder accounts.]** **Queue caption previews only render for CONNECTED platforms (`activePlat = platforms.filter(p => p.connected)`), and the dev profile has none — so any `{schedule}`/caption substitution test renders nothing at all until you seed one.** Write `platforms: [{key:'yt-dev-preview', platform:'YouTube', name:'Preview Only (dev)', connected:true}]` into `%APPDATA%\clipflow-dev\clipflow-settings.json` and RESTART (App.js reads platforms at load; `refreshOauthAccounts` merges rather than replaces, so a manual entry survives). Remove it afterwards. Related: walking up a fixed N parents from a text leaf to find "its card" lands on the container holding EVERY card and drives the wrong one (cost two wrong-card runs) — walk up until the ancestor actually contains the button you want, then click that. And `location.reload()` inside a `Runtime.evaluate` kills the execution context mid-call: the evaluate returns undefined and any screenshot taken in the same call is blank — reload in its own call, then drive.

55. **The dev profile's `watchFolder` + `projectsRoot` can be repointed at a scratch fixture tree to test rename/pipeline destructively (session 192).** Back up `%APPDATA%\clipflow-dev\clipflow-settings.json`, rewrite both keys, drop OBS-named fixtures in, restart — reconcile ADOPTS anything matching the renamed-file pattern, so `2026-08-24 EO Day1 Pt2.mp4` becomes a real Recordings row with a working "Play in editor". Restore the backup and delete the fixture DB rows afterwards (`DELETE FROM file_metadata WHERE current_path LIKE '%scratchpad%'`). Two traps: (a) **clip generation silently blocks on the #169 audio-calibration gate** when the fixture's audio-track count differs from the saved `audioSetup.trackCount` — the UI sits on "Analyzing File / Starting…" forever with no pipeline log; build fixtures with a matching track count (5, currently) instead of debugging a stall that isn't one. (b) Reusing a filename that already has a project makes the card render as done/processed (green, no "Clip N Recording" button) — give each fixture a fresh date so it renames to an unused day/part. Also: a bare `npx electron harness.js` does NOT get the dev userData just from `CLIPFLOW_PROFILE=dev` (that's read by main.js, which the harness doesn't load) — call `app.setPath("userData", path.join(process.env.APPDATA, "clipflow-dev"))` first or you silently create a fresh empty DB under `%APPDATA%\Electron`.

56. **An exception thrown inside a `Runtime.evaluate` expression trips the app's React error boundary — the window shows "Corva crashed" and the run is over.** Driver expressions must return a string on every path (`if (!el) return 'row missing'`) rather than letting a null dereference escape. Costs a reload + full re-navigation each time.

57. **The Tracker calendar only renders the VISIBLE week, so a seeded `trackerData` entry dated outside it is invisible — and reads as "the feature didn't render".** Session 197 seeded a fixture entry five days back and spent a restart on a not-found probe before checking the week header. Seed to the app's own idea of today (the header prints it, e.g. "Tue, Aug 25") and note it does NOT have to land on a template time slot — off-slot entries render too (`TrackerView.js` merges them after the slot rows). Sibling trick from the same session: a **scheduled** clip renders as a tracker card via `scheduledClips`, so row-level tracker rendering (badges, pills) can be exercised with zero publishing — schedule from the Queue instead of seeding a published entry.

Three more from session 206 (2026-08-26, #312 timeline lanes):

- **No CDP client is needed and none is installed.** `ws` is NOT in `node_modules`, but Node 24
  has a global `WebSocket`, so a ~40-line driver over `http://127.0.0.1:9222/json/list` +
  `Runtime.evaluate` ({returnByValue, awaitPromise}) is the whole dependency story. Pattern:
  `node cdp.js --file probe.js` so probes are real files (see the heredoc rule in
  [[feedback_bash_backslash_collapse]]). `Page.captureScreenshot` with a `clip` box from
  `getBoundingClientRect` gives a legible region shot instead of a whole-window one.
- **Dispatching a keyboard shortcut on BOTH `window` and `document` fires it twice.** The
  document event bubbles to window, so a "single" Ctrl+Z ran two undos and looked like the undo
  had eaten an extra step — a fake bug that cost a diagnosis pass. Dispatch on `window` only.
- **Two kinds of hidden control, two ways in.** CSS-gated (`hidden group-hover/x:flex`) responds
  to `.click()` while invisible — React's root listener still catches it. REACT-state-gated
  (`{hovered && <button/>}`) does not exist in the DOM at all: dispatch
  `new MouseEvent("mouseover", {bubbles:true})` on the row, await a tick, THEN query for the
  button. Walk up from the label a few levels — the handler is rarely on the element you found.

**Also:** `CLIPFLOW_PROFILE=dev electron .` loads from `build/`, not Vite (`isDev` is hard-coded
false in main.js), so it boot-verifies the REAL bundle — the right way to satisfy
[[feedback_no_dev_server_for_verification]] while still getting CDP.

**s210 additions.** Node 24 has a built-in `WebSocket`, so a CDP driver needs no `ws` dependency
(the repo has none) — `http.get` `/json/list` for the target, then plain `new WebSocket(url)`.
`curl` against 127.0.0.1:9222 returned nothing on this machine; `http.get` works. Driving the
editor: the Projects tab's "Open in Editor" buttons come back in clip order — index them rather
than walking up from a clip title. The transport play button carries no title or aria-label; find
it by geometry. Sampling state ACROSS playback must be ONE async expression with `setTimeout`
steps (the driver awaits promises) — a 7s clip finishes between separate round trips.

**[SUPERSEDED by #376: the scheduler refuses to auto-publish on any source run and on the dev profile.]** **s218 — the danger MOVED: `npm start` is now the risky boot, and the dev profile is the safe one.** #329 relocated the scheduler into the MAIN process, so it no longer needs the Queue open. Two consequences that invert the s214 advice: (1) the dev profile is now guarded in CODE — it refuses to auto-fire unless `CLIPFLOW_ALLOW_DEV_PUBLISH=1` — so `CLIPFLOW_PROFILE=dev` is the SAFE verification path; (2) `npm start` runs the PROD profile with Fega's real tokens and boots a live publisher that ticks within a minute, so the CLAUDE.md-mandated "build + npm start" ritual is itself a publishing action. Verify publish-adjacent work with `CLIPFLOW_PROFILE=dev`, or the packaged exe against the dev profile. If a prod boot is genuinely needed, grep `clipflow-settings.json` for past `scheduledAt` values first and kill it the moment the boot assertion passes. Open question left for Fega (tasks/lessons.md S218): should the scheduler refuse to auto-fire when `!app.isPackaged`, making the ritual permanently safe at the cost of his `npm start` backup path silently not publishing?

**s214 INCIDENT — the dev profile PUBLISHED FOR REAL (2026-08-28).** Gotcha 27 (shared
`projectsRoot`) + real OAuth tokens in `%APPDATA%\clipflow-dev\clipflow-tokens.json` (copied by a
past `dev:seed`) + QueueView's 60s auto-publish tick (fires ~immediately on boot for any
`scheduledAt <= now` clip) = **two of Fega's overdue scheduled clips went out to his REAL
Facebook, TikTok and Instagram at ~1:15 AM during two routine verification boots.** (YouTube
failed only because its token had expired.) Gotcha 54 ("dev has no connected platforms") was
stale — dev had live tokens. Mitigation taken: dev `clipflow-tokens.json` emptied to `{}` (backup:
`clipflow-tokens.backup-s214.json` beside it). **Standing rules:** (1) before ANY dev-profile
boot, confirm `clipflow-tokens.json` holds NO accounts — publishing from dev must be impossible.
**s215: the app rewrites the hand-edited `{}` into its own schema, `{"accounts":{}}` — that is
still empty and still safe. Check for an empty `accounts` map, not the literal string `{}`, or
you will misread a normalized file as a re-seed;** (2) never
re-seed tokens into dev (`dev:seed` copies them — re-empty after any seed); (3) a scheduled clip
in the REAL library is a loaded gun for every profile that can see `projectsRoot` — repoint to a
scratch fixture (gotcha 48/55) for anything queue/publish-adjacent. Side effect to know: when a
dev-profile publish does happen, tracker entries + title/caption training rows land in DEV's
store/DB, not prod's — the prod tracker silently misses those posts (they self-heal only if a
later prod-side retry completes the clip).

**s215 — scratch-fixture recipe for anything Queue-adjacent (cost 3 reboots to find).** Copying
real `project.json` files into a fixture `projectsRoot` is NOT enough to get rows in the queue.
QueueView's `approved` filter knocks a clip out **by id AND by title** against `trackerData`
(the id set plus a `scheduledTitles` title knockout), and `allClips` in App.js only keeps clips
with `renderStatus === "rendered"`. A fixture built from already-published clips therefore loads
(the Published shelf fills) while Unscheduled stays stubbornly 0. Fix: rewrite BOTH `id` and
`title` to unique values, null out `scheduledAt`, keep `status: "approved"` +
`renderStatus: "rendered"`. Also: per-platform caption blocks only render when
`platforms[].connected` is true, so a token-less dev profile shows "All platforms disabled" —
seed 4 stub accounts (`{key, platform, connected:true}`) in dev `clipflow-settings.json`; they
grant no tokens, so publishing still cannot succeed. Back up and restore that settings file
around the whole exercise.

**The editor root's marker class is `.editor-scope`, not `.dark` (session 217, #328).** The theme
system deleted the static `dark` class from `EditorLayout` and the four Radix popovers that
re-applied it — both styling systems now read `[data-theme]` on `<html>`, which portals inherit
through `<body>`. Any older CDP probe asserting `document.querySelector(".dark")` to prove the
editor mounted now finds nothing and reports a false failure; use `.editor-scope`. Two more
theme-era probes worth reusing: `document.documentElement.getAttribute("data-theme")` is the live
theme, and a walk over every element parsing `getComputedStyle(el).backgroundColor` for anything
opaque-and-dark while a LIGHT theme is active is the cheapest way to find a colour that did not
follow the theme — it caught three real bugs in #328 that a build and a boot both passed.

**s221 additions (2026-08-30, tag pill editor) — two silent probe lies, both in brand-new code:**

58. **A button wired to `onMouseDown` is invisible to `.click()`.** The Queue's tag/caption Cancel buttons and `TagInput`'s pill ✕ / Clear all all use `onMouseDown={e => e.preventDefault()}` **deliberately** — that is how the app stops a click from blurring the field into a save. `.click()` dispatches click only, never mousedown, so the handler never runs and the probe reports "clicked" while nothing happens. Grep the JSX for how a button is wired before concluding it is broken; drive these with `Input.dispatchMouseEvent` press+release at real coordinates. Corollary: a control that deliberately avoids blur means the feature is blur-sensitive — test the blur path too. (Sharper, recurring case of gotcha 15.)

59. **Never send `keyDown`-with-`text` AND a separate `type:'char'` event — it types everything twice and defeats `preventDefault`.** A driver doing both produced `zzzzzztteesstt` for `zzztest` and left a literal `,` in a field whose keydown handler called `preventDefault()` to commit a tag instead — reading exactly like "comma doesn't commit", a fake bug in code written minutes earlier. Correct sequence is `keyDown` with `text`/`unmodifiedText` set, then `keyUp`, nothing else: the handler fires and the insertion happens as one unit, so `preventDefault()` suppresses the character like a real keypress. Sanity-check any new input driver against a known-good field before trusting a negative result.

**s222 addition (2026-08-30, react-shows drive):**

60. **Text-matching clicks lie three ways at once — substring hits, hidden-pane matches, and wrong layout assumptions.** A `/back/i` matcher clicked "Feed**back**"; an exact-text "Settings" matcher hit a non-fronted pane's element while the editor was full-window; and ten blind probes assumed a left sidebar when the nav is a BOTTOM bar. One `Page.captureScreenshot` resolved all of it instantly (re-confirms the s109 screenshot-first trap). Rules: match whole words (`/^settings$/i` on trimmed text), filter candidates by visibility AND position (`getBoundingClientRect()` non-zero + the region you believe it's in), and after ONE click that doesn't change `document.body.innerText`, screenshot before probing again — layout beats inference.

**s225 additions (2026-08-31, #346 verification):**

61. **Python's `websocket-client` must connect with `suppress_origin=True`** — Electron 40's CDP rejects the default `Origin: http://127.0.0.1:9222` header with 403 "use --remote-allow-origins". Node's global WebSocket sends no Origin, which is why the node drivers never hit this.

62. **After ANY version bump, the boot What's-New modal covers the whole app and swallows every real-coordinate click** — probes "succeed" (element found, click dispatched) while nothing changes and `document.querySelectorAll('h2')` filtered by visibility returns []. Dismiss via its "Got it" button before driving anything. (Sharper form of the s223 note: it blocks ALL trusted input, not just modal queries.)

**s228 additions (2026-09-01, #349 per-section layouts — full editor drive via fiber props):**

63. **The cleanest editor entry points are WaveformTrack's PROPS, read off the fiber tree, not DOM gestures.** Each section block's fiber carries `nleSegment`, `onSeekClick(clientX)` (seek by clicking a fraction of the block's rect), `onSelect()` (select the section lane), `onTrimRight(id, newEnd)`/`onTrimStart`/`onTrimEnd`. Walk fibers for `memoizedProps.nleSegment && onSeekClick` — but DEDUPE by segment id: `React.memo` components show up twice (wrapper + inner both carry `memoizedProps`), so a count-based check like `segs.length >= 2` passes on ONE section. Sort by `getBoundingClientRect().left` for timeline order. Same walk finds `onOpenInEditor(projectId, clipId)` on a mounted list component straight from the boot screen — no tab navigation needed.
64. **Split follows the SELECTED lane, and with a subtitle under the playhead it splits the subtitle.** `handleSplit` auto-picks sub → audio → cap when nothing is selected, so on a transcribed clip the scissors button / `U` cut a subtitle block and the section count never changes. Call the section's `onSelect()` first. The synthetic `KeyboardEvent("keydown",{key:"u"})` on body/window did NOT fire the shortcut at all; the scissors `<button>` (`svg.lucide-scissors` → `closest("button")`) does.
65. **`thumbnail:capture` writes every call for a clip to the SAME file** (`<outputFolder>/<project name>/<title>_thumbnail_<id4>.png`), and renders land in `<outputFolder>/<project name>/` too — a poller on the flat output folder never sees them. Copy each thumbnail out before the next capture, and poll the project subfolder.
66. **`ws` IS resolvable from the repo on this machine — it lives in `C:\Users\IAmAbsolute\node_modules\ws` (a user-level install), not in the repo's `node_modules`.** `require.resolve("ws")` from the repo cwd finds it; a script in the scratchpad must require it by that absolute path (gotcha 14's "none anywhere" was about the repo tree).
67. Reconfirmed gotcha 53 the hard way: `window.clipflow.reframeDetect = fn` silently does nothing (frozen bridge), so an "arguments captured" probe returns null and looks like the feature never called the IPC. Prove IPC arguments from the MAIN side (`[ReframeDetect] sampling … across N range(s)` in a stdout-captured boot), never from a page-side wrapper.

**Headless render harness (faster than any UI path for FFmpeg-arg changes):** `renderClip` from
`src/main/render.js` can be called directly with a hand-built `clipData`/`projectData` — pass no
subtitle/caption segments and it never opens an overlay window. It needs `electron` for
`app.isPackaged`, so run the harness as `npx electron harness.js` with an empty
`app.on("window-all-closed")` and `app.quit()` in a `finally`. The logged `[Render] FFmpeg args:`
line is the assertion.

Queue-tab fixture recipe (session 247, 2026-09-10, #383 verification):

20. **The dev profile's `projectsRoot` is the REAL projects folder** (`W:\...\Vertical Recordings Onwards`) — any Queue/card save from the dev app writes Fega's real project JSON while the daily driver is running. Before testing a save path: set dev `projectsRoot` to a scratch root holding `.clipflow/projects/<id>/project.json` (a COPY of a zero-approved project, per the fixture rule), and restore it after. Stash the original under a `_backupProjectsRoot` key so the restore is mechanical.
21. **A clip reaches the Queue only with `status: "approved"` AND `renderStatus: "rendered"`** (App.js `allClips` filters on renderStatus; `renderPath` can be a placeholder). Flipping status alone shows "0 clips ready".
22. **Caption cards (and anything inside the per-platform block) render only with connected accounts.** Dev tokens are `{"accounts":{}}` by rule; seed placeholder entries `{platform, displayName, accessToken:"", refreshToken:""}` (Instagram needs `igAccountId`) — `getAccountsForUI` never decrypts, the dev scheduler is off (#376), and nothing is clicked that posts. Restore to `{"accounts":{}}` after.
23. **Preload API names:** `window.clipflow.projectList()` (not projectsList). The row "Schedule" button opens a picker whose default is already filled; `Save Schedule` commits with no inputs to set.

One trap from session 256 (2026-09-13, #409 verification):
43. **`taskkill //F //IM electron.exe` now kills DaVinci Resolve's Epidemic Sound plugin too** — it runs as five `electron.exe` processes from `D:\DaVinci Resolve\Electron\`. Kill the dev app by PID: `Get-CimInstance Win32_Process -Filter "name='electron.exe'"` filtered on a CommandLine containing `Desktop\ClipFlow`, and `tr -d '\r'` the PowerShell output before looping `taskkill //F //PID`. Memory's "source runs only" line for the //IM form is no longer true on this machine.

Session 259 (2026-09-16, Layout drawer density verification):

68. **Electron's page target has no `Browser.getWindowForTarget` / `Browser.setWindowBounds`** (also absent on the `/json/version` browser socket) — you cannot resize the real window over CDP without `--inspect` on main. To verify a layout at a bigger window, `Emulation.setDeviceMetricsOverride {width, height, deviceScaleFactor:1, mobile:false}` on the page: layout reflows, `innerWidth/innerHeight` report the emulated size, `Page.captureScreenshot` captures it; `Emulation.clearDeviceMetricsOverride` restores. The drawer's resize handle (`.cursor-ew-resize`) is driven by dispatching `pointerdown` on it and `pointermove`/`pointerup` on `window` with a clientX delta (dragging left = wider).
69. **Reaching the editor from a fresh dev boot by DOM:** dismiss the what's-new modal ("Got it" button — it eats the first click), click the `Projects` nav button, click the ancestor with `cursor: pointer` of the project-name leaf, then the `Open in Editor` button inside the clip card (walk up from the `Clip N` leaf), then the rail button whose text is exactly `Layout`. The Rename tab stays mounted, so a bare `querySelectorAll('button')` lists its buttons first. Reusable driver: session-259 scratchpad `drive.js` (nav / measure / drawer / shot / cancel / eval).

Session 263 (2026-09-17, #434-#437 verification):

70. **A drag driver killed mid-gesture leaves the button HELD.** `timeout 25 node d.js drag …` cut between `mousePressed` and `mouseReleased` leaves the page's `dragging=true` with the previous drag's ref; later drags then cover partial distances and write to the PREVIOUS target (an "All subtitles" drag moved one line). Tell = partial distances. Drive drags through `execFileSync` with its own timeout (`seq.js`), and relaunch + replay before debugging product code.
71. **Title/caption AI calls can be faked for free from the main process** (`--inspect=9229`): `ipcMain.removeHandler("anthropic:generate")` + a delayed fake handler (also `anthropic:regenerateOption` / `anthropic:rephraseOption`), with `global.__stub = {delay, calls}` to vary the delay and count calls. Lets clip-switch-mid-generation races be staged deterministically. Saved cards can be seeded on a fixture clip as `clip.suggestions = {titles:[{title,why}], captions:[{caption,why}], …}` — the editor shows them with no call at all.
72. **Find-by-text returns the OUTERMOST one-child wrapper first** — pick the smallest match (`sort` by `textContent.length`) before walking up to "its card". Session-263 scratchpad (`e2e3c610…`): `d.js`, `seq.js` (switch/drag/undo steps), `walk.js`, `scope.js`, `switch-clip.js`, `repro437.js`, `test436.js`/`test436b.js`, `stub-main.js`, `fx-setup.js` (`--restore`), `fx-ai.js`, `repoint.js`.

Session 264 (2026-09-17, #438 publish-arbitration verification):

73. **A fixture project's folder AND id must start with `proj_`.** `listProjects` (projects.js:177) only reads `proj_*` directories, so a fixture at `.clipflow/projects/fx438proj/` loaded zero projects while `projectsRoot` pointed at it correctly. Only the `projectList()` proof-before-looking step caught it.
74. **Correction to 41: on this build `process.mainModule` is NOT main.js** (`require('./publish')` threw "Cannot find module ... Require stack: electron"). Working pattern: `const M = process.getBuiltinModule("module"); const req = M.createRequire("C:/Users/IAmAbsolute/Desktop/ClipFlow/src/main/main.js")` (forward slashes; typed backslashes collapse through the heredoc). Then ASSERT `M._cache[req.resolve("./x")]` exists BEFORE `req("./x")`. A miss loads a FRESH copy whose in-memory state (a registry, a cache) is separate from the app's, and every probe then passes against an empty copy. To emulate a main-to-renderer event: find the window whose `webContents.getURL()` contains index.html and call `webContents.send(channel, payload)`.
75. **Proving an IPC path ran: spy on the module export, not the renderer.** Handlers that call `mod.fn()` by property lookup pick up a patched export (same mechanism as 41). s264 proved the Queue's claim went begin (true), then end, with owner = the window's webContents id, then restored the originals from a `global.__spy.orig` stash. For sub-frame flashes, observe RAW MutationObserver records, not a find-by-text re-query: the old code's Failed-to-Queued flash lasted 4-5 ms, which was invisible on screen and to row lookups, but real. Scratchpad `4370c7ea...`: fx-setup.js (--restore), drv.js, mprelude.js + mrun.sh, rows.js, t3click.js, t3raw.js, shot.js.

**s265 additions (2026-09-18, #442-#444 Layout drawer verification):**

76. **Open a clip in the editor without navigating the UI:** walk the React fiber tree from `#root`'s `__reactContainer$` key (child/sibling stack) to the first fiber whose `memoizedProps.onOpenInEditor` is a function, and call it with `(projectId, clipId)`. Faster and less brittle than clicking the Projects tab → project → Open in Editor. Also handy: a `window.__t` helper object installed by one eval (drawer lookup, rail button by position, state dump) and reused by later evals in the same page.
77. **Light-theme checks need no settings change:** `document.documentElement.setAttribute("data-theme", "daylight" | "blush")` restyles the running app at once (all colours are CSS variables). Screenshot, then kill the app; nothing persists.
78. **A fresh build's first boot opens the What's New dialog over the whole window.** DOM probes and `.click()` still work underneath it, but every screenshot shows the dialog. Click its single "Got it" (assert exactly one match) before the first screenshot. Also: a bare `node -e` https GET/HEAD keeps the process alive on keep-alive sockets and hangs the Bash call — `process.exit()` in the callback, or wrap it in `timeout`.

**s266 addition (2026-09-18, #446/#447 verification):**

79. **Kill the dev app as ONE tree:** find its main process (`electron.exe` whose CommandLine contains `Desktop\ClipFlow` and NOT `--type=`) and run `taskkill //F //T //PID <pid>`. Leaves DaVinci's electron and `Corva.exe` alone (trap 43). Also: since #446, render thumbnails are `<clipId>_<timestamp>_renderthumb.jpg`, a new name per render, so a probe waiting on the old fixed `<clipId>_renderthumb.jpg` never sees one; read `clip.thumbnailPath` from disk instead. Chromium serves the first image it loaded for a file URL for the whole session, so overwriting a file in place never shows on screen.

**s267 additions (2026-09-18, #448 screenshot verification):**

80. **A dev boot lists TWO page targets, `splash.html` and `index.html`. Pick the `index.html` one** or evals and screenshots land on the splash. At 1280×860 the bottom nav has moved: the Projects tab is at (513,830), not trap 12's (461,841). The Media library lives under `projectsRoot` (`libraryRoot()`), so a fixture projectsRoot sandboxes Media tab imports too. Dev `audioFolders` still get scanned read-only into the fixture's assets.json. For a watched-folder test, add `mediaFolders: [{path, enabled: true, gameTag}]` to the dev settings and restore it afterwards. The screenshot message auto-closes 8 s after the mouse leaves, so a driver clicks its buttons in the same command as the capture; a trusted click leaves the pointer over it, which keeps it open. Render functions (`captureSourceRegion`, `cropImage`, `renderThumbnail`) run directly from an `npx electron harness.js` with the window-all-closed guard (trap 2). Scratchpad `9c5254b6...`: cdp.js (eval/shot/click/move/drag/key), harness448.js, fixture-setup.js / fixture-media.js / fixture-restore.js. Note: this session killed with `//IM electron.exe` rather than trap 79's tree kill. No DaVinci electron was running (checked with tasklist first), but use 79.

81. **Rename-tab tests (s268, #449): repoint the dev `watchFolder` at a scratch dir, blank `testWatchFolder`, and copy a tiny ffmpeg `testsrc` mp4 in under OBS names, in whatever order the test needs.** Each copy lands in Pending about 3 s later, so arrival order is fully controlled. A restart then gives a boot rescan of everything at once. Two traps:
    - **Blanking `geminiApiKey` does NOT stop the #263 AI frame sniff.** The Cloudflare gateway holds the key (BYOK), so every unstamped file is still sent to Gemini (cheap, but real). It labelled a colour-bar test pattern "Meccha Chameleon" with high confidence and retagged the row mid-test.
    - **Pre-stamping `detectedGames` for files that do not exist yet is useless.** Boot sweeps stamps for paths missing on disk (main.js ~715). Expect retags, or read the dev app.log for `#263 frame sniff result` before trusting a game label.

    Driver: s268 scratchpad `fx449-drive.js` (rows / drop / ptplus / setgame). MiniSpinbox steps on `mousedown`, not click. The What's New dialog is also a fixed z-index 1000 div, so scope any menu lookup to `parentElement === document.body`.

82. **A dev-profile test that can RENDER must repoint three folders, not one (s270). This corrects #27: `outputFolder` is NOT isolated anymore.** The dev settings point `outputFolder` at the real `W:\...\Downloaded Clips\ClipFlow Renders`. A `testMode` project renders to `testWatchFolder\Corva Renders` instead (`resolveTestAwareOutputFolder`, main.js ~4699), and dev `testWatchFolder` is the real `Test Footage\2026-10`. The dev `watchFolder` is the real Recordings folder too, so the dev Rename tab lists real pending files: never click Rename there. Recipe: s270 scratchpad `fx451/` (`setup.js` repoints `projectsRoot`, then `outputFolder` and `testWatchFolder` get repointed before any render; `restore.js` puts the settings file back byte for byte). Afterwards, `find` the real folders for the fixture's names. The same folder has `drv.js` (evaluate on 9222 renderer / 9229 main), `patch-load.js` (wraps `HTMLMediaElement.prototype.load` and logs tagged `__probe` elements: the proof an unmount unload ran) and `main-dialog.js` (patches `dialog.showOpenDialog` in main to return a fixture path, so "Recalibrate…" and other file pickers open without a native dialog).

83. **Click by element after anything repopulates a list (s285).** After a renderer reload I coordinate-clicked "Refresh" from a screenshot of an empty Rename list; the watcher re-added three files in between, the header grew its Rename button, and the click renamed them (scratch copies, undone). After a reload or Refresh, find the control by text/title and `.click()` it, or re-screenshot right before the click. Also: a reload empties Rename's pending list until the watcher restarts (press Refresh).
84. **Opening a never-opened clip in the editor WRITES project.json, with no edits (s285).** The editor materialises the clip's editor state (subtitle segments, styles, caption) on first open. Snapshot `project.json` before any dev-profile editor open, then restore with the app closed and compare the hash.
