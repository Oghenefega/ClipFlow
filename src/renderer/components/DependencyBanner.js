import React, { useState, useEffect, useCallback } from "react";
import T from "../styles/theme";

// #251 first-run dependency check. Shows what's missing and what to do about
// it BEFORE the user invests time in a run. Dismissible — the pipeline start
// re-runs the same check in the main process, so closing the banner never
// lets a broken run begin.
// #146: the whisper-python issue gets a "Finish Setup" button that opens the
// AI engine download flow (onFinishSetup, wired in App.js).
export default function DependencyBanner({ onFinishSetup }) {
  const [issues, setIssues] = useState([]);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const runCheck = useCallback(async () => {
    if (!window.clipflow?.checkDependencies) return;
    setChecking(true);
    try {
      const result = await window.clipflow.checkDependencies();
      setIssues(result?.issues || []);
    } catch (_) { /* main not ready — stay quiet */ }
    setChecking(false);
  }, []);

  useEffect(() => { runCheck(); }, [runCheck]);

  if (dismissed || issues.length === 0) return null;

  return (
    <div style={{
      flexShrink: 0,
      padding: "10px 16px",
      background: `${T.yellow}12`,
      borderBottom: `1px solid ${T.yellow}44`,
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      fontSize: 13,
    }}>
      <span style={{ color: T.yellow, fontWeight: 700, lineHeight: "20px" }}>⚠</span>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ color: T.text, fontWeight: 700 }}>
          ClipFlow can't run jobs on this machine yet
        </span>
        {issues.map((issue) => (
          <div key={issue.id} style={{ color: T.textSecondary, fontSize: 12, lineHeight: 1.5 }}>
            <span style={{ color: T.text, fontWeight: 600 }}>{issue.title}.</span>{" "}
            {issue.fix}
          </div>
        ))}
      </div>
      {onFinishSetup && issues.some((i) => i.id === "whisper-python") && (
        <button
          onClick={onFinishSetup}
          style={{
            background: "linear-gradient(180deg, #3aa9ef, #1a4fc4)",
            color: "#fff",
            border: "none",
            padding: "5px 14px",
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          Finish Setup
        </button>
      )}
      <button
        onClick={runCheck}
        disabled={checking}
        style={{
          background: T.accent,
          color: "#fff",
          border: "none",
          padding: "5px 14px",
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          cursor: checking ? "default" : "pointer",
          opacity: checking ? 0.6 : 1,
          flexShrink: 0,
        }}
      >
        {checking ? "Checking…" : "Check again"}
      </button>
      <button
        onClick={() => setDismissed(true)}
        title="Hide — ClipFlow will still refuse to start a job until this is fixed"
        style={{
          background: "transparent",
          color: T.textTertiary,
          border: `1px solid ${T.border}`,
          padding: "5px 10px",
          borderRadius: 4,
          fontSize: 12,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}
