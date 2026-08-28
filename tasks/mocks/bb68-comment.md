Re-confirmed still present by the session-85 packaged-app audit: `ai-pipeline.js:172` still spawns `D:\whisper\energy_scorer.py`, and the script is **not in the repo `tools/`** — so it wouldn't ship even with the #143 `extraResources` bundling that now covers `tools/transcribe.py` + `tools/signals/*`. Fix shape is the #143 pattern: move `energy_scorer.py` into `tools/`, resolve via `process.resourcesPath` when `app.isPackaged`.

Part of the Python/Whisper bundling family (#146 Python-runtime-not-bundled, #147 hfHome-hardcode). Tagging `track: launch-ops` to group it with that parked work.
