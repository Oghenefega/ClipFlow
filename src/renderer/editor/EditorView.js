import React, { useEffect } from "react";
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

  // Initialize stores from context on mount (or when context changes)
  useEffect(() => {
    useEditorStore.getState().initFromContext(editorContext, localProjects);
  }, [editorContext, localProjects]);

  return (
    <EditorErrorBoundary>
      <EditorLayout onBack={onBack} gamesDb={gamesDb} anthropicApiKey={anthropicApiKey} requireHashtagInTitle={requireHashtagInTitle} onClipRendered={onClipRendered} />
    </EditorErrorBoundary>
  );
}
