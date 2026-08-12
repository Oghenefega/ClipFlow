import React from "react";
import T from "../styles/theme";

// #244: persistent banner for scheduled-publish failures. The scheduler fires
// while the user isn't looking — a queue-card error state isn't enough, so
// failures raise this app-level banner that stays until acknowledged.
// Controlled by App: QueueView's scheduler reports failures up, Review jumps
// to the Queue filtered to failed clips.
export default function PublishFailureBanner({ alerts, onReview, onDismiss }) {
  if (!alerts || alerts.length === 0) return null;

  const first = alerts[0];
  const message = alerts.length === 1
    ? `Scheduled publish failed: "${first.clipTitle}" didn't go out on ${first.platforms.join(", ")}.`
    : `${alerts.length} scheduled publishes failed — some clips didn't go out.`;

  return (
    <div style={{
      flexShrink: 0,
      padding: "10px 16px",
      background: `${T.red}12`,
      borderBottom: `1px solid ${T.red}44`,
      display: "flex",
      alignItems: "center",
      gap: 12,
      fontSize: 13,
    }}>
      <span style={{ color: T.red, fontWeight: 700, lineHeight: "20px" }}>⚠</span>
      <div style={{ flex: 1, minWidth: 0, color: T.text, fontWeight: 700 }}>
        {message}
        <span style={{ color: T.textSecondary, fontWeight: 500, marginLeft: 8, fontSize: 12 }}>
          Reconnect the account if prompted, then retry from the Queue.
        </span>
      </div>
      <button
        onClick={onReview}
        style={{
          background: T.accent,
          color: "#fff",
          border: "none",
          padding: "5px 14px",
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Review
      </button>
      <button
        onClick={onDismiss}
        title="Dismiss — failed clips stay visible in the Queue"
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
