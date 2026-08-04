import { Pool, types } from "pg";
import fs from "node:fs";

// Return DATE (OID 1082) columns as the raw "YYYY-MM-DD" string instead of a JS
// Date. pg would otherwise parse a DATE into a Date at the server's local
// midnight, which JSON-serializes to a UTC timestamp and shifts the day when the
// server isn't UTC — corrupting project_start_date / report dates on round-trip
// and breaking <input type="date"> (which needs a bare YYYY-MM-DD value).
types.setTypeParser(1082, (v) => v);

// The app connects with the least-privilege `prism_app` role — DML only, scoped
// to the reporting_platform schema, never superuser/owner (see db/roles.sql).
// AZURE_POSTGRES_USER / AZURE_POSTGRES_PASSWORD MUST point at that role, not a
// database admin. Schema creation and migrations use a separate admin account
// and never go through this pool (the app performs no DDL at runtime).
// Verify the server's TLS certificate. `rejectUnauthorized: false` (the old
// setting) accepted ANY certificate, leaving the DB connection open to a
// man-in-the-middle who could read/rewrite every query and credential. Azure
// Database for PostgreSQL Flexible Server presents a chain rooted at
// "DigiCert Global Root G2", which is in Node's bundled trust store, so plain
// verification against the system CAs works with no extra config. If a specific
// CA must be pinned (e.g. a private/rotated root), point AZURE_POSTGRES_CA_CERT
// at a PEM file and it is used as the sole trusted root.
const caCertPath = process.env.AZURE_POSTGRES_CA_CERT;
const ssl: { rejectUnauthorized: true; ca?: string } = { rejectUnauthorized: true };
if (caCertPath) {
  ssl.ca = fs.readFileSync(caCertPath, "utf8");
}

const pool = new Pool({
  host: process.env.AZURE_POSTGRES_HOST,
  port: Number(process.env.AZURE_POSTGRES_PORT) || 5432,
  database: process.env.AZURE_POSTGRES_DB,
  user: process.env.AZURE_POSTGRES_USER,
  password: process.env.AZURE_POSTGRES_PASSWORD,
  ssl,
  max: 5,
  // Labels connections in pg_stat_activity / audit logs as the app.
  application_name: "crafd-reporting-app",
});

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export default pool;
