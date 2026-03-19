import React, { useRef, useEffect } from "react";
import { Scissors, Trash2, Copy, FilePlus, ArrowLeftToLine } from "lucide-react";
import { Separator } from "../../../../components/ui/separator";

export default function TrackContextMenu({ x, y, track, onClose, onSplit, onDelete, onRippleDelete, onDuplicate }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const trackLabel = track === "cap" ? "caption" : track === "sub" ? "subtitle" : "scene";

  return (
    <div
      ref={ref}
      className="fixed rounded-lg border bg-popover shadow-xl z-[100] overflow-hidden w-[220px]"
      style={{ left: x, top: y }}
    >
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
        onClick={() => { onSplit(); onClose(); }}
      >
        <Scissors className="h-3.5 w-3.5 text-blue-400" /> Split at playhead
        <span className="ml-auto text-muted-foreground text-[10px]">S</span>
      </button>
      <Separator />
      {track === "audio" && (
        <>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors" onClick={() => { onClose(); }}>
            <FilePlus className="h-3.5 w-3.5 text-green-400" /> Create as new clip
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors" onClick={() => { onDuplicate(); onClose(); }}>
            <Copy className="h-3.5 w-3.5 text-blue-400" /> Duplicate original video
          </button>
          <Separator />
        </>
      )}
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
    </div>
  );
}
