import React, { useRef, useEffect } from "react";
import { SPEED_OPTIONS } from "./timelineConstants";

export default function SpeedDropdown({ value, onChange, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute bottom-full right-0 mb-1 w-[100px] rounded-lg border bg-popover shadow-xl z-50 overflow-hidden">
      {SPEED_OPTIONS.map((s) => (
        <button
          key={s}
          className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${
            value === s ? "text-blue-400 bg-blue-500/10" : "text-foreground hover:bg-secondary/60"
          }`}
          onClick={() => { onChange(s); onClose(); }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
