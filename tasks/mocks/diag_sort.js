const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");

function compareRecordings(a, b) {
  const d = (a.date || "").localeCompare(b.date || "");
  if (d !== 0) return d;
  const t = (a.tag || "").localeCompare(b.tag || "");
  if (t !== 0) return t;
  const day = (a.day_number ?? 0) - (b.day_number ?? 0);
  if (day !== 0) return day;
  return (a.part_number ?? 0) - (b.part_number ?? 0);
}

(async () => {
  const SQL = await initSqlJs();
  const dbPath = path.join(process.env.APPDATA, "clipflow", "data", "clipflow.db");
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const sql = "SELECT date, tag, day_number, part_number, renamed_at, current_filename, status FROM file_metadata WHERE status != 'pending' AND status != 'split' ORDER BY date DESC, renamed_at DESC";
  const res = db.exec(sql);
  if (!res.length) { console.log("no rows"); return; }
  const cols = res[0].columns;
  const rows = res[0].values.map((v) => Object.fromEntries(v.map((x, i) => [cols[i], x])));
  console.log("TOTAL rows:", rows.length);

  // Focus on AR January
  const arJan = rows.filter((r) => r.tag === "AR" && (r.date || "").startsWith("2026-01"));
  console.log("\n=== AR January rows, in SQL order (date DESC, renamed_at DESC) ===");
  arJan.slice(0, 14).forEach((r) =>
    console.log(`date=${r.date} tag=${r.tag} day=${r.day_number} part=${r.part_number} ren=${r.renamed_at} file=${r.current_filename}`)
  );

  // Null-field census across ALL rows
  const nullDay = rows.filter((r) => r.day_number === null || r.day_number === undefined).length;
  const nullPart = rows.filter((r) => r.part_number === null || r.part_number === undefined).length;
  const nullDate = rows.filter((r) => !r.date).length;
  console.log(`\n=== null census (of ${rows.length}) === day_number null: ${nullDay}, part_number null: ${nullPart}, date null/empty: ${nullDate}`);

  // What compareRecordings produces for AR January
  const sorted = [...arJan].sort(compareRecordings);
  console.log("\n=== AR January after compareRecordings (what the list SHOULD show) ===");
  sorted.slice(0, 14).forEach((r) =>
    console.log(`day=${r.day_number} part=${r.part_number} date=${r.date} file=${r.current_filename}`)
  );
})();
