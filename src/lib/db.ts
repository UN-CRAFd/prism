import { Pool } from "pg";

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
