import React from "react";
import T from "../../styles/theme";
import useLayoutStore from "../stores/useLayoutStore";
import { BD, LP_GHOST_W } from "../utils/constants";
import { PanelTab } from "../primitives/editorPrimitives";
import TranscriptPanel from "./TranscriptPanel";
import EditSubsPanel from "./EditSubsPanel";

export default function LeftPanel({ onResizeStart }) {
  const lpTab = useLayoutStore((s) => s.lpTab);
  const lpCollapsed = useLayoutStore((s) => s.lpCollapsed);
  const lpWidth = useLayoutStore((s) => s.lpWidth);
  const setLpTab = useLayoutStore((s) => s.setLpTab);
  const toggleLpCollapse = useLayoutStore((s) => s.toggleLpCollapse);

  if (lpCollapsed) {
    return (
      <div
        onClick={toggleLpCollapse}
        title="Expand panel"
        style={{
          width: LP_GHOST_W, minWidth: LP_GHOST_W, background: T.surface, borderRight: `1px solid ${BD}`,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          color: T.textTertiary, fontSize: 16, transition: "all 0.15s", userSelect: "none",
        }}
      >
        ›
      </div>
    );
  }

  return (
    <div style={{
      width: lpWidth, minWidth: lpWidth, background: T.surface, borderRight: `1px solid ${BD}`,
      display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
    }}>
      {/* Tabs + collapse btn */}
      <div style={{ display: "flex", borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <PanelTab label="Transcript" active={lpTab === "transcript"} onClick={() => setLpTab("transcript")} />
        <PanelTab label="Edit Subtitles" active={lpTab === "editsubs"} onClick={() => setLpTab("editsubs")} />
        <button
          onClick={toggleLpCollapse}
          title="Collapse panel"
          style={{
            marginLeft: "auto", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
            border: "none", background: "transparent", color: T.textTertiary, cursor: "pointer", fontSize: 14,
            borderRadius: 4, alignSelf: "center", marginRight: 6, flexShrink: 0,
          }}
        >
          ‹
        </button>
      </div>

      {/* Content */}
      {lpTab === "transcript" ? <TranscriptPanel /> : <EditSubsPanel />}

      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        style={{
          position: "absolute", top: 0, right: -3, width: 6, height: "100%",
          cursor: "ew-resize", zIndex: 20,
        }}
      />
    </div>
  );
}
