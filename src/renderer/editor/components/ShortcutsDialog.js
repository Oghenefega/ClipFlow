import React, { useState, useEffect, useCallback } from "react";
import { Button } from "../../../components/ui/button";
import useShortcutBindings from "../shortcuts/useShortcutBindings";
import { SHORTCUTS, GROUPS, eventToKey, formatKey } from "../shortcuts/registry";

/**
 * The editor's keyboard cheat sheet, and where shortcuts get rebound.
 *
 * Rendered straight off the registry, so a shortcut added in code shows up here
 * without anyone remembering to update a list.
 */
export default function ShortcutsDialog({ open, onClose }) {
  const bindings = useShortcutBindings((s) => s.bindings);
  const rebind = useShortcutBindings((s) => s.rebind);
  const resetDefaults = useShortcutBindings((s) => s.resetDefaults);
  const setCapturing = useShortcutBindings((s) => s.setCapturing);

  // Which row is waiting for a keypress, and any clash that needs confirming.
  const [capturingId, setCapturingId] = useState(null);
  const [conflict, setConflict] = useState(null);

  const stopCapture = useCallback(() => {
    setCapturingId(null);
    setConflict(null);
    setCapturing(false);
  }, [setCapturing]);

  // Reset transient state whenever the dialog is dismissed.
  useEffect(() => {
    if (!open) stopCapture();
  }, [open, stopCapture]);

  // Esc closes the dialog — unless a capture is in flight, where it cancels
  // just the capture.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (capturingId) stopCapture();
      else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, capturingId, stopCapture, onClose]);

  // Swallow the next keypress and turn it into a binding. Runs in the capture
  // phase so nothing else in the app sees the key first.
  useEffect(() => {
    if (!capturingId) return;
    const onKey = (e) => {
      if (e.key === "Escape") return; // handled above
      e.preventDefault();
      e.stopPropagation();

      const key = eventToKey(e);
      if (key === "ctrl" || key === "alt" || key === "shift") return; // modifier alone

      const holderId = Object.keys(bindings).find((id) => id !== capturingId && bindings[id] === key);
      if (holderId) {
        setConflict({ id: capturingId, key, holderId });
        return;
      }
      rebind(capturingId, key);
      stopCapture();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturingId, bindings, rebind, stopCapture]);

  if (!open) return null;

  const startCapture = (id) => {
    setConflict(null);
    setCapturingId(id);
    setCapturing(true);
  };

  const confirmConflict = () => {
    rebind(conflict.id, conflict.key);
    stopCapture();
  };

  const labelFor = (id) => SHORTCUTS.find((s) => s.id === id)?.label || id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[560px] max-h-[80vh] flex flex-col rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div>
            <div className="text-sm font-bold text-foreground">Keyboard Shortcuts</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Click any key to change it. Changes are saved automatically.
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
            ✕
          </Button>
        </div>

        {/* Conflict confirmation */}
        {conflict && (
          <div className="mx-5 mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 shrink-0">
            <div className="text-[12px] text-foreground">
              <span className="font-semibold">{formatKey(conflict.key)}</span> is already used by{" "}
              <span className="font-semibold">{labelFor(conflict.holderId)}</span>.
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Reassigning leaves {labelFor(conflict.holderId)} without a shortcut.
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" className="h-6 text-[11px]" onClick={confirmConflict}>Reassign</Button>
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={stopCapture}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Groups */}
        <div className="overflow-y-auto px-5 py-3 flex-1">
          {GROUPS.map((group) => (
            <div key={group} className="mb-4 last:mb-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                {group}
              </div>
              <div className="flex flex-col">
                {SHORTCUTS.filter((s) => s.group === group).map((s) => {
                  const key = bindings[s.id];
                  const isCapturing = capturingId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => startCapture(s.id)}
                      className="flex items-center justify-between gap-3 py-1.5 px-2 -mx-2 rounded hover:bg-muted/50 text-left"
                    >
                      <span className="min-w-0">
                        <span className="text-[13px] text-foreground">{s.label}</span>
                        {s.hint && (
                          <span className="block text-[11px] text-muted-foreground truncate">{s.hint}</span>
                        )}
                      </span>
                      <span
                        className={
                          "shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold border " +
                          (isCapturing
                            ? "border-primary text-primary animate-pulse"
                            : key
                              ? "border-border bg-muted text-foreground"
                              : "border-dashed border-border text-muted-foreground")
                        }
                      >
                        {isCapturing ? "press a key…" : key ? formatKey(key) : "unassigned"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-border shrink-0">
          <span className="text-[11px] text-muted-foreground">
            Shortcuts pause while you're typing in a text field.
          </span>
          <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={resetDefaults}>
            Reset to defaults
          </Button>
        </div>
      </div>
    </div>
  );
}
