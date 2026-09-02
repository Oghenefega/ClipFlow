"""
Run Qwen3-ForcedAligner-0.6B (Apache-2.0) over every approved clip: align the stable-ts text
against the mic audio and dump per-clip word timings for score2.py.
  python qwen_run.py <scratchpad>   -> <scratchpad>/align/qwen/<clipId>.json
"""
import json, os, sys, time, traceback
S = sys.argv[1]
os.environ.setdefault("HF_HOME", r"D:\whisper\hf_cache")
out_dir = os.path.join(S, "align", "qwen"); os.makedirs(out_dir, exist_ok=True)
import torch
from qwen_asr import Qwen3ForcedAligner
t0 = time.time()
aligner = Qwen3ForcedAligner.from_pretrained("Qwen/Qwen3-ForcedAligner-0.6B", dtype=torch.bfloat16, device_map="cuda:0")
print(f"model loaded {time.time() - t0:.0f}s", flush=True)
clips = [c for c in json.load(open(os.path.join(S, "approved_clips.json"), encoding="utf-8")) if c["clipTranscription"] and c["sub1"]]
done = 0; t1 = time.time()
for c in clips:
    p = os.path.join(out_dir, c["clipId"] + ".json")
    if os.path.exists(p): continue
    wav = os.path.join(S, "audio", c["clipId"] + ".wav")
    text = " ".join((s.get("text") or "").strip() for s in c["clipTranscription"]["segments"]).strip()
    if not text: continue
    try:
        res = aligner.align(audio=wav, text=text, language="English")
        items = list(res[0]) if isinstance(res, list) else list(res)   # List[ForcedAlignResult]; items have .text/.start_time/.end_time
        words = [{"word": it.text, "start": float(it.start_time), "end": float(it.end_time)} for it in items]
        json.dump({"segments": [{"words": words}]}, open(p, "w", encoding="utf-8"))
        done += 1
        if done == 1: print("first result sample:", json.dumps(words[:5]), flush=True)
    except Exception as e:
        print("FAIL", c["clipId"], repr(e), flush=True); traceback.print_exc()
print(f"done {done} clips in {time.time() - t1:.0f}s ({(time.time() - t1) / max(1, done):.2f}s/clip)", flush=True)
