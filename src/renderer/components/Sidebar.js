import React from "react";
import T from "../styles/theme";

export default function Sidebar({ navItems, activeView, onNavigate, mainGame }) {
  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: `1px solid ${T.border}`,
        background: "rgba(10,11,16,0.6)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "20px 20px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            boxShadow: "0 2px 12px rgba(139,92,246,0.35)",
          }}
        >
          ⚡
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.3px" }}>
          ClipFlow
        </span>
      </div>

      {/* Navigation */}
      <div style={{ padding: "12px 10px", flex: 1 }}>
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                color: isActive ? T.text : T.textTertiary,
                fontSize: 14,
                fontWeight: isActive ? 700 : 500,
                fontFamily: T.font,
                marginBottom: 2,
                position: "relative",
                textAlign: "left",
              }}
            >
              {isActive && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 3,
                    height: 20,
                    background: T.accent,
                    borderRadius: "0 2px 2px 0",
                  }}
                />
              )}
              <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>
                {item.icon}
              </span>
              {item.label}
              {item.badge > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: T.accent,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 8,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "16px 20px", borderTop: `1px solid ${T.border}` }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.4px",
            color: T.accent,
            background: T.accentDim,
            marginBottom: 8,
          }}
        >
          {mainGame}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: T.green,
            }}
          />
          <span style={{ color: T.green, fontSize: 12, fontWeight: 600 }}>
            Vizard Connected
          </span>
        </div>
      </div>
    </div>
  );
}
