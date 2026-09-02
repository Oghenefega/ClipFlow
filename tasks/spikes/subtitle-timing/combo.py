"""Combine aligner opinions per word and score against Fega (both directions, by position).
  python combo.py <scratchpad>
Sources: raw stable-ts, whisperx, qwen, crisper dumps in align/<m>/. Each word of Fega's finals is
matched to its raw word and to each source's nearest same-text word (1.5 s window)."""
import json,sys,os,statistics as st
S=sys.argv[1]
SRC=["whisperx","qwen","crisper"]
clips={c["clipId"]:c for c in json.load(open(os.path.join(S,"approved_clips.json"),encoding="utf-8")) if c["clipTranscription"] and c["sub1"]}
def norm(w): return ''.join(ch for ch in (w or "").lower() if ch.isalnum() or ch=="'")
def words_of(segs): return sorted([w for s in segs for w in s.get("words",[]) if w.get("start") is not None],key=lambda w:w["start"])
def nearest(cands,word,t,win=1.5):
    cc=[x for x in cands if norm(x["word"])==norm(word) and abs(x["start"]-t)<win]
    return min(cc,key=lambda x:abs(x["start"]-t)) if cc else None
rows=[]
for cid,c in clips.items():
    off=c["startTime"]; raw=words_of(c["clipTranscription"]["segments"])
    src={}
    for m in SRC:
        p=os.path.join(S,"align",m,cid+".json"); src[m]=words_of(json.load(open(p,encoding="utf-8"))["segments"]) if os.path.exists(p) else []
    for seg in c["sub1"]:
        ws=seg.get("words") or []
        for j,w in enumerate(ws):
            fs=w["start"]-off; r=nearest(raw,w["word"],fs)
            if not r: continue
            row={"fega":fs,"raw":r["start"],"rawdur":r["end"]-r["start"],"pos":"single" if len(ws)==1 else "first" if j==0 else "last" if j==len(ws)-1 else "mid","d":fs-r["start"]}
            for m in SRC:
                x=nearest(src[m],w["word"],fs); row[m]=x["start"] if x else None
            rows.append(row)
# bias per source measured on untouched words
bias={m:st.median([r[m]-r["fega"] for r in rows if abs(r["d"])<=.05 and r[m] is not None]) for m in SRC}
print("bias (source - Fega, untouched median):",{m:round(b,3) for m,b in bias.items()})
def get(r,m): return None if r[m] is None else r[m]-bias[m]
def score(name,fn,quiet=False):
    cells={}; allE=[]
    for r in rows:
        v=fn(r); v=r["raw"] if v is None else v; e=v-r["fega"]; allE.append(e)
        dirn="later" if r["d"]>0.1 else "earlier" if r["d"]<-0.1 else "untouched" if abs(r["d"])<=0.05 else None
        if dirn: cells.setdefault(dirn,[]).append(e); cells.setdefault((r["pos"],dirn),[]).append(e)
    ok=lambda xs: sum(abs(e)<=.1 for e in xs)/max(1,len(xs))
    line=f"{name:70s} ALL={ok(allE):5.1%}  moved-later={ok(cells['later']):4.0%} moved-earlier={ok(cells['earlier']):4.0%} untouched-disturbed={1-ok(cells['untouched']):5.1%}"
    if not quiet: line+=" | single/first/mid/last moved: "+"/".join(f"{ok(cells.get((p,'later'),[])+cells.get((p,'earlier'),[])):.0%}" for p in ("single","first","mid","last"))
    print(line); return ok(allE)
def med(*xs):
    xs=[x for x in xs if x is not None]; return st.median(xs) if xs else None
score("raw",lambda r:r["raw"])
for m in SRC: score(f"{m} full replacement (bias-corrected)",lambda r,m=m:get(r,m))
print()
for m in ("whisperx","qwen"):
    for T in (0.1,0.15,0.2):
        score(f"{m} when |{m}-raw|>{T} else raw",lambda r,m=m,T=T:(get(r,m) if get(r,m) is not None and abs(get(r,m)-r["raw"])>T else r["raw"]))
print()
score("median(raw, whisperx, qwen)",lambda r:med(r["raw"],get(r,"whisperx"),get(r,"qwen")))
score("median(raw, whisperx, qwen) when it differs from raw by >0.1 else raw",lambda r:(lambda v:v if v is not None and abs(v-r["raw"])>0.1 else r["raw"])(med(r["raw"],get(r,"whisperx"),get(r,"qwen"))))
score("whisperx+qwen agree within 0.15 -> their mean; else raw",lambda r:((get(r,"whisperx")+get(r,"qwen"))/2 if get(r,"whisperx") is not None and get(r,"qwen") is not None and abs(get(r,"whisperx")-get(r,"qwen"))<=0.15 else r["raw"]))
score("wx+qwen agree within 0.15 AND both differ from raw by >0.15 -> mean; else raw",lambda r:((get(r,"whisperx")+get(r,"qwen"))/2 if get(r,"whisperx") is not None and get(r,"qwen") is not None and abs(get(r,"whisperx")-get(r,"qwen"))<=0.15 and abs(get(r,"whisperx")-r["raw"])>0.15 and abs(get(r,"qwen")-r["raw"])>0.15 else r["raw"]))
score("wx+qwen agree within 0.1 AND mean differs from raw by >0.1 -> mean; else raw",lambda r:((get(r,"whisperx")+get(r,"qwen"))/2 if get(r,"whisperx") is not None and get(r,"qwen") is not None and abs(get(r,"whisperx")-get(r,"qwen"))<=0.1 and abs((get(r,"whisperx")+get(r,"qwen"))/2-r["raw"])>0.1 else r["raw"]))
score("shipped-like: wx when |wx-raw|>0.15; PLUS qwen when |qwen-raw|>0.15 and wx missing",lambda r:(get(r,"whisperx") if get(r,"whisperx") is not None and abs(get(r,"whisperx")-r["raw"])>0.15 else (get(r,"qwen") if get(r,"whisperx") is None and get(r,"qwen") is not None and abs(get(r,"qwen")-r["raw"])>0.15 else r["raw"])))
score("wx when |wx-raw|>0.15 and qwen on the same side (sign agrees) else raw",lambda r:(get(r,"whisperx") if get(r,"whisperx") is not None and abs(get(r,"whisperx")-r["raw"])>0.15 and get(r,"qwen") is not None and (get(r,"qwen")-r["raw"])*(get(r,"whisperx")-r["raw"])>0 else r["raw"]))
print()
score("median(raw, whisperx, qwen, crisper) [crisper cannot ship]",lambda r:med(r["raw"],get(r,"whisperx"),get(r,"qwen"),get(r,"crisper")))
score("median(whisperx, qwen, crisper) [crisper cannot ship]",lambda r:med(get(r,"whisperx"),get(r,"qwen"),get(r,"crisper")))
# by raw duration: where does each rule help / hurt
print("\n-- moved words by raw duration bucket (n, share fixed by median-of-3):")
for lo,hi in ((0,0.12),(0.12,0.3),(0.3,0.5),(0.5,9)):
    sel=[r for r in rows if abs(r["d"])>0.1 and lo<=r["rawdur"]<hi]
    fixed=sum(abs(med(r["raw"],get(r,"whisperx"),get(r,"qwen"))-r["fega"])<=0.1 for r in sel if sel)
    print(f"   rawdur [{lo},{hi}) n={len(sel):3d} fixed={fixed/max(1,len(sel)):.0%}")
