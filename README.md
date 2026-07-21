# PRISM — CRAF'd Reporting Platform

A web application for collecting, editing and reviewing partner project
reports for the CRAF'd (Complex Risk Analytics Fund) portfolio, and for
presenting the aggregated results in a dashboard. Partners submit narrative
and quantitative reporting (achievements, indicators, work plans, budgets,
risk management, testimonials, etc.); the Secretariat reviews and exports it.

Built with [Next.js](https://nextjs.org) (App Router), React, TypeScript,
Tailwind CSS and a PostgreSQL backend.

## Getting started

### Prerequisites

- Node.js 18+
- A PostgreSQL database (schema in [`db/`](db/) and [`migrations/`](migrations/))

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
```

> **Note:** Do not use the `NEXT_PUBLIC_` prefix for any secret — variables
> with that prefix are embedded in the client bundle and readable by anyone.

### Database

The database uses **two roles**, so the running app never holds admin rights:

- an **owner/admin** account — creates the schema and runs migrations (DDL);
- **`prism_app`** — the least-privilege role the app connects as. It can only
  run DML (SELECT/INSERT/UPDATE/DELETE) inside the `reporting_platform` schema:
  no DDL, no other schemas, not a superuser, cannot create roles or databases.

Provision, as the **owner/admin** account:

1. Apply the SQL files in [`db/`](db/) then [`migrations/`](migrations/) in
   numerical order to create the `reporting_platform` schema.
2. Create and grant the application role. First set the password in
   [`db/roles.sql`](db/roles.sql) (the `\set app_password '…'` line), then:

   ```bash
   psql "<ADMIN connection string>" -f db/roles.sql
   ```

   It is idempotent — re-run it after adding migrations to pick up new tables
   (default privileges also cover future objects automatically). Run it and all
   migrations under the same owner account.

   > The password lives in the file once filled in, so treat `db/roles.sql` as a
   > secret — do not commit the real value (or rotate it afterwards).

Then set `AZURE_POSTGRES_USER=prism_app` (and its password) for the app. Keep
the admin credentials out of the app's environment; use them only to run
migrations.

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
- `db/`, `migrations/` — SQL schema and migrations

## Data

Real reporting data is **not** included in this repository. The
`public/data/` directory is git-ignored because it contains partner data
(personal information, financial figures and internal assessments) that must
not be published. To run the dashboard locally, supply your own data files in
`public/data/dashboard/`.

## License

Released under the [MIT License](LICENSE).
