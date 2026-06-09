import React, { useEffect, useRef, useState } from "react";

// ════════════════════════════════════════════════════════════════
//  INLINE WORD EDITOR — shown on double-click
//  Shared by TranscriptTab (LeftPanelNew) and SegmentRow. Lives in its own file
//  so SegmentRow can import it without a circular dependency on LeftPanelNew.
// ════════════════════════════════════════════════════════════════
export function InlineWordEditor({ initialText, onConfirm, onCancel, selectAll }) {
  const inputRef = useRef(null);
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (selectAll) {
        inputRef.current.select();
      } else {
        // Place cursor at end
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
    }
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // If text is empty, signal deletion via onConfirm with empty string
      onConfirm(text.trim());
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => onConfirm(text.trim())}
      className="inline bg-primary/15 text-primary border border-primary/30 rounded px-1.5 py-0.5 text-sm outline-none min-w-[40px]"
      style={{ width: `${Math.max(40, text.length * 9.5 + 16)}px` }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
