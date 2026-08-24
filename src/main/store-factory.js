/**
 * electron-store v11 is ESM-only. Electron main is CJS. This helper bridges
 * that: dynamic import is cached once, createStore() just instantiates.
 *
 * Every module that previously did `new Store({...})` at module top now
 * exports an async `init()` that main.js awaits during whenReady bootstrap.
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const log = require("electron-log/main").scope("store");

let _StoreClass = null;

async function loadStoreClass() {
  if (!_StoreClass) {
    const m = await import("electron-store");
    _StoreClass = m.default;
  }
  return _StoreClass;
}

/**
 * #298: electron-store throws when its JSON file is malformed, and that throw
 * used to escape the un-caught bootstrap chain — no window was ever created and
 * the process kept the single-instance lock, so every later launch silently did
 * nothing. `clearInvalidConfig` below stops the throw; this stops the file from
 * being thrown away with it. A settings file is not something a user can repair
 * by hand, but it is theirs, so the damaged copy is set aside, never deleted.
 */
function quarantineIfCorrupt(name) {
  const file = path.join(app.getPath("userData"), `${name}.json`);
  if (!fs.existsSync(file)) return;
  try {
    JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    const quarantine = `${file}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(file, quarantine);
      log.error(`${name}.json was unreadable (${err.message}) — kept a copy at ${quarantine}, starting from defaults`);
    } catch (e) {
      log.error(`${name}.json is unreadable and could not be set aside: ${e.message}`);
    }
  }
}

async function createStore(options) {
  const Store = await loadStoreClass();
  if (options?.name) quarantineIfCorrupt(options.name);
  return new Store({ clearInvalidConfig: true, ...options });
}

module.exports = { createStore };
