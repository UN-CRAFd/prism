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
# PostgreSQL connection
AZURE_POSTGRES_HOST=your-db-host
AZURE_POSTGRES_PORT=5432
AZURE_POSTGRES_DB=your-db-name
AZURE_POSTGRES_USER=your-db-user
AZURE_POSTGRES_PASSWORD=your-db-password

# Admin login password (required for the "admin" account).
# There is no default — if this is unset, admin login is disabled.
ADMIN_PASSWORD=choose-a-strong-secret
```

> **Note:** Do not use the `NEXT_PUBLIC_` prefix for any secret — variables
> with that prefix are embedded in the client bundle and readable by anyone.

### Database

Apply the SQL files in [`db/`](db/) then [`migrations/`](migrations/) in
numerical order to provision the `reporting_platform` schema.

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
