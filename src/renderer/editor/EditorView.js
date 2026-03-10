import React, { useEffect, useRef } from "react";
import useEditorStore from "./stores/useEditorStore";
import EditorShell from "./components/EditorShell";

export default function EditorView({ gamesDb = [], editorContext, localProjects = [], anthropicApiKey = "", onBack }) {
  const initialized = useRef(false);

  // Initialize stores from context on mount (or when context changes)
  useEffect(() => {
    useEditorStore.getState().initFromContext(editorContext, localProjects);
    initialized.current = true;
  }, [editorContext, localProjects]);

  if (!initialized.current && !useEditorStore.getState().clip) return null;

  return <EditorShell onBack={onBack} gamesDb={gamesDb} anthropicApiKey={anthropicApiKey} />;
}
