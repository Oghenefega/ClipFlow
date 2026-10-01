/**
 * #479: one record per editor visit — how long the creator actually worked on
 * the clip and which kinds of change they made. Sent to main (edit_sessions)
 * when the visit ends: clip switch, back out of the editor, or window close.
 *
 * Edits are counted by comparing saves (editGroups.js): the store hands us a
 * baseline once the clip is fully loaded, then the fingerprints of every save.
 * Active time is counted in 5 s ticks while the window has focus and there was
 * input in the last minute or playback is running, so a clip left open over
 * lunch reads as the few minutes of real work it got.
 */
import { EDIT_GROUPS, changedGroups } from "./editGroups";

const TICK_MS = 5000;
const IDLE_MS = 60000;
const MIN_ACTIVE_MS = 5000;

let _s = null; // the open session, or null

const sqlTime = (d) => d.toISOString().replace("T", " ").slice(0, 19); // UTC, same as datetime('now')

function onInput() {
  if (_s) _s.lastInput = Date.now();
}

function tick() {
  if (!_s) return;
  const focused = document.hasFocus() && !document.hidden;
  const busy = Date.now() - _s.lastInput < IDLE_MS || _s.isPlaying();
  if (focused && busy) _s.activeMs += TICK_MS;
}

function onUnload() {
  endEditSession();
}

/** Start a visit. Ends any visit still open (a clip switch lands here). */
export function beginEditSession({ clipId, projectId, game, fingerprints, isPlaying }) {
  endEditSession();
  if (!clipId || !projectId || !fingerprints) return;
  _s = {
    clipId, projectId, game: game || null,
    openedAt: new Date(),
    last: fingerprints,
    edits: Object.fromEntries(EDIT_GROUPS.map((g) => [g, 0])),
    activeMs: 0,
    lastInput: Date.now(),
    isPlaying: typeof isPlaying === "function" ? isPlaying : () => false,
    timer: setInterval(tick, TICK_MS),
  };
  window.addEventListener("pointerdown", onInput, true);
  window.addEventListener("keydown", onInput, true);
  window.addEventListener("wheel", onInput, { capture: true, passive: true });
  window.addEventListener("beforeunload", onUnload);
}

/** A save is going out for this clip: count each kind that moved since the last one. */
export function noteEditSave(clipId, fingerprints) {
  if (!_s || _s.clipId !== clipId || !fingerprints) return;
  const changed = changedGroups(_s.last, fingerprints);
  for (const g of changed) _s.edits[g] += 1;
  _s.last = fingerprints;
  if (changed.length) console.log(`[edit-tracker] clipId=${clipId} edited: ${changed.join(", ")}`);
}

/** Close the visit and hand it to main. Short visits with no edits are dropped. */
export function endEditSession() {
  const s = _s;
  if (!s) return;
  _s = null;
  clearInterval(s.timer);
  window.removeEventListener("pointerdown", onInput, true);
  window.removeEventListener("keydown", onInput, true);
  window.removeEventListener("wheel", onInput, { capture: true });
  window.removeEventListener("beforeunload", onUnload);
  const editsTotal = Object.values(s.edits).reduce((a, b) => a + b, 0);
  if (editsTotal === 0 && s.activeMs < MIN_ACTIVE_MS) return;
  try {
    window.clipflow?.editLogSession?.({
      clipId: s.clipId,
      projectId: s.projectId,
      game: s.game,
      openedAt: sqlTime(s.openedAt),
      closedAt: sqlTime(new Date()),
      activeMs: s.activeMs,
      editsTotal,
      edits: s.edits,
    })?.catch?.(() => {});
  } catch (_) { /* tracking must never break the editor */ }
}
