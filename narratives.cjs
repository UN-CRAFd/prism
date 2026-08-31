// One-off read: how many distinct descriptions exist per narrative key.
// Usage: node narratives.cjs
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const env = {};
fs.readFileSync(path.join(__dirname, ".env"), "utf8")
  .split("\n")
  .forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = val;
  });

const c = new Client({
  host: env.AZURE_POSTGRES_HOST,
  port: 5432,
  database: env.AZURE_POSTGRES_DB,
  user: env.AZURE_POSTGRES_USER,
  password: env.AZURE_POSTGRES_PASSWORD,
  ssl: { rejectUnauthorized: true },
});

(async () => {
  await c.connect();
  const r = await c.query(`
SELECT narrative_key, COUNT(*) FILTER (WHERE description IS NOT NULL) AS with_description
FROM reporting_platform.project_narratives
GROUP BY narrative_key ORDER BY narrative_key;
  `);
  console.table(r.rows);
  await c.end();
})();