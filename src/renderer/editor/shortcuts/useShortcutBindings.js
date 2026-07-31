import { create } from "zustand";
import { defaultBindings } from "./registry";

// Lives beside the app's other editor preferences in electron-store.
const STORE_KEY = "editorShortcuts";

/**
 * Which key is bound to which action, plus the persistence for user rebinds.
 *
 * Deliberately NOT one of the six editor domain stores — this is app-level
 * input config that outlives any clip, so it loads once and never resets with
 * the editor.
 */
const useShortcutBindings = create((set, get) => ({
  bindings: defaultBindings(),
  loaded: false,

  // True while the dialog is waiting for the user to press a key. The global
  // key layer stands down so the captured key doesn't also fire its action.
  capturing: false,
  setCapturing: (v) => set({ capturing: v }),

  load: async () => {
    if (get().loaded) return;
    let saved = null;
    try {
      saved = await window.clipflow?.storeGet?.(STORE_KEY);
    } catch (_) {
      // Unreadable prefs are not worth failing the editor over — defaults are fine.
    }
    // Layered over the defaults so a shortcut added in a later version still
    // has a key for users who already have saved rebinds.
    set({ bindings: { ...defaultBindings(), ...(saved || {}) }, loaded: true });
  },

  /**
   * Bind a key to an action. Whatever held that key is left unbound rather
   * than silently sharing it — the dialog warns before calling this.
   */
  rebind: (id, key) => {
    const next = { ...get().bindings };
    for (const otherId of Object.keys(next)) {
      if (otherId !== id && next[otherId] === key) next[otherId] = null;
    }
    next[id] = key;
    set({ bindings: next });
    window.clipflow?.storeSet?.(STORE_KEY, next);
  },

  resetDefaults: () => {
    const d = defaultBindings();
    set({ bindings: d });
    window.clipflow?.storeSet?.(STORE_KEY, d);
  },
}));

export default useShortcutBindings;
