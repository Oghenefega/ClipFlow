# Vendored MediaPipe assets (#164 Phase B detection)

Copied from `@mediapipe/tasks-vision@0.10.35` (pinned exact in devDependencies)
so the packaged app never depends on node_modules or a CDN:

- `vision_bundle.mjs` — ESM bundle (loaded in detect.html via blob-URL dynamic import)
- `vision_wasm_internal.js` / `.wasm` — SIMD wasm pair (Chromium always has SIMD;
  the nosimd pair is deliberately not shipped)

`blaze_face_short_range.tflite` (~230KB) is NOT in the npm package. Source:
https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite

To re-vendor after a version bump: update the devDependency, copy the three
package files from `node_modules/@mediapipe/tasks-vision/` (+ wasm/), re-download
the model, and re-run the B1 verification (see tasks/spikes/164-phaseb-gate/).
