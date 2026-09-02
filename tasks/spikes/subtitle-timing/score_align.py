import json,sys,os,statistics as st
from collections import Counter
S=sys.argv[1]; methods=sys.argv[2].split(",")
clips={c["clipId"]:c for c in json.load(open(os.path.join(S,"approved_clips.json"),encoding="utf-8")) if c["clipTranscription"] and c["sub1"]}
def norm(w): return ''.join(ch for ch in (w or "").lower() if ch.isalnum() or ch=="'")
def words_of(segs): return sorted([w for s in segs for w in s.get("words",[]) if w.get("start") is not None],key=lambda w:w["start"])
def fmt(xs):
    if not xs: return "n=0"
    ax=[abs(x) for x in xs]; return f"n={len(xs):4d} med|err|={st.median(ax):.3f} <=100ms={sum(1 for x in ax if x<=0.1)/len(xs):.0%} <=200ms={sum(1 for x in ax if x<=0.2)/len(xs):.0%} >100ms={sum(1 for x in ax if x>0.1)/len(xs):.0%}"
for m in ["raw"]+methods:
    res={"firstMoved":[], "firstUntouched":[], "otherMoved":[], "otherUntouched":[], "all":[], "endAll":[]}; nclips=0; unmatched=0; total=0
    for cid,c in clips.items():
        off=c["startTime"]
        raw=words_of(c["clipTranscription"]["segments"])
        if m=="raw": cand=raw
        else:
            p=os.path.join(S,"align",m,cid+".json")
            if not os.path.exists(p): continue
            cand=words_of(json.load(open(p,encoding="utf-8"))["segments"])
        nclips+=1
        for seg in c["sub1"]:
            ws=seg.get("words") or []
            for j,w in enumerate(ws):
                fs=w["start"]-off; fe=w["end"]-off
                rc=[r for r in raw if norm(r["word"])==norm(w["word"]) and abs(r["start"]-fs)<1.5]
                if not rc: continue
                r=min(rc,key=lambda r:abs(r["start"]-fs)); d=fs-r["start"]
                grp="Moved" if d>0.15 else ("Untouched" if abs(d)<=0.05 else None)
                total+=1
                cc=[x for x in cand if norm(x["word"])==norm(w["word"]) and abs(x["start"]-fs)<1.5]
                if not cc: unmatched+=1; continue
                x=min(cc,key=lambda x:abs(x["start"]-fs)); err=x["start"]-fs
                res["all"].append(err)
                if grp: res[("first" if j==0 else "other")+grp].append(err)
    print(f"\n== {m}: clips={nclips} words={total} unmatched={unmatched}")
    for k in ("firstMoved","firstUntouched","otherMoved","otherUntouched","all"): print(f"  {k:15s} {fmt(res[k])}")
