// Like repro.js, but the clip transcription's word timings are replaced by a refined dump
// (refined/<mode>/<clipId>.json from score_production.py DUMP=1) before the app pipeline runs.
//   node repro_refined.js <scratchpad> <mode>   -> auto_repro_<mode>.json
const fs=require("fs"),path=require("path");const S=process.argv[2],mode=process.argv[3];
const src=fs.readFileSync(path.join(__dirname,"repro.js"),"utf8")
  .replace('const S = process.argv[2];','const S = process.argv[2]; const MODE = process.argv[3];')
  .replace('for (const c of clips) {','for (const c of clips) {\n  const rp = path.join(S, "refined", MODE, c.clipId + ".json"); if (fs.existsSync(rp)) c.clipTranscription = { ...c.clipTranscription, segments: JSON.parse(fs.readFileSync(rp, "utf8")).segments };')
  .replace('"auto_repro.json"','"auto_repro_" + MODE + ".json"');
fs.writeFileSync(path.join(S,"repro_"+mode+".js"),src);
require("child_process").execFileSync("node",[path.join(S,"repro_"+mode+".js"),S,mode],{stdio:"inherit"});
