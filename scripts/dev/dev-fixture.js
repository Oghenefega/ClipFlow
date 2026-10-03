// node scripts/dev/dev-fixture.js setup [--project <proj_id>]... [--accounts]
// node scripts/dev/dev-fixture.js restore
// node scripts/dev/dev-fixture.js status
//
// The dev profile is seeded from prod, so its folders point at the REAL
// library: projects, recordings, renders and test footage. `setup` backs up
// the dev settings + tokens, then repoints all four folders at a scratch
// tree in %TEMP%\corva-fixture holding COPIES of the chosen projects. With
// no --project it picks the newest project with zero approved clips (the
// fixture rule: never test on approved or published clips). `restore` puts
// both files back byte for byte. Run both with the dev app CLOSED: the app
// rewrites its settings file and would undo the repoint.
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEV = path.join(process.env.APPDATA, "clipflow-dev");
const SETTINGS = path.join(DEV, "clipflow-settings.json");
const TOKENS = path.join(DEV, "clipflow-tokens.json");
const BACKUP = path.join(DEV, "fixture-backup");
const ROOT = path.join(fs.realpathSync.native(os.tmpdir()), "corva-fixture");
const FOLDERS = ["projectsRoot", "watchFolder", "outputFolder", "testWatchFolder"];

const [cmd, ...rest] = process.argv.slice(2);
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

function realProjectsDir() {
  const prod = readJson(path.join(process.env.APPDATA, "Corva", "clipflow-settings.json"));
  return path.join(prod.projectsRoot || prod.watchFolder, ".clipflow", "projects");
}

function pickProjects(dir) {
  const ids = [];
  for (let i = 0; i < rest.length; i++) if (rest[i] === "--project") ids.push(rest[++i]);
  if (ids.length) return ids;
  const candidates = fs.readdirSync(dir).filter((d) => d.startsWith("proj_")).map((id) => {
    try {
      const p = readJson(path.join(dir, id, "project.json"));
      const clips = p.clips || [];
      return { id, ok: clips.length > 0 && !clips.some((c) => c.status === "approved"), at: p.createdAt || "" };
    } catch { return { id, ok: false }; }
  }).filter((c) => c.ok).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!candidates.length) throw new Error("no project with zero approved clips found; pass --project <id>");
  return [candidates[0].id];
}

function setup() {
  if (fs.existsSync(BACKUP)) throw new Error(`a backup already exists in ${BACKUP}: run restore first`);
  const tokens = readJson(TOKENS);
  if (Object.keys(tokens.accounts || {}).length) throw new Error("dev tokens hold accounts: empty them to {\"accounts\":{}} first");
  const settings = readJson(SETTINGS);

  fs.mkdirSync(BACKUP, { recursive: true });
  fs.copyFileSync(SETTINGS, path.join(BACKUP, "clipflow-settings.json"));
  fs.copyFileSync(TOKENS, path.join(BACKUP, "clipflow-tokens.json"));

  fs.rmSync(ROOT, { recursive: true, force: true });
  const realDir = realProjectsDir();
  const ids = pickProjects(realDir);
  for (const id of ids) {
    // listProjects only reads proj_* folders, and the id must match the folder.
    if (!id.startsWith("proj_")) throw new Error(`${id}: project ids must start with proj_`);
    const dest = path.join(ROOT, ".clipflow", "projects", id);
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(path.join(realDir, id, "project.json"), path.join(dest, "project.json"));
  }
  for (const sub of ["watch", "out", "test-watch"]) fs.mkdirSync(path.join(ROOT, sub), { recursive: true });

  const next = {
    ...settings,
    projectsRoot: ROOT,
    watchFolder: path.join(ROOT, "watch"),
    outputFolder: path.join(ROOT, "out"),
    testWatchFolder: path.join(ROOT, "test-watch"),
    _fixtureRoot: ROOT,
  };
  // App.js falls back to this stale cache when the project list is empty,
  // which hides the fixture behind phantom clips.
  delete next.localProjects;
  fs.writeFileSync(SETTINGS, JSON.stringify(next, null, 2));

  if (rest.includes("--accounts")) {
    // Token-less placeholders: the Queue's per-platform blocks only render
    // for connected accounts. Empty tokens cannot publish.
    const acct = (platform, extra) => ({
      platform, openId: "", accessToken: "", refreshToken: "", expiresAt: 0, scope: "",
      displayName: `Preview Only (${platform})`, avatarUrl: "", connectedAt: new Date().toISOString(), ...extra,
    });
    fs.writeFileSync(TOKENS, JSON.stringify({ ...tokens, accounts: {
      youtube_fixture: acct("YouTube", { channelId: "" }),
      tiktok_fixture: acct("TikTok"),
      instagram_fixture: acct("Instagram", { igAccountId: "0" }),
      facebook_fixture: acct("Facebook", { pageId: "0" }),
    } }, null, 2));
  }
  console.log(`fixture at ${ROOT} with ${ids.join(", ")}${rest.includes("--accounts") ? " + placeholder accounts" : ""}`);
  status();
}

function restore() {
  if (!fs.existsSync(BACKUP)) { console.log("nothing to restore"); status(); return; }
  for (const f of ["clipflow-settings.json", "clipflow-tokens.json"]) {
    const from = path.join(BACKUP, f);
    const to = path.join(DEV, f);
    fs.copyFileSync(from, to);
    if (!fs.readFileSync(from).equals(fs.readFileSync(to))) throw new Error(`${f} did not restore byte for byte`);
  }
  fs.rmSync(BACKUP, { recursive: true, force: true });
  console.log("dev settings and tokens restored");
  status();
}

function status() {
  const s = readJson(SETTINGS);
  for (const k of FOLDERS) console.log(`${k.padEnd(16)} ${s[k]}`);
  console.log(`token accounts   ${Object.keys(readJson(TOKENS).accounts || {}).length}`);
  console.log(`backup pending   ${fs.existsSync(BACKUP)}`);
}

try {
  if ((cmd === "setup" || cmd === "restore") && require("./dev-kill.js").devProcesses().length) {
    throw new Error("the dev app is running: stop it with dev-kill.js first");
  }
  if (cmd === "setup") setup();
  else if (cmd === "restore") restore();
  else if (cmd === "status") status();
  else { console.error("usage: dev-fixture.js setup [--project <id>]... [--accounts] | restore | status"); process.exit(1); }
} catch (e) { console.error(e.message); process.exit(1); }
