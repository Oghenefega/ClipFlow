import React from "react";
import T from "../styles/theme";

/**
 * Clickable TEST chip. Off = outlined gray (opt-in signal). On = filled yellow
 * with glow (so it reads clearly on the dark surface, per ui-standards.md).
 *
 * Props:
 *   isTest (bool)        — current state
 *   onToggle (fn)        — called with the next boolean value
 *   size ("sm" | "md")   — compact for card chips, bigger for modals
 *   disabled (bool)      — render non-interactive (for read-only contexts)
 *   title (string)       — optional tooltip override
 */
export default function TestChip({ isTest, onToggle, size = "sm", disabled = false, title }) {
  const isSm = size === "sm";
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontFamily: T.mono,
    fontWeight: 700,
    letterSpacing: "0.5px",
    fontSize: isSm ? 9 : 11,
    padding: isSm ? "1px 6px" : "3px 9px",
    borderRadius: 4,
    cursor: disabled ? "default" : "pointer",
    userSelect: "none",
    flexShrink: 0,
    transition: "background 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
  };
  const onStyle = {
    ...base,
    color: "#facc15",
    background: "rgba(250,204,21,0.16)",
    border: "1px solid rgba(250,204,21,0.45)",
    boxShadow: "0 0 6px rgba(250,204,21,0.45)",
  };
  const offStyle = {
    ...base,
    color: T.textTertiary,
    background: "transparent",
    border: `1px dashed ${T.borderHover}`,
  };
  const tooltip = title || (isTest
    ? "Test mode ON \u2014 outputs route to Test area, publishing blocked. Click to turn off."
    : "Test mode OFF \u2014 outputs go to real pipeline. Click to mark as test.");

  const handleClick = (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    onToggle?.(!isTest);
  };

  return (
    <span
      role="button"
      aria-pressed={isTest}
      tabIndex={disabled ? -1 : 0}
      title={tooltip}
      onClick={handleClick}
      onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) handleClick(e); }}
      style={isTest ? onStyle : offStyle}
    >
      TEST
    </span>
  );
}
