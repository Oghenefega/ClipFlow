/**
 * Split and Delete need the timeline's own selection state (which track, which
 * blocks), which lives as local state inside TimelinePanelNew. Rather than
 * hoist that into a store — a far wider change than this feature needs — the
 * panel publishes those two handlers here while it is mounted, and the global
 * key layer calls through.
 *
 * Consequence, by design: with the timeline collapsed the panel is unmounted,
 * so Split and Delete no-op. Everything else (play/pause, shuttle, trim to
 * playhead) runs off stores and keeps working either way.
 */

let current = null;

/** Publish the handlers. Returns an unregister function for effect cleanup. */
export function registerTimelineHandlers(handlers) {
  current = handlers;
  return () => {
    // Only clear if nobody re-registered in the meantime — under StrictMode the
    // remount's register runs before the first mount's cleanup.
    if (current === handlers) current = null;
  };
}

export function getTimelineHandlers() {
  return current;
}
