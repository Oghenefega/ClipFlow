# HANDOFF — Session 169 (2026-08-15)

## Current State
App is still **0.3.0-alpha.50 — no installer cut this session** (session 3 needs one; see Next Steps). The **#146 zero-setup transcription arc is 2 of 3 sessions done**: both engines are LIVE on Cloudflare R2 behind `engine.flowve.app`, and the in-app **"Set up ClipFlow's AI engine"** flow is built, E2E-tested on the dev profile, and committed. Fega approved the screen design from the mockup ("phenomenal") after two iterations (logo instead of orb; logo-derived cyan/blue instead of AI-purple; grayscale logo when interrupted — his idea).

## What Was Just Built
- **Hosting (Part A):** `clipflow-engine` R2 bucket (ClipFlow business CF account) with custom domain `engine.flowve.app`. Layout: `engine/manifest.json` (version, per-variant url/sha256/sizeBytes/unpackedBytes) + `engine/v1.0.0/<zips>`. `scripts/publish-runtime.ps1` = repeatable publish (skip-if-uploaded, manifest rebuild, public-URL verify incl. Range/206 + optional `-DeepVerify` full CPU-zip hash — all passed). Upload creds: `C:\Users\IAmAbsolute\.claude\r2_credentials.txt` (+ Fega's copy in Documents\Personally Stuffy Documents); rclone (winget) with an `[r2]` remote in `%APPDATA%\rclone\rclone.conf`.
- **In-app flow (Part B):**
  - `src/main/setup-runtime.js` — GPU probe (nvidia-smi, System32 fallback), manifest fetch, disk preflight (zip+unpacked+1.8GB model reserve+0.5GB margin), download to `userData\runtime\.download\*.part` with Range resume + streamed SHA-256 (resume re-hashes existing bytes first), unpack via System32 tar.exe → `.staging` → rename to `runtime\engine-<variant>-v<ver>`, verify via existing `whisper.checkWhisper()` probe, sets `whisperPythonPath` + new `engineRuntime` store key, deletes zip, then model pre-download. Retry re-enters at the model phase if the engine is already valid.
  - `tools/download_model.py` — faster_whisper download_model + HfApi size estimate + cache-dir poller printing `TOTAL/PROGRESS/DONE` lines (rides the tools/ extraResources glob).
  - IPC `setup:getState/start/cancel` + `setup:progress` events (main.js), preload bridge (`setupGetState/Start/Cancel/onSetupProgress`).
  - `src/renderer/components/EngineSetupView.js` — the approved design (cyan/blue palette consts, breathing glow, grey drain on interrupt); mounts in App.js after onboarding; "Set up later" + "Hide — keep downloading in background" both work (download lives in main).
  - DependencyBanner: **Finish Setup** button on the whisper-python issue; banner remounts (key flip) when setup completes so the issue clears itself.
  - Error copy repointed at Finish Setup in deps-check.js, stable-ts.js PYTHON_SETUP_ERROR, ai-pipeline.js energy-stage duplicate. The "Beta Tester Manual" pointer is dead (it never resolved to anything).

## E2E Evidence (dev profile, this machine)
Full run: overlay → real 2.73 GB R2 download (~100 MB/s) → kill-mid-download at 1.2 GB → relaunch offered **Resume** → resumed, **checksum passed over old+new bytes** → unpack → probe verified (stable-ts 2.19.1 CUDA, torch 2.7.1+cu126) → real 1.6 GB model download with live progress → done screen → banner clean → **real 40-segment transcription through the downloaded engine**. Regression: pinned-D:\ profile boots with no overlay, no banner issue. Dev profile fully restored afterward (D:\ venv + D:\ hf_cache, engine + test cache deleted, ~7 GB reclaimed on C:).

## Key Decisions / Discoveries
- **clipflow.app is NOT Fega's domain** — third-party GoDaddy-parked (reg. Jan 2025). ClipFlow's web home is `flowve.app/clipflow` (Cloudflare, same account as gateway/R2). Filed **#255** (launch-ops): verify/decide domain strategy. **Infra dashboard H4 says "hosting will be on clipflow.app" — invalidated, needs a dashboard edit.** Memory saved (`project_clipflow_domain.md`).
- Engine URL is `engine.flowve.app` (custom domain, not rate-limited r2.dev) — fine for launch too.
- Design lesson saved to `feedback_ui_density_aesthetic`: brand-hero moments use the mark's cyan/blue, never the theme violet; no state-colored glows behind the logo; grayscale = paused.
- Bug found live + fixed + distilled into `clipflow-electron-ipc` skill: overlay closed early once `whisperPythonPath` was set mid-flow (unstable parent callback re-fired the state probe). Fix: `getState` reports the ACTIVE job separately from `needed`; view parks `onClose` in a ref.

## Next Steps (session 3 of the arc — the laptop)
1. Cut an installer (this is alpha.51 material — batch rule satisfied; use `clipflow-update-launcher`). NOTE: Fega's alpha.50 ember sign-off from session 167 is still pending — check before bumping.
2. Laptop first boot = the true zero-setup customer test: onboarding → engine setup (likely CPU variant unless the laptop has NVIDIA) → first transcription. Confirm HF_HOME reaches transcribe.py on every spawn path (transcribe.py still has the harmless `setdefault("HF_HOME", "D:\\whisper\\hf_cache")` ~line 27).
3. Failure-mode pass: offline mid-download (airplane mode), disk full, corrupt unpack, AMD/no-GPU → CPU variant + slower-warning copy.
4. Consider surfacing engine download progress somewhere ambient when hidden (banner currently static "Finish Setup") — only if Fega asks.

## Watch Out For
- **Vite build warning** about >500 kB chunks is pre-existing, not from this session.
- `setup:start` invoked while a job runs returns `{success:false, error:"Setup is already running."}` — the UI never does this, but future callers might.
- Cancel during the model phase kills python mid-download; HF hub resumes its own partials fine on retry.
- SettingsView caches `whisperPythonPath` in state at mount — after an in-session engine install, the Settings display is stale until app restart (cosmetic; tabs are always-mounted). Not worth fixing unless Fega notices.
- The publish script requires the per-variant manifests in `vendor/runtime-dist/` (git-ignored) — a fresh clone must rerun `build-runtime.ps1` before it can publish new versions.

## Logs/Debugging
- Dev-profile E2E driven via CDP on :9222 — driver script pattern in this session's scratchpad (`cdp.js`: text/click/eval via Node 22 global WebSocket; taskkill needs `MSYS_NO_PATHCONV=1` under Git Bash).
- Engine setup logs: `(system) Engine runtime verified` / `Engine setup complete` in `%APPDATA%\clipflow-dev\logs\app.log` (2026-08-15 03:25–03:26 for the first full run).
- R2 upload log: rclone `Multi-thread Copied` both zips @ ~103 MiB/s (session task bc8ckra9u).
