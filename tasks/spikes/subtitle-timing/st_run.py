"""stable-ts transcription (+refine) with a different Whisper backbone, as an independent voter.
  python st_run.py <scratch> <tag> <faster-whisper model name>"""
import json, os, sys, time, traceback
S, TAG, MODEL = sys.argv[1], sys.argv[2], sys.argv[3]
os.environ.setdefault("HF_HOME", r"D:\whisper\hf_cache")
import stable_whisper
PROMPT = "ain't, gonna, gotta, wanna, y'all, bro, nah, fam, dawg, bruh, tryna, finna, boutta, lowkey, highkey, deadass, bussin, sus, cap, no cap, lit, fire, bet, dope, vibe, salty, clutch, cracked, goated, mid, GG, OP, nerf, buff, AFK, respawn, aggro, ADS, headshot, one-shot, let's go, oh my god, what the, are you kidding me"
t0 = time.time(); model = stable_whisper.load_faster_whisper(MODEL, device="cuda", compute_type="float16")
print(f"{TAG}: {MODEL} loaded {time.time()-t0:.0f}s", flush=True)
out_dir = os.path.join(S, "align", TAG); os.makedirs(out_dir, exist_ok=True)
clips = [c for c in json.load(open(os.path.join(S, "approved_clips.json"), encoding="utf-8")) if c["clipTranscription"] and c["sub1"]]
done = 0; t1 = time.time()
for c in clips:
    cid = c["clipId"]; p = os.path.join(out_dir, cid + ".json")
    if os.path.exists(p): continue
    try:
        wav = os.path.join(S, "audio", cid + ".wav")
        r = model.transcribe(wav, language="en", condition_on_previous_text=False, initial_prompt=PROMPT)
        model.refine(wav, r, precision=0.05)
        segs = [{"start": s.start, "end": s.end, "text": s.text.strip(), "words": [{"word": w.word.strip(), "start": w.start, "end": w.end} for w in s.words]} for s in r.segments]
        json.dump({"segments": segs}, open(p, "w", encoding="utf-8")); done += 1
    except Exception as e:
        print("FAIL", cid, repr(e), flush=True); traceback.print_exc()
print(f"{TAG}: done {done} in {time.time()-t1:.0f}s", flush=True)
