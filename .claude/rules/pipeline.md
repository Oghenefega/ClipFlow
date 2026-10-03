---
paths:
  - "src/main/**"
---

# Pipeline & Backend Rules

## Schema migrations

A change to the shape of data already stored in electron-store needs a boot migration (old → new) in `runStoreMigrations()` in `src/main/main.js`, written as part of the same change. It must also run cleanly on a fresh install, where the old data doesn't exist; test both. A new key that reads safely when absent (its default covers it) needs no migration.

