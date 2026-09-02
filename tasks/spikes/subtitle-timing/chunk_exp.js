const fs=require("fs"),path=require("path"),vm=require("vm");const S=process.argv[2];
const U="C:/Users/IAmAbsolute/Desktop/ClipFlow/src/renderer/editor/utils";
const auto=JSON.parse(fs.readFileSync(path.join(S,"auto_repro.json"),"utf8"));
const clips=Object.fromEntries(JSON.parse(fs.readFileSync(path.join(S,"approved_clips.json"),"utf8")).map(c=>[c.clipId,c]));
const norm=w=>(w||"").toLowerCase().replace(/[^a-z0-9']/g,"");
const baseSrc=fs.readFileSync(U+"/segmentWords.js","utf8");
function build(patch){ let src=patch(baseSrc); src=src.replace(/^export\s*\{[\s\S]*?\};?/mg,"").replace(/^export\s+(const|function|let|var)\s+/mg,"$1 ");
  src+="\nmodule.exports={segmentWords};"; const m={exports:{}}; vm.runInThisContext("(function(module,exports,require){"+src+"\n})")(m,m.exports,require); return m.exports.segmentWords; }
const addConn=(words)=>src=>src.replace('"can", "must", "might", "shall",','"can", "must", "might", "shall",'+words.map(w=>JSON.stringify(w)).join(",")+",");
const flush1=src=>src.replace("if (chunk.length >= 2 && FORWARD_CONNECTORS.has(norm(w)) && !isLastInPartition)","if (chunk.length >= 1 && FORWARD_CONNECTORS.has(norm(w)) && !isLastInPartition)");
const PRON=["he","she","we","they","you","it","who","him","them","me","us"]; const POSS=["my","your","his","her","our","their","its"]; const AUX=["have","has","had","do","does","did","not","gonna","wanna","gotta","just","get","got","like","what","how","why","when","where","don't","can't","didn't","doesn't","won't","isn't","ain't"];
const variants={baseline:s=>s, pronouns:addConn(PRON), possessives:addConn(POSS), aux:addConn(AUX), pron_poss:s=>addConn(POSS)(addConn(PRON)(s)), all:s=>addConn(AUX)(addConn(POSS)(addConn(PRON)(s))), pron_poss_flush1:s=>flush1(addConn(POSS)(addConn(PRON)(s))), all_flush1:s=>flush1(addConn(AUX)(addConn(POSS)(addConn(PRON)(s)))), maxwords2:s=>s.replace("const MAX_WORDS = 3;","const MAX_WORDS = 2;")};
for(const [name,patch] of Object.entries(variants)){ const seg=build(patch); let fegaSegs=0,exact=0,autoCount=0,sizes={1:0,2:0,3:0};
  for(const a of auto){ const c=clips[a.clipId]; const segs=seg(a.cleanedWords,"3word"); autoCount+=segs.length; for(const s of segs) sizes[Math.min(3,s.words.length)]++;
    const keys=segs.map(s=>({k:s.words.map(w=>norm(w.word)).join(" "),t:s.startSec}));
    // only score Fega segments whose words all exist in cleanedWords (inside transcription range)
    for(const fs_ of c.sub1){ const ws=fs_.words||[]; if(!ws.length) continue; const inRange=ws.every(w=>a.cleanedWords.some(x=>norm(x.word)===norm(w.word)&&Math.abs(x.start-w.start)<1.5)); if(!inRange) continue; fegaSegs++;
      const k=ws.map(w=>norm(w.word)).join(" "); if(keys.some(e=>e.k===k&&Math.abs(e.t-fs_.startSec)<2)) exact++; } }
  console.log(name.padEnd(18),"fegaSegs",fegaSegs,"reproduced",exact,(100*exact/fegaSegs).toFixed(1)+"%","autoSegs",autoCount,"sizes",JSON.stringify(sizes)); }
