---
paths:
  - "src/renderer/editor/**"
---

# Editor Rules

- Reference screenshots and notes for the editor's panels live in `reference/vizard-ref/` (one folder per panel, each with a `* notes.txt`). Check the matching folder before building or reshaping a panel's UI.
- Editor uses shadcn/ui + Tailwind CSS (not inline styles like the main views).
- 6 Zustand stores — always subscribe with selectors for re-render control. Never use `getState()` in render paths.
