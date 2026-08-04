# PRISM — CRAF'd Reporting Platform

A reporting web application for collecting, editing and reviewing partner project
reports for the CRAF'd (Complex Risk Analytics Fund) portfolio, and for
presenting the aggregated results in a dashboard. Partners submit narrative
and quantitative reporting (achievements, indicators, work plans, budgets,
risk management, testimonials, etc.); the Secretariat reviews and exports it.

Built with the package [Next.js](https://nextjs.org) (App Router), React, TypeScript,
Tailwind CSS and a PostgreSQL backend.

## Getting started

### Prerequisites

- Node.js 20.9+ (required by Next.js 16)
- A PostgreSQL database (canonical schema in [`db/schema.sql`](db/schema.sql))

### Install

```bash
npm install
```

### Configure environment

Create a `.env.local` file in the project root (it is git-ignored):

```bash
# PostgreSQL connection — MUST be the least-privilege application role
# (prism_app), NOT a database admin/owner. See "Database" below.
AZURE_POSTGRES_HOST=your-db-host
AZURE_POSTGRES_PORT=5432
AZURE_POSTGRES_DB=your-db-name
AZURE_POSTGRES_USER=prism_app
AZURE_POSTGRES_PASSWORD=the-prism_app-password

# Admin login password (required for the "admin" account).
# There is no default — if this is unset, admin login is disabled.
ADMIN_PASSWORD=choose-a-strong-secret

# Secret used to sign the session cookie (HMAC-SHA256). Strongly recommended.
# If unset, the app falls back to ADMIN_PASSWORD so it keeps working with no
# new config — but then rotating ADMIN_PASSWORD invalidates all live sessions.
# Set a dedicated, high-entropy value (e.g. `openssl rand -hex 32`).
SESSION_SECRET=a-long-random-string
```

> **Note:** Do not use the `NEXT_PUBLIC_` prefix for any secret — variables
> with that prefix are embedded in the client bundle and readable by anyone.

### Authentication & authorization

Every `/api/*` data route requires an authenticated session (an httpOnly,
signed `crafd_session` cookie); Edge middleware rejects unauthenticated
requests before they reach a handler. Beyond that, routes enforce **ownership**:
a partner may only read or mutate resources belonging to their own
organization, while the admin account bypasses ownership. Cross-tenant
operations (portfolio-wide listings, bulk CSV import, the full-portfolio ZIP
export) are admin-only.

### Database

The database uses **two roles**, so the running app never holds admin rights:

- an **owner/admin** account — creates the schema and runs migrations (DDL);
- **`prism_app`** — the least-privilege role the app connects as. It can only
  run DML (SELECT/INSERT/UPDATE/DELETE) inside the `reporting_platform` schema:
  no DDL, no other schemas, not a superuser, cannot create roles or databases.

Provision, as the **owner/admin** account:

1. Apply [`db/schema.sql`](db/schema.sql) to create the `reporting_platform`
   schema. This single, idempotent file is the **canonical** source of truth and
   reproduces the exact current schema on a fresh database:

   ```bash
   psql "<ADMIN connection string>" -f db/schema.sql
   ```

   > The old incremental files under [`db/archive/`](db/archive/) (the original
   > `db/001`–`017` and `migrations/013`–`044`) are kept for history only and are
   > **not replayable** — the schema drifted past them. Never run them. See
   > [`db/archive/README.md`](db/archive/README.md).

2. Create and grant the application role. First set the password in
   [`db/roles.sql`](db/roles.sql) (replace the `<REPLACE WITH STRONG PASSWORD>`
   literal in the `ALTER ROLE prism_app PASSWORD …` line), then:

   ```bash
   psql "<ADMIN connection string>" -f db/roles.sql
   ```

   It is idempotent — re-run it after any schema change to pick up new tables
   (default privileges also cover future objects automatically). Run it and
   `db/schema.sql` under the same owner account.

   > The password lives in the file once filled in, so treat `db/roles.sql` as a
   > secret — do not commit the real value (or rotate it afterwards).

Then set `AZURE_POSTGRES_USER=prism_app` (and its password) for the app. Keep
the admin credentials out of the app's environment; use them only to apply
schema changes.

### Run

```bash
npm run dev      # start the dev server at http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run lint     # lint
```

## Project structure

- `src/app/` — Next.js routes (`admin/`, `partner/`, `api/`, `login/`)
- `src/components/` — UI and feature components
- `src/lib/` — data access (`db.ts`), auth, domain logic (risk, indicators,
  expenditure, workplan), and UI labels (`labels.json`)
- `db/` — canonical `schema.sql` + `roles.sql` (with archived legacy history
  under `db/archive/`)

## Data

Real reporting data is **not** included in this repository — it lives entirely
in the PostgreSQL database, which the app reads and writes at runtime. There are
no data files to place on disk. The `public/data/` path remains git-ignored as a
safety net so partner data (personal information, financial figures and internal
assessments) can never be committed or served as a static asset.

## License

Released under the [MIT License](LICENSE).
