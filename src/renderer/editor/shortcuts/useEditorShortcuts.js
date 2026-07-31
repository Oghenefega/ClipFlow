import { useEffect } from "react";
import usePlaybackStore from "../stores/usePlaybackStore";
import useEditorStore from "../stores/useEditorStore";
import useSubtitleStore from "../stores/useSubtitleStore";
import useLayoutStore from "../stores/useLayoutStore";
import useShortcutBindings from "./useShortcutBindings";
import { eventToKey, SHORTCUTS } from "./registry";
import { getTimelineHandlers } from "./timelineHandlers";

/**
 * Typing must never trigger an edit. With single-letter shortcuts like S and M
 * live, entering "same" in the title field would otherwise trim the timeline
 * twice. contentEditable is covered as well as inputs.
 */
function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

const ACTIONS = {
  playPause: () => usePlaybackStore.getState().togglePlay(),
  fastForward: () => usePlaybackStore.getState().cycleShuttle(1),
  rewind: () => usePlaybackStore.getState().cycleShuttle(-1),

  trimStart: () => useEditorStore.getState().trimTimelineToPlayhead("start"),
  trimEnd: () => useEditorStore.getState().trimTimelineToPlayhead("end"),

  // Owned by the timeline panel — absent while the timeline is collapsed.
  split: (e) => getTimelineHandlers()?.split?.(e),
  deleteSelected: (e) => getTimelineHandlers()?.deleteSelected?.(e),

  undo: () => {
    const store = useSubtitleStore.getState();
    if (store._undoStack.length === 0) return;
    store.undo();
    useEditorStore.getState().markDirty();
  },
  redo: () => {
    const store = useSubtitleStore.getState();
    if (store._redoStack.length === 0) return;
    store.redo();
    useEditorStore.getState().markDirty();
  },

  toggleTimeline: () => useLayoutStore.getState().toggleTlCollapse(),
  showShortcuts: (e, ctx) => ctx.onShowShortcuts?.(),
};

/**
 * The editor's one keyboard layer. Mounted by EditorLayout, which is alive for
 * the whole editing session — so unlike the old per-panel handlers, these keys
 * survive collapsing the timeline.
 */
export default function useEditorShortcuts({ onShowShortcuts, enabled = true }) {
  const bindings = useShortcutBindings((s) => s.bindings);
  const load = useShortcutBindings((s) => s.load);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e) => {
      // The rebind dialog is swallowing the next keypress.
      if (useShortcutBindings.getState().capturing) return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      if (e.repeat) return;

      const key = eventToKey(e);
      // Rebindable key first, then the fixed extras (Backspace for delete,
      // Ctrl+Shift+Z for redo) that the app has always accepted.
      const hit = Object.keys(bindings).find((id) => bindings[id] === key)
        || SHORTCUTS.find((s) => s.altKeys?.includes(key))?.id;
      if (!hit) return;

      const action = ACTIONS[hit];
      if (!action) return;

      e.preventDefault();
      action(e, { onShowShortcuts });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bindings, onShowShortcuts, enabled]);
}
