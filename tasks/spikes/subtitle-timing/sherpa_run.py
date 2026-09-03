"""sherpa-onnx (Apache-2.0) transcription with token timestamps from NVIDIA NeMo models (CC-BY-4.0).
Not forced alignment: the model transcribes freely, words are matched to Fega's by text later.
  python sherpa_run.py <scratch> parakeet|fcctc"""
import json, os, sys, time
import numpy as np, soundfile as sf, sherpa_onnx
S, KIND = sys.argv[1], sys.argv[2]
R = r"D:\whisper\sherpa-models"
if KIND == "parakeet":
    d = os.path.join(R, "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-fp16")
    rec = sherpa_onnx.OfflineRecognizer.from_transducer(encoder=os.path.join(d, "encoder.fp16.onnx"), decoder=os.path.join(d, "decoder.fp16.onnx"),
          joiner=os.path.join(d, "joiner.fp16.onnx"), tokens=os.path.join(d, "tokens.txt"), model_type="nemo_transducer", num_threads=8)
else:
    d = os.path.join(R, "sherpa-onnx-nemo-fast-conformer-ctc-en-24500")
    rec = sherpa_onnx.OfflineRecognizer.from_nemo_ctc(model=os.path.join(d, "model.onnx"), tokens=os.path.join(d, "tokens.txt"), num_threads=8)
out_dir = os.path.join(S, "align", KIND); os.makedirs(out_dir, exist_ok=True)
clips = [c for c in json.load(open(os.path.join(S, "approved_clips.json"), encoding="utf-8")) if c["clipTranscription"] and c["sub1"]]
done = 0; t1 = time.time()
SP = "\u2581"
for c in clips:
    cid = c["clipId"]; p = os.path.join(out_dir, cid + ".json")
    if os.path.exists(p): continue
    samples, sr = sf.read(os.path.join(S, "audio", cid + ".wav"), dtype="float32")
    s = rec.create_stream(); s.accept_waveform(sr, samples); rec.decode_stream(s)
    toks, ts = s.result.tokens, s.result.timestamps
    words = []
    for t, tm in zip(toks, ts):
        if t.startswith(SP) or t.startswith(" ") or not words:
            words.append({"word": t.lstrip(SP + " "), "start": float(tm), "end": float(tm)})
        else:
            words[-1]["word"] += t; words[-1]["end"] = float(tm)
    words = [w for w in words if w["word"]]
    json.dump({"segments": [{"words": words}]}, open(p, "w", encoding="utf-8")); done += 1
    if done == 1: print("sample:", words[:8], "| text:", s.result.text[:80], flush=True)
print(f"{KIND}: done {done} in {time.time()-t1:.0f}s", flush=True)
