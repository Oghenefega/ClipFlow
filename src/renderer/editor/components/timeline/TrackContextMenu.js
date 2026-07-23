import React, { useRef, useEffect, useState, useLayoutEffect } from "react";
import { Scissors, Trash2, Copy, FilePlus, ArrowLeftToLine, Film, Plus } from "lucide-react";
import { Separator } from "../../../../components/ui/separator";

export default function TrackContextMenu({ x, y, track, onClose, onSplit, onDelete, onRippleDelete, onDuplicate, onCreateClip, onDeleteWithAudio, splitDisabledReason, onAddWord }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Viewport-aware placement: the timeline lives at the bottom of the window,
  // so a menu at the cursor usually has no room below. Measure after mount
  // (useLayoutEffect — before paint, so no flicker) and flip above the cursor
  // when the menu would spill past the bottom; clamp the right edge likewise.
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    let left = x, top = y;
    if (left + r.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - r.width);
    if (top + r.height > window.innerHeight - pad) top = Math.max(pad, y - r.height);
    setPos({ left, top });
  }, [x, y]);

  const trackLabel = track === "cap" ? "caption" : track === "sub" ? "subtitle" : "scene";

  return (
    <div
      ref={ref}
      className="fixed rounded-lg border bg-popover shadow-xl z-[100] overflow-hidden w-[220px]"
      style={{ left: pos.left, top: pos.top }}
    >
      <button
        className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
          splitDisabledReason ? "text-muted-foreground/50 cursor-default" : "text-foreground hover:bg-secondary/60"
        }`}
        disabled={!!splitDisabledReason}
        onClick={() => { onSplit(); onClose(); }}
      >
        <Scissors className={`h-3.5 w-3.5 ${splitDisabledReason ? "text-muted-foreground/40" : "text-blue-400"}`} /> Split at playhead
        <span className="ml-auto text-muted-foreground text-[10px]">{splitDisabledReason || "S"}</span>
      </button>
      {track === "sub" && onAddWord && (
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
          onClick={() => { onAddWord(); onClose(); }}
        >
          <Plus className="h-3.5 w-3.5 text-green-400" /> Add word
        </button>
      )}
      <Separator />
      {track === "audio" && (
        <>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors" onClick={() => { onCreateClip?.(); onClose(); }}>
            <FilePlus className="h-3.5 w-3.5 text-green-400" /> Create as new clip
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors" onClick={() => { onDuplicate(); onClose(); }}>
            <Copy className="h-3.5 w-3.5 text-blue-400" /> Duplicate original video
          </button>
          <Separator />
        </>
      )}
      {track === "audio" ? (
        <>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
            onClick={() => { onRippleDelete(); onClose(); }}
          >
            <ArrowLeftToLine className="h-3.5 w-3.5 text-orange-400" /> Ripple delete
            <span className="ml-auto text-muted-foreground text-[10px]">Del</span>
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
            onClick={() => { onDelete(); onClose(); }}
          >
            <Trash2 className="h-3.5 w-3.5 text-red-400" /> Delete {trackLabel} (leave gap)
            <span className="ml-auto text-muted-foreground text-[10px]">Ctrl+Del</span>
          </button>
        </>
      ) : (
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
          onClick={() => { onDelete(); onClose(); }}
        >
          <Trash2 className="h-3.5 w-3.5 text-red-400" /> Delete {trackLabel}
          <span className="ml-auto text-muted-foreground text-[10px]">Del</span>
        </button>
      )}
      {(track === "sub" || track === "cap") && onDeleteWithAudio && (
        <>
          <Separator />
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
            onClick={() => { onDeleteWithAudio(); onClose(); }}
          >
            <Film className="h-3.5 w-3.5 text-red-500" /> Delete {trackLabel} + clip
          </button>
        </>
      )}
    </div>
  );
}
