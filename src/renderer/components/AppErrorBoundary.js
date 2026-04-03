import React from "react";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Wrap in try-catch so Sentry failures don't cascade
    try {
      const Sentry = require("@sentry/electron/renderer");
      Sentry.captureException(error, { contexts: { react: { componentStack: info?.componentStack } } });
    } catch (_) {}
    console.error("[AppErrorBoundary] Caught:", error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      // Minimal inline render — no external dependencies, no font assumptions
      return (
        <div style={{ padding: 48, color: "#ff6b6b", background: "#0a0b10", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "monospace, sans-serif", textAlign: "center" }}>
          <h1 style={{ fontSize: 24, marginBottom: 12, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#888", marginBottom: 24, maxWidth: 480 }}>
            ClipFlow encountered an unexpected error. The crash has been reported automatically.
          </p>
          <pre style={{ fontSize: 12, color: "#ff9999", whiteSpace: "pre-wrap", maxWidth: 600, marginBottom: 24, fontFamily: "monospace", textAlign: "left", maxHeight: 200, overflow: "auto" }}>
            {String(this.state.error?.message || this.state.error || "Unknown error")}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "10px 24px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 600 }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
