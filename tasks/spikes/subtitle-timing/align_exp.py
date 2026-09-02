import json,sys,os,time,traceback
S=sys.argv[1]; METHODS=sys.argv[2].split(",")
os.environ.setdefault("HF_HOME", r"D:\whisper\hf_cache")
clips=[c for c in json.load(open(os.path.join(S,"approved_clips.json"),encoding="utf-8")) if c["clipTranscription"] and c["sub1"]]
log=open(os.path.join(S,"align","log.txt"),"a",encoding="utf-8")
def L(*a):
    print(*a,file=log,flush=True)
def dump(method,cid,segments):
    d=os.path.join(S,"align",method); os.makedirs(d,exist_ok=True)
    json.dump({"segments":segments},open(os.path.join(d,cid+".json"),"w",encoding="utf-8"))
def st_segs(result):
    out=[]
    for seg in result.segments:
        out.append({"start":seg.start,"end":seg.end,"text":seg.text.strip(),"words":[{"word":w.word.strip(),"start":w.start,"end":w.end,"probability":getattr(w,"probability",1.0)} for w in seg.words]})
    return out
PROMPT="ain't, gonna, gotta, wanna, y'all, bro, nah, fam, dawg, bruh, tryna, finna, boutta, lowkey, highkey, deadass, bussin, sus, cap, no cap, lit, fire, bet, dope, vibe, salty, clutch, cracked, goated, mid, GG, OP, nerf, buff, AFK, respawn, aggro, ADS, headshot, one-shot, let's go, oh my god, what the, are you kidding me"
import torch
dev="cuda" if torch.cuda.is_available() else "cpu"
model=None
if any(m.startswith("st_") for m in METHODS):
    import stable_whisper
    model=stable_whisper.load_faster_whisper("large-v3-turbo",device=dev,compute_type="float16")
    L("stable-ts model loaded")
if "whisperx" in METHODS:
    import whisperx
    amodel,ameta=whisperx.load_align_model(language_code="en",device=dev)
    L("whisperx align model loaded")
for n,c in enumerate(clips):
    cid=c["clipId"]; wav=os.path.join(S,"audio",cid+".wav")
    text=" ".join(s["text"].strip() for s in c["clipTranscription"]["segments"])
    for m in METHODS:
        outp=os.path.join(S,"align",m,cid+".json")
        if os.path.exists(outp): continue
        t=time.time()
        try:
            if m=="st_vad":
                r=model.transcribe(wav,language="en",condition_on_previous_text=False,initial_prompt=PROMPT,vad=True)
                model.refine(wav,r,precision=0.05); dump(m,cid,st_segs(r))
            elif m=="st_align":
                r=model.align(wav,text,language="en"); dump(m,cid,st_segs(r))
            elif m=="st_align_refine":
                r=model.align(wav,text,language="en"); model.refine(wav,r,precision=0.05); dump(m,cid,st_segs(r))
            elif m=="st_align_vad":
                r=model.align(wav,text,language="en",vad=True); dump(m,cid,st_segs(r))
            elif m=="st_default":
                r=model.transcribe(wav,language="en",condition_on_previous_text=False,initial_prompt=PROMPT)
                model.refine(wav,r,precision=0.05); dump(m,cid,st_segs(r))
            elif m=="st_adjust":
                r=model.transcribe(wav,language="en",condition_on_previous_text=False,initial_prompt=PROMPT)
                model.refine(wav,r,precision=0.05); r.adjust_by_silence(wav,vad=True,verbose=False); dump(m,cid,st_segs(r))
            elif m=="st_vad_adjust":
                r=model.transcribe(wav,language="en",condition_on_previous_text=False,initial_prompt=PROMPT,vad=True)
                model.refine(wav,r,precision=0.05); r.adjust_by_silence(wav,vad=True,verbose=False); dump(m,cid,st_segs(r))
            elif m=="st_norefine_vad":
                r=model.transcribe(wav,language="en",condition_on_previous_text=False,initial_prompt=PROMPT,vad=True); dump(m,cid,st_segs(r))
            elif m=="whisperx":
                audio=whisperx.load_audio(wav)
                segs=[{"text":s["text"],"start":s["start"],"end":s["end"]} for s in c["clipTranscription"]["segments"]]
                r=whisperx.align(segs,amodel,ameta,audio,dev,return_char_alignments=False)
                out=[{"start":s.get("start"),"end":s.get("end"),"text":s.get("text","").strip(),"words":[{"word":w["word"],"start":w.get("start"),"end":w.get("end"),"probability":w.get("score",1.0)} for w in s.get("words",[]) if "start" in w]} for s in r["segments"]]
                dump(m,cid,out)
            L(f"{n+1}/{len(clips)} {m} {cid} ok {time.time()-t:.1f}s")
        except Exception as e:
            L(f"{n+1}/{len(clips)} {m} {cid} FAIL {e}"); L(traceback.format_exc()[-800:])
L("DONE")
