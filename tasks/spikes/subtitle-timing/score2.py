import json,sys,os,statistics as st
S=sys.argv[1]; methods=sys.argv[2].split(",")
clips={c["clipId"]:c for c in json.load(open(os.path.join(S,"approved_clips.json"),encoding="utf-8")) if c["clipTranscription"] and c["sub1"]}
def norm(w): return ''.join(ch for ch in (w or "").lower() if ch.isalnum() or ch=="'")
def words_of(segs): return sorted([w for s in segs for w in s.get("words",[]) if w.get("start") is not None],key=lambda w:w["start"])
def f(xs):
    ax=[abs(x) for x in xs]; return f"n={len(xs):4d} med={st.median(ax):.3f} <=100ms={sum(1 for x in ax if x<=0.1)/len(xs):5.1%} >100ms={sum(1 for x in ax if x>0.1)/len(xs):5.1%}"
for m in ["raw"]+methods:
    err={"firstMoved":[], "firstUntouched":[], "otherMoved":[], "otherUntouched":[], "all":[]}; unmatched=0; bias=[]
    for cid,c in clips.items():
        off=c["startTime"]; raw=words_of(c["clipTranscription"]["segments"])
        if m=="raw": cand=raw
        else:
            p=os.path.join(S,"align",m,cid+".json")
            if not os.path.exists(p): continue
            cand=words_of(json.load(open(p,encoding="utf-8"))["segments"])
        for seg in c["sub1"]:
            for j,w in enumerate(seg.get("words") or []):
                fs=w["start"]-off
                rc=[r for r in raw if norm(r["word"])==norm(w["word"]) and abs(r["start"]-fs)<1.5]
                if not rc: continue
                r=min(rc,key=lambda r:abs(r["start"]-fs)); d=fs-r["start"]
                cc=[x for x in cand if norm(x["word"])==norm(w["word"]) and abs(x["start"]-fs)<1.5]
                if not cc: unmatched+=1; continue
                x=min(cc,key=lambda x:abs(x["start"]-fs)); e=x["start"]-fs
                err["all"].append(e); grp="Moved" if abs(d)>0.1 else ("Untouched" if abs(d)<=0.05 else None)
                if grp: err[("first" if j==0 else "other")+grp].append(e)
                if grp=="Untouched": bias.append(e)
    print(f"\n== {m}: unmatched={unmatched} bias on untouched median={(st.median(bias) if bias else 0):+.3f}")
    for k in err: print(f"  {k:15s} {f(err[k])}")
