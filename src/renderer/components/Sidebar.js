import React from "react";
import T from "../styles/theme";

export default function Sidebar({ navItems, activeView, onNavigate }) {
  return (
    <div
      style={{
        height: 56,
        flexShrink: 0,
        borderTop: `1px solid ${T.border}`,
        background: "rgba(10,11,16,0.92)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        padding: "0 12px",
      }}
    >
      {navItems.map((item) => {
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "6px 0 8px",
              border: "none",
              cursor: "pointer",
              background: "transparent",
              color: isActive ? T.accentLight : T.textTertiary,
              fontSize: 10,
              fontWeight: isActive ? 700 : 500,
              fontFamily: T.font,
              position: "relative",
              maxWidth: 80,
              transition: "color 0.15s",
            }}
          >
            {isActive && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  width: 24,
                  height: 2,
                  background: T.accent,
                  borderRadius: "0 0 2px 2px",
                }}
              />
            )}
            <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ letterSpacing: "0.2px" }}>{item.label}</span>
            {item.badge > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 4,
                  right: "50%",
                  transform: "translateX(16px)",
                  background: T.accent,
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: 7,
                  minWidth: 14,
                  textAlign: "center",
                  lineHeight: "14px",
                }}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
