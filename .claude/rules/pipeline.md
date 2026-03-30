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

