// node scripts/dev/dev-launch.js [--main]
// Starts the source app on the DEV profile with CDP on 9222 (and the main
// process inspector on 9229 with --main), waits until the app's own API
// answers, dismisses the What's New dialog, then returns. The app keeps
// running detached; its stdout/stderr go to %TEMP%\corva-dev-app.log.
// Stop it with scripts/dev/dev-kill.js. See scripts/dev/README.md.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.join(__dirname, "..", "..");
const DEV = path.join(process.env.APPDATA, "clipflow-dev");
const LOG = path.join(fs.realpathSync.native(os.tmpdir()), "corva-dev-app.log");
const withMain = process.argv.includes("--main");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (port) => {
  try { return await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { return null; }
};

async function evalPage(expr) {
  const targets = await getJson(9222);
  const page = targets && targets.find((t) => t.type === "page" && /index\.html/.test(t.url));
  if (!page) return undefined;
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true, awaitPromise: true } }));
  const msg = await new Promise((res) => { ws.onmessage = (e) => res(JSON.parse(e.data)); });
  await new Promise((r) => { ws.onclose = r; ws.close(); });
  return msg.result && msg.result.result && msg.result.result.value;
}

(async () => {
  // Publishing from dev must be impossible: real tokens get copied in by
  // dev:seed. Token-less placeholders (dev-fixture.js --accounts) are fine.
  const tokens = JSON.parse(fs.readFileSync(path.join(DEV, "clipflow-tokens.json"), "utf8"));
  if (Object.values(tokens.accounts || {}).some((a) => a.accessToken || a.refreshToken)) {
    console.error("REFUSING: dev clipflow-tokens.json holds real tokens. Empty it to {\"accounts\":{}} first.");
    process.exit(1);
  }
  // A leftover instance keeps 9222 and makes the new launch bounce off the
  // single-instance lock, so every probe would measure the OLD code.
  if (await getJson(9222)) {
    console.error("REFUSING: something already answers on 9222. Run scripts/dev/dev-kill.js first.");
    process.exit(1);
  }

  const settings = JSON.parse(fs.readFileSync(path.join(DEV, "clipflow-settings.json"), "utf8"));
  const sandboxed = settings._fixtureRoot && settings.projectsRoot === settings._fixtureRoot;
  console.log(sandboxed
    ? `projectsRoot: fixture ${settings.projectsRoot}`
    : `WARNING: projectsRoot is the REAL library (${settings.projectsRoot}). Run dev-fixture.js setup before anything that writes.`);
  const build = path.join(REPO, "build", "index.html");
  if (fs.existsSync(build)) console.log(`renderer build: ${fs.statSync(build).mtime.toLocaleString()} (run npm run build:renderer if older than your edits)`);

  const args = [".", "--remote-debugging-port=9222",
    "--disable-features=CalculateNativeWinOcclusion", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];
  if (withMain) args.push("--inspect=9229");
  const out = fs.openSync(LOG, "w");
  const child = spawn(require(path.join(REPO, "node_modules", "electron")), args, {
    cwd: REPO, env: { ...process.env, CLIPFLOW_PROFILE: "dev" }, detached: true, stdio: ["ignore", out, out],
  });
  child.unref();
  console.log(`started electron PID ${child.pid}, log ${LOG}`);

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await sleep(1000);
    const ready = await evalPage("document.readyState === 'complete' && typeof window.clipflow?.projectList === 'function'").catch(() => false);
    if (ready) break;
  }
  if (Date.now() >= deadline) { console.error("TIMEOUT: app never became ready. Check the log."); process.exit(2); }
  if (withMain) {
    // The main module cache is half-loaded for the first seconds after boot.
    while (!(await getJson(9229)) && Date.now() < deadline + 30000) await sleep(1000);
    await sleep(15000);
  }

  // What's New covers the whole window after any version bump and eats clicks.
  await sleep(1500);
  const dismissed = await evalPage(`(() => {
    const b = [...document.querySelectorAll("button")].filter((e) => e.offsetParent && e.textContent.trim() === "Got it");
    if (b.length !== 1) return "no What's New dialog";
    b[0].click(); return "dismissed What's New";
  })()`);
  console.log(dismissed);
  const count = await evalPage("window.clipflow.projectList().then((r) => (r.projects || r || []).length)");
  console.log(`ready: ${count} project(s) loaded${withMain ? ", main inspector on 9229" : ""}`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(3); });
