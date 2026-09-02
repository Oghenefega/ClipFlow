// Chunker variants scored two ways: exact pill reproduction AND boundary P/R/F1 at word junctions.
//   node chunk_exp2.js <scratchpad>
const fs=require("fs"),path=require("path"),vm=require("vm");const S=process.argv[2];
const U="C:/Users/IAmAbsolute/Desktop/ClipFlow/src/renderer/editor/utils";
const auto=JSON.parse(fs.readFileSync(path.join(S,process.argv[3]||"auto_repro.json"),"utf8"));
const clips=Object.fromEntries(JSON.parse(fs.readFileSync(path.join(S,"approved_clips.json"),"utf8")).map(c=>[c.clipId,c]));
const norm=w=>(w||"").toLowerCase().replace(/\u2019/g,"'").replace(/[^a-z0-9']/g,"");
const baseSrc=fs.readFileSync(U+"/segmentWords.js","utf8");
function build(patch){ let src=patch(baseSrc); src=src.replace(/^export\s*\{[\s\S]*?\};?/mg,"").replace(/^export\s+(const|function|let|var)\s+/mg,"$1 ");
  src+="\nmodule.exports={segmentWords};"; const m={exports:{}}; vm.runInThisContext("(function(module,exports,require){"+src+"\n})")(m,m.exports,require); return m.exports.segmentWords; }
const addConn=(words)=>src=>src.replace('"can", "must", "might", "shall",','"can", "must", "might", "shall",'+words.map(w=>JSON.stringify(w)).join(",")+",");
const addFiller=(words)=>src=>src.replace('const FILLERS = new Set(["um", "uh", "ah"]);','const FILLERS = new Set(["um", "uh", "ah",'+words.map(w=>JSON.stringify(w)).join(",")+"]);");
// "starts a pill" = forward connector semantics (flush before it when chunk>=2). "isolated" = filler semantics.
const VOC=["man","bro","dude","guys","bruh"]; const INTJ=["oh","okay","ok","wow","wait","look","yo","yeah","no","yes","god","jesus","goodness","damn","nah","hey","whoa","woah"];
const POSS=["my","your","his","her","our","their"]; const PRON=["he","she","we","they","you","it"];
const variants={
  baseline:s=>s,
  old_chunker:s=>s.split('const FILLERS = new Set(["um", "uh", "ah", "man", "bro", "dude", "guys", "bruh"]);').join('const FILLERS = new Set(["um", "uh", "ah"]);').split('const FORWARD_LOOK_GAP = 0.4;').join('const FORWARD_LOOK_GAP = 0.5;'),
  vocatives_isolated:addFiller(VOC),
  vocatives_start:addConn(VOC),
  intj_isolated:addFiller(INTJ),
  intj_start:addConn(INTJ),
  voc_iso_intj_start:s=>addConn(INTJ)(addFiller(VOC)(s)),
  possessives_start:addConn(POSS),
  pronouns_start:addConn(PRON),
  what_start:addConn(["what"]),
  maxchars16:s=>s.replace("const MAX_CHARS = 20;","const MAX_CHARS = 16;"),
  maxchars24:s=>s.replace("const MAX_CHARS = 20;","const MAX_CHARS = 24;"),
  forwardlook04:s=>s.replace("const FORWARD_LOOK_GAP = 0.5;","const FORWARD_LOOK_GAP = 0.4;"),
  forwardlook03:s=>s.replace("const FORWARD_LOOK_GAP = 0.5;","const FORWARD_LOOK_GAP = 0.3;"),
  forwardlook_any_chunk:s=>s.replace("if (chunk.length >= 2 && gapAfter >= FORWARD_LOOK_GAP)","if (chunk.length >= 1 && gapAfter >= FORWARD_LOOK_GAP)"),
  pause_split_06:s=>s.replace("const PAUSE_SPLIT_THRESHOLD = 0.7;","const PAUSE_SPLIT_THRESHOLD = 0.6;"),
  no_atomic:s=>s.replace("if (ATOMIC_PHRASES.has(pair)) {","if (false) {"),
  combo_voc_intj_fl04:s=>addConn(INTJ)(addFiller(VOC)(s)).replace("const FORWARD_LOOK_GAP = 0.5;","const FORWARD_LOOK_GAP = 0.4;"),
  combo_voc_fl04:s=>addFiller(VOC)(s).replace("const FORWARD_LOOK_GAP = 0.5;","const FORWARD_LOOK_GAP = 0.4;"),
  no_known_phrase:s=>s.replace("if (knownPhrases.has(upcoming.join(\" \"))) {","if (false) {").replace("if (knownPhrases.has(chunkPhrase)) {","if (false) {"),
};
function lcsPairs(F,A){ // difflib-like: longest common subsequence alignment of normalized words
  const n=F.length,m=A.length; const dp=Array.from({length:n+1},()=>new Int16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--) dp[i][j]=F[i].t===A[j].t&&Math.abs(F[i].start-A[j].start)<2?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const pairs=[];let i=0,j=0;while(i<n&&j<m){ if(F[i].t===A[j].t&&Math.abs(F[i].start-A[j].start)<2){pairs.push([i,j]);i++;j++;} else if(dp[i+1][j]>=dp[i][j+1]) i++; else j++; } return pairs; }
for(const [name,patch] of Object.entries(variants)){ const seg=build(patch); let fegaSegs=0,exact=0,tp=0,fp=0,fn=0,tn=0;
  for(const a of auto){ const c=clips[a.clipId]; const segs=seg(a.cleanedWords,"3word");
    const A=[];segs.forEach((s,pi)=>s.words.forEach(w=>A.push({t:norm(w.word),start:w.start,pill:pi})));
    const F=[];c.sub1.forEach((s,pi)=>(s.words||[]).forEach(w=>F.push({t:norm(w.word),start:w.start,pill:pi})));
    const pairs=lcsPairs(F,A); const pm=new Map(pairs);
    for(let pi=0;pi<c.sub1.length;pi++){ const fw=F.map((w,i)=>w.pill===pi?i:-1).filter(i=>i>=0); if(!fw.length) continue; if(!fw.every(i=>pm.has(i))) continue; fegaSegs++;
      const ap=new Set(fw.map(i=>A[pm.get(i)].pill)); if(ap.size===1 && A.filter(w=>ap.has(w.pill)).length===fw.length) exact++; }
    for(let k=0;k<pairs.length-1;k++){ const [fi,ai]=pairs[k],[fj,aj]=pairs[k+1]; if(fj!==fi+1||aj!==ai+1) continue; const f=F[fi].pill!==F[fj].pill, g=A[ai].pill!==A[aj].pill; if(f&&g)tp++; else if(g)fp++; else if(f)fn++; else tn++; } }
  const P=tp/(tp+fp),R=tp/(tp+fn),F1=2*P*R/(P+R);
  console.log(name.padEnd(22),"exact",(100*exact/fegaSegs).toFixed(1)+"%",`(${exact}/${fegaSegs})`,"boundary P",(100*P).toFixed(1),"R",(100*R).toFixed(1),"F1",(100*F1).toFixed(1),"fega-split",fn,"fega-merge",fp); }
