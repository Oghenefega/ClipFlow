---
paths:
  - "src/renderer/editor/**"
---

# Editor Rules

- Reference screenshots live in `/reference/vizard-ref/`. Before building/modifying any editor UI section, read the corresponding reference folder — look at every screenshot and read notes.txt before writing code.
- Build one section at a time.
- Editor uses shadcn/ui + Tailwind CSS (not inline styles like the main views).
- 6 Zustand stores — always subscribe with selectors for re-render control. Never use `getState()` in render paths.
