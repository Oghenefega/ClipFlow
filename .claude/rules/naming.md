---
paths:
  - "src/renderer/views/RenameView.js"
  - "src/renderer/views/UploadView.js"
  - "src/main/main.js"
---

# File Naming Convention

OBS outputs: `2026-03-03 18-23-40.mp4` (may have `_` instead of space, may end `-vertical.mp4`)

ClipFlow renames to: `2026-03-03 AR Day25 Pt1.mp4`
- Date from original filename
- Tag = 1-4 char game code (e.g., AR, RL, VAL)
- Day = unique calendar day count for this game
- Pt = sequential part within same day's session (OBS splits ~30 min)

Files organized into monthly subfolders: `2026-03/`, `2026-02/`, etc.
