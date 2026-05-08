import React, { useState, useEffect } from "react";
import T from "../styles/theme";

export default function UpdateBanner() {
  const [info, setInfo] = useState(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (window.clipflow?.profile === "dev") return; // banner is for daily only
    if (!window.clipflow?.checkForUpdate) return;
    window.clipflow.checkForUpdate().then((result) => {
      if (result?.available) setInfo(result);
    }).catch(() => {});
  }, []);

  if (!info) return null;

  const handleInstall = async () => {
    setInstalling(true);
    await window.clipflow.installUpdate(info.installerPath);
  };

  return (
    <div style={{
      flexShrink: 0,
      padding: "8px 16px",
      background: `linear-gradient(135deg, ${T.accent}22, ${T.accentLight}22)`,
      borderBottom: `1px solid ${T.accentBorder}`,
      display: "flex",
      alignItems: "center",
      gap: 12,
      fontSize: 13,
    }}>
      <span style={{ color: T.accentLight, fontWeight: 700 }}>↑</span>
      <span style={{ color: T.text, flex: 1 }}>
        Update available — <strong>{info.newVersion}</strong> (current: {info.current})
      </span>
      <button
        onClick={handleInstall}
        disabled={installing}
        style={{
          background: T.accent,
          color: "#fff",
          border: "none",
          padding: "5px 14px",
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          cursor: installing ? "default" : "pointer",
          opacity: installing ? 0.6 : 1,
        }}
      >
        {installing ? "Installing…" : "Install"}
      </button>
      <button
        onClick={() => setInfo(null)}
        disabled={installing}
        style={{
          background: "transparent",
          color: T.textTertiary,
          border: `1px solid ${T.border}`,
          padding: "5px 14px",
          borderRadius: 4,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Later
      </button>
    </div>
  );
}
