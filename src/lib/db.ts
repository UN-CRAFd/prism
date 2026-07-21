import { Pool, types } from "pg";

// Return DATE (OID 1082) columns as the raw "YYYY-MM-DD" string instead of a JS
// Date. pg would otherwise parse a DATE into a Date at the server's local
// midnight, which JSON-serializes to a UTC timestamp and shifts the day when the
// server isn't UTC — corrupting project_start_date / report dates on round-trip
// and breaking <input type="date"> (which needs a bare YYYY-MM-DD value).
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  host: process.env.AZURE_POSTGRES_HOST,
  port: Number(process.env.AZURE_POSTGRES_PORT) || 5432,
  database: process.env.AZURE_POSTGRES_DB,
  user: process.env.AZURE_POSTGRES_USER,
  password: process.env.AZURE_POSTGRES_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export default pool;
