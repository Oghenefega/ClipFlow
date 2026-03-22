---
paths:
  - "src/main/**"
---

# Pipeline & Backend Rules

## Schema Migrations (HARD RULE)

Every data structure change in electron-store requires a migration function. No exceptions.

- Write the migration BEFORE changing anything else
- Never modify stored data shapes without a migration path (old → new)
- Migrations go in `src/main/main.js` near store initialization
- Each migration must handle fresh installs (old data doesn't exist)
- Test against both fresh installs and existing data

## OBS Log Parsing

- Logs at: `C:\Users\IAmAbsolute\AppData\Roaming\obs-studio\logs\`
- Vertical Canvas plugin logs differ from standard OBS
- When a game exe re-hooks, it moves to END of detection list (most recent = active)
- Known system processes (explorer.exe, steamwebhelper.exe, dwm.exe, etc.) are ignored
- Unknown exe triggers AddGame modal
