# Archived migration history — **do not replay**

These SQL files are kept for historical reference only. **They are not a
replayable migration chain and must never be run against a database**, fresh or
existing.

## Why they can't be replayed

The project's schema drifted away from what these files describe:

- **Colliding / duplicated numbers.** `db-incremental/` contains two `003_*`
  files and two `007_*` files, and its `013`–`017` are *different* changes from
  the `migrations/` `013`–`017`. There is no single defensible apply order.
- **Lost migrations.** Several columns and tables the code depends on
  (`partners.short_name` / `long_name`, `projects.short_name`, the `overview`
  and `surveys` tables) were added directly to the database and never captured
  as a migration here.
- **Superseded steps.** Later migrations rename or drop what earlier ones create
  (e.g. `intermediate` → `outcome`, the legacy `indicators` tables replaced by
  `018`). Replaying the chain would recreate objects the current schema no
  longer has.

## The canonical source of truth

Fresh setup uses the two files in the parent `db/` directory, in this order:

1. **`db/schema.sql`** — the consolidated, idempotent schema. Running this one
   file against a fresh database reproduces the exact current state, with the
   drift above folded back in. Safe to re-run.
2. **`db/roles.sql`** — provisions the least-privilege `prism_app` application
   role. Run once, as the schema owner/admin, after the schema exists.
3. *(optional)* **`db/indicators_seed.sql`** — reference indicator seed data.

See the repository `README.md` (Database setup) for the full procedure.

## Layout

- `db-incremental/` — the original `db/001`–`017` incremental files.
- `migrations/` — the original `migrations/013`–`044` files.
