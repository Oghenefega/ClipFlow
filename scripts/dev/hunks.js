// node hunks.js <file> <marker> — prints a patch of only the hunks of `git diff <file>`
// whose body contains <marker>, for `git apply --cached` (per-issue commits from a shared file).
const { execSync } = require("child_process");
const [file, marker] = process.argv.slice(2);
const diff = execSync(`git diff -- "${file}"`, { encoding: "utf8" });
const lines = diff.split("\n");
const headerEnd = lines.findIndex((l) => l.startsWith("@@"));
const header = lines.slice(0, headerEnd);
const hunks = [];
let cur = null;
for (const l of lines.slice(headerEnd)) {
  if (l.startsWith("@@")) { cur = [l]; hunks.push(cur); } else if (cur) cur.push(l);
}
const keep = hunks.filter((h) => h.some((l) => l.includes(marker)));
if (!keep.length) { console.error("no hunk contains", marker); process.exit(1); }
process.stdout.write(header.join("\n") + "\n" + keep.map((h) => h.join("\n")).join("\n") + "\n");
console.error(`kept ${keep.length}/${hunks.length} hunks`);
