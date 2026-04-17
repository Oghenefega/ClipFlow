/**
 * electron-store v11 is ESM-only. Electron main is CJS. This helper bridges
 * that: dynamic import is cached once, createStore() just instantiates.
 *
 * Every module that previously did `new Store({...})` at module top now
 * exports an async `init()` that main.js awaits during whenReady bootstrap.
 */

let _StoreClass = null;

async function loadStoreClass() {
  if (!_StoreClass) {
    const m = await import("electron-store");
    _StoreClass = m.default;
  }
  return _StoreClass;
}

async function createStore(options) {
  const Store = await loadStoreClass();
  return new Store(options);
}

module.exports = { createStore };
