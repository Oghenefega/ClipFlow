// node scripts/dev/dev-kill.js
// Stops ONLY the source-run app: the electron.exe tree whose command line
// points at this repo. Never touches Corva.exe (the installed daily driver)
// or other apps' electron.exe (DaVinci Resolve's Epidemic Sound plugin runs
// five of them). Calls taskkill directly from node, so Git Bash cannot
// mangle the /F /T /PID switches.
const { execFileSync } = require("child_process");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..").toLowerCase();

function devProcesses() {
  const ps = "Get-CimInstance Win32_Process -Filter \"name='electron.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";
  const raw = execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim();
  if (!raw) return [];
  const list = [].concat(JSON.parse(raw));
  return list.filter((p) => (p.CommandLine || "").toLowerCase().includes(REPO));
}

module.exports = { devProcesses };
if (require.main !== module) return;

const all = devProcesses();
// Kill the tree from its root (the process without --type=); children follow.
const roots = all.filter((p) => !/--type=/.test(p.CommandLine));
for (const p of (roots.length ? roots : all)) {
  try {
    execFileSync("taskkill", ["/F", "/T", "/PID", String(p.ProcessId)], { stdio: "pipe" });
    console.log(`stopped PID ${p.ProcessId} and its children`);
  } catch {
    console.log(`PID ${p.ProcessId} already gone`);
  }
}
const left = devProcesses();
console.log(left.length ? `STILL RUNNING: ${left.map((p) => p.ProcessId).join(", ")}` : all.length ? "dev app stopped" : "no dev app was running");
process.exit(left.length ? 1 : 0);
