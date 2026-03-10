import React from "react";
import T from "../../styles/theme";
import { BD, S2, S3 } from "../utils/constants";

export default function RenderOverlay({ rendering, renderProgress, renderResult, setRenderResult }) {
  if (!rendering && !renderResult) return null;

  return (
    <div style={{
      position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: T.surface, border: `1px solid ${BD}`, borderRadius: T.radius.lg,
        padding: "32px 40px", maxWidth: 420, width: "100%", textAlign: "center",
      }}>
        {rendering ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <div style={{ color: T.text, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Rendering...</div>
            <div style={{ color: T.textSecondary, fontSize: 13, marginBottom: 16 }}>{renderProgress.detail || "Processing..."}</div>
            <div style={{ height: 6, borderRadius: 3, background: S3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${renderProgress.pct}%`, background: `linear-gradient(90deg, ${T.green}, #2dd4a8)`, borderRadius: 3, transition: "width 0.3s" }} />
            </div>
            <div style={{ color: T.textTertiary, fontSize: 11, fontFamily: T.mono, marginTop: 8 }}>{renderProgress.pct}%</div>
          </>
        ) : renderResult?.success ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ color: T.green, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Render Complete!</div>
            <div style={{ color: T.textSecondary, fontSize: 13, marginBottom: 16, wordBreak: "break-all" }}>{renderResult.path}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                onClick={() => { const folder = renderResult.path.replace(/[/\\][^/\\]+$/, ""); window.clipflow?.openFolder?.(folder); }}
                style={{ padding: "8px 20px", borderRadius: 6, border: `1px solid ${T.greenBorder}`, background: T.greenDim, color: T.green, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
              >📂 Open Folder</button>
              <button
                onClick={() => setRenderResult(null)}
                style={{ padding: "8px 20px", borderRadius: 6, border: `1px solid ${BD}`, background: S2, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
              >Close</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>❌</div>
            <div style={{ color: T.red, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Render Failed</div>
            <div style={{ color: T.textSecondary, fontSize: 13, marginBottom: 16, maxHeight: 120, overflow: "auto", wordBreak: "break-all" }}>{renderResult?.error || "Unknown error"}</div>
            <button
              onClick={() => setRenderResult(null)}
              style={{ padding: "8px 20px", borderRadius: 6, border: `1px solid ${BD}`, background: S2, color: T.textSecondary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font }}
            >Close</button>
          </>
        )}
      </div>
    </div>
  );
}
