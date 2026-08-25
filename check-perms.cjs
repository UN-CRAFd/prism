// One-off script: verify prism_app has access to expenditure_budget_category_notes.
// Connects using the app role credentials from .env (never prompts for a password).
// Usage: node check-perms.cjs

const fs = require("fs");
const path = require("path");

// Parse .env without a dependency — simple KEY=VALUE, ignores comments/blanks.
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

const c = new (require("pg").Client)({
  host:     env.AZURE_POSTGRES_HOST,
  port:     Number(env.AZURE_POSTGRES_PORT) || 6432,
  database: env.AZURE_POSTGRES_DB,
  user:     env.AZURE_POSTGRES_USER,
  password: env.AZURE_POSTGRES_PASSWORD,
  ssl: { rejectUnauthorized: true },
});

(async () => {
  try {
    await c.connect();
    console.log(`Connected as: ${env.AZURE_POSTGRES_USER}\n`);

    // 1. Check information_schema.table_privileges.
    const privs = await c.query(
      `SELECT grantee, privilege_type, is_grantable
         FROM information_schema.table_privileges
        WHERE table_schema = 'reporting_platform'
          AND table_name   = 'expenditure_budget_category_notes'
        ORDER BY grantee, privilege_type`
    );
    console.log("=== table_privileges for expenditure_budget_category_notes ===");
    if (privs.rows.length === 0) {
      console.log("  (no rows — table may not exist or no privileges granted)");
    } else {
      privs.rows.forEach((r) =>
        console.log(`  grantee=${r.grantee}  privilege=${r.privilege_type}  grantable=${r.is_grantable}`)
      );
    }

    // 2. Try a live SELECT against the table.
    console.log("\n=== SELECT * FROM reporting_platform.expenditure_budget_category_notes LIMIT 1 ===");
    const sel = await c.query(
      "SELECT * FROM reporting_platform.expenditure_budget_category_notes LIMIT 1"
    );
    if (sel.rows.length === 0) {
      console.log("  (table is empty — SELECT succeeded, no rows returned)");
    } else {
      console.log("  row:", sel.rows[0]);
    }
  } catch (e) {
    console.error("\nFAILED:", e.message);
    process.exitCode = 1;
  } finally {
    try { await c.end(); } catch {}
  }
})();
