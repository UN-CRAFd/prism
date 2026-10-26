// Run a .sql migration file against the app's database with an ADMIN account.
//
// The app's own role (prism_app) cannot create tables, so migrations need the
// database admin. Host / port / database are read from .env; the admin
// credentials are passed in separately so they are never written to a file.
//
// PowerShell, from the repo root:
//   $env:PG_ADMIN_USER = "<admin user>"
//   $env:PG_ADMIN_PASSWORD = "<admin password>"
//   node --env-file=.env db/run-sql.mjs db/add-hact-recommendations.sql

import fs from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node --env-file=.env db/run-sql.mjs <file.sql>");
  process.exit(1);
}

const user = process.env.PG_ADMIN_USER;
const password = process.env.PG_ADMIN_PASSWORD;
if (!user || !password) {
  console.error("Set PG_ADMIN_USER and PG_ADMIN_PASSWORD first (the database admin, not prism_app).");
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.AZURE_POSTGRES_HOST,
  port: Number(process.env.AZURE_POSTGRES_PORT || 5432),
  database: process.env.AZURE_POSTGRES_DB,
  user,
  password,
  ssl: { rejectUnauthorized: true },
});

try {
  await client.connect();
  await client.query(fs.readFileSync(file, "utf8"));
  console.log(`OK — ${file} applied to ${process.env.AZURE_POSTGRES_DB}.`);
} catch (err) {
  console.error(`FAILED — ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
