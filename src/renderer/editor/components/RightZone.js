import React from "react";
import T from "../../styles/theme";
import useLayoutStore from "../stores/useLayoutStore";
import AIToolsDrawer from "./AIToolsDrawer";
import SubtitlesDrawer from "./SubtitlesDrawer";
import CaptionDrawer from "./CaptionDrawer";
import BrandDrawer from "./BrandDrawer";
import MediaDrawer from "./MediaDrawer";
import { BD, RAIL_ITEMS, PANEL_LABELS } from "../utils/constants";

export default function RightZone({ onDrawerResizeStart, gamesDb, anthropicApiKey }) {
  const drawerOpen = useLayoutStore((s) => s.drawerOpen);
  const activePanel = useLayoutStore((s) => s.activePanel);
  const drawerWidth = useLayoutStore((s) => s.drawerWidth);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const setDrawerOpen = useLayoutStore((s) => s.setDrawerOpen);

  const renderDrawerContent = () => {
    switch (activePanel) {
      case "ai": return <AIToolsDrawer gamesDb={gamesDb} anthropicApiKey={anthropicApiKey} />;
      case "subs": return <SubtitlesDrawer />;
      case "head": return <CaptionDrawer />;
      case "brand": return <BrandDrawer />;
      case "media": return <MediaDrawer />;
      default: return (
        <div style={{ padding: 20, textAlign: "center", color: T.textTertiary, fontSize: 12 }}>
          {activePanel.charAt(0).toUpperCase() + activePanel.slice(1)} panel — coming soon
        </div>
      );
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "stretch", borderLeft: `1px solid ${BD}`, position: "relative" }}>
      {/* Drawer */}
      {drawerOpen && (
        <div style={{
          width: drawerWidth, overflow: "hidden", background: T.surface,
          display: "flex", flexDirection: "column", borderRight: `1px solid ${BD}`, position: "relative",
        }}>
          {/* Drawer resize handle */}
          <div
            onMouseDown={onDrawerResizeStart}
            style={{ position: "absolute", top: 0, left: 0, width: 5, height: "100%", cursor: "ew-resize", zIndex: 30 }}
          />

          {/* Drawer header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 14px", borderBottom: `1px solid ${BD}`, flexShrink: 0, minWidth: 260,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{PANEL_LABELS[activePanel]}</span>
            <button
              onClick={() => setDrawerOpen(false)}
              style={{
                width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", background: "transparent", color: T.textSecondary, cursor: "pointer",
                borderRadius: 4, fontSize: 13,
              }}
            >✕</button>
          </div>

          {/* Drawer body */}
          <div style={{ flex: 1, overflowY: "auto", minWidth: 260 }}>
            {renderDrawerContent()}
          </div>
        </div>
      )}

      {/* Rail */}
      <div style={{
        width: 80, minWidth: 80, background: T.surface,
        display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0", gap: 2,
      }}>
        {RAIL_ITEMS.map((item, i) => {
          const prevGroup = i > 0 ? RAIL_ITEMS[i - 1].group : item.group;
          return (
            <React.Fragment key={item.id}>
              {i > 0 && item.group !== prevGroup && (
                <div style={{ width: 50, height: 1, background: BD, margin: "4px 0" }} />
              )}
              <button
                onClick={() => togglePanel(item.id)}
                style={{
                  width: 70, minHeight: 54, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 4, borderRadius: 5, cursor: "pointer",
                  background: activePanel === item.id && drawerOpen ? T.accentDim : "transparent",
                  color: activePanel === item.id && drawerOpen ? T.accentLight : T.textSecondary,
                  fontSize: 10, fontWeight: 500, textAlign: "center", padding: "6px 4px",
                  border: "none", fontFamily: T.font, userSelect: "none", transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
