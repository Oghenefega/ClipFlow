// Reproduce the app's automatic subtitle pipeline for every approved clip
// (resolveClipSubtitles on clip.transcription → dedup → cleanWordTimestamps → segmentWords 3word)
const fs = require("fs"), path = require("path"), vm = require("vm");
const S = process.argv[2];
const ROOT = "C:/Users/IAmAbsolute/Desktop/ClipFlow/src/renderer/editor/utils";
const { resolveClipSubtitles } = require(ROOT + "/resolveSubtitles.js");
const { cleanWordTimestamps } = require(ROOT + "/cleanWordTimestamps.js");
function loadMaybeEsm(file) {
  let src = fs.readFileSync(file, "utf8");
  if (/^\s*export\s/m.test(src)) {
    src = src.replace(/^export\s*\{[\s\S]*?\};?/mg, "").replace(/^export\s+default\s+/mg, "module.exports.default = ").replace(/^export\s+(const|function|let|var|class)\s+(\w+)/mg, (m, k, n) => `${k} ${n}`);
    const names = [...src.matchAll(/^(?:const|function|let|var|class)\s+(\w+)/mg)].map(m => m[1]);
    src += "\nmodule.exports = Object.assign(module.exports||{}, {" + names.join(",") + "});";
    const mod = { exports: {} };
    vm.runInThisContext("(function(module,exports,require){" + src + "\n})")(mod, mod.exports, require);
    return mod.exports;
  }
  return require(file);
}
const { segmentWords } = loadMaybeEsm(ROOT + "/segmentWords.js");
const clips = JSON.parse(fs.readFileSync(path.join(S, "approved_clips.json"), "utf8"));
const out = [];
for (const c of clips) {
  if (!c.sub1 || !c.sub1.length || !c.clipTranscription) continue;
  const clipNoSub = { id: c.clipId, startTime: c.startTime, endTime: c.endTime, nleSegments: c.nleSegments, transcription: c.clipTranscription, subtitles: { sub1: [], sub2: [] } };
  const project = { transcription: { segments: c.projTranscriptionSegs } };
  const r = resolveClipSubtitles(clipNoSub, project, { includeExtras: false });
  // mimic setSegmentMode
  const allWords = [];
  for (const seg of r.segments) {
    const textWords = (seg.text || "").split(/\s+/).filter(Boolean);
    if (!textWords.length) continue;
    if (seg.words && seg.words.length === textWords.length) seg.words.forEach((w, i) => allWords.push({ ...w, word: textWords[i] }));
    else { const dur = (seg.end - seg.start) / textWords.length; textWords.forEach((t, i) => allWords.push({ word: t, start: seg.start + i * dur, end: seg.start + (i + 1) * dur, probability: 1 })); }
  }
  allWords.sort((a, b) => a.start - b.start);
  const stripP = (t) => (t || "").toLowerCase().replace(/[.,!?;:'"]+/g, "").trim();
  const deduped = [];
  for (const w of allWords) { if (!deduped.some(d => Math.abs(d.start - w.start) < 0.5 && stripP(d.word) === stripP(w.word))) deduped.push(w); }
  const cleaned = cleanWordTimestamps(deduped);
  const segs = segmentWords(cleaned, "3word");
  out.push({ clipId: c.clipId, title: c.title, source: r.source, resolvedWords: allWords, cleanedWords: cleaned, autoSegs: segs.map(s => ({ text: s.text, startSec: s.startSec, endSec: s.endSec, words: s.words })) });
}
fs.writeFileSync(path.join(S, "auto_repro.json"), JSON.stringify(out));
console.log("repro clips:", out.length, "sources:", [...new Set(out.map(o => o.source))]);
const ex = out[0]; console.log(ex.title); console.log(JSON.stringify(ex.autoSegs.slice(0, 4), null, 0));
