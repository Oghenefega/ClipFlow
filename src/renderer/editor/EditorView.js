import React, { useEffect } from "react";
import useEditorStore from "./stores/useEditorStore";
import EditorShell from "./components/EditorShell";

export default function EditorView({ gamesDb = [], editorContext, localProjects = [], anthropicApiKey = "", onBack }) {
  // Subscribe to clip so component re-renders after initFromContext sets it
  const clip = useEditorStore((s) => s.clip);

  // Initialize stores from context on mount (or when context changes)
  useEffect(() => {
    useEditorStore.getState().initFromContext(editorContext, localProjects);
  }, [editorContext, localProjects]);

  // Show nothing until clip is loaded (EditorShell handles "no clip" state itself)
  return <EditorShell onBack={onBack} gamesDb={gamesDb} anthropicApiKey={anthropicApiKey} />;
}
