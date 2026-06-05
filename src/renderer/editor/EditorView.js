import React, { useEffect } from "react";
import * as Sentry from "@sentry/electron/renderer";
import useEditorStore from "./stores/useEditorStore";
import EditorLayout from "./components/EditorLayout";

class EditorErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("EditorErrorBoundary caught:", error, info?.componentStack);
    Sentry.captureException(error, { contexts: { react: { componentStack: info?.componentStack } } });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: "#ff6b6b", background: "#1a0000", height: "100%", overflow: "auto", fontFamily: "JetBrains Mono, monospace" }}>
          <h2 style={{ marginBottom: 12 }}>Editor Crash</h2>
          <pre style={{ fontSize: 13, whiteSpace: "pre-wrap", marginBottom: 20 }}>{this.state.error.message}</pre>
          <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", color: "#ff9999" }}>{this.state.error.stack}</pre>
          {this.state.info?.componentStack && (
            <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", color: "#888", marginTop: 16 }}>{this.state.info.componentStack}</pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function EditorView({ gamesDb = [], editorContext, localProjects = [], anthropicApiKey = "", requireHashtagInTitle = true, onBack, onClipRendered }) {
  // Subscribe to clip so component re-renders after initFromContext sets it
  const clip = useEditorStore((s) => s.clip);

  // Initialize stores from context on mount (or when the opened clip changes).
  // Keyed on editorContext ONLY (stable per clip-open). localProjects is a useState
  // array in App.js whose identity changes on every autosave — including it here
  // re-fired this destructive init mid-edit, racing the live load (intermittent empty
  // timeline / saved style snapping back to template default). localProjects is only a
  // rare fallback inside initFromContext, so a stale closure value is acceptable.
  useEffect(() => {
    useEditorStore.getState().initFromContext(editorContext, localProjects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorContext]);

  return (
    <EditorErrorBoundary>
      <EditorLayout onBack={onBack} gamesDb={gamesDb} anthropicApiKey={anthropicApiKey} requireHashtagInTitle={requireHashtagInTitle} onClipRendered={onClipRendered} />
    </EditorErrorBoundary>
  );
}
