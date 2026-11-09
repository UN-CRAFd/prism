// Emergency reset of the shared CRAF'd Secretariat ("admin") password.
//
// For when nobody can sign in as admin any more (password forgotten). The
// website deliberately has no way to do this — recovery needs the DATABASE
// admin credentials, which only IT / the developers hold.
//
// What it does, in one transaction:
//   1. asks for a new password twice (typing is hidden) and checks the rules:
//      at least 8 characters, one uppercase letter, one number, one special
//      character
//   2. stores it as an scrypt hash (same format as the Settings page uses)
//   3. ends every existing admin login (bumps the admin session version)
//   4. clears an admin lock left by too many wrong passwords
//
// PowerShell, from the repo root:
//   $env:PG_ADMIN_USER = "<database admin user>"
//   $env:PG_ADMIN_PASSWORD = "<database admin password>"
//   node --env-file=.env db/reset-admin-password.mjs
//
// The new password is never printed, logged or written to a file. Sign in at
// /login with username "admin" and the new password afterwards.

import { randomBytes, scryptSync } from "node:crypto";
import readline from "node:readline";
import pg from "pg";

const KEY_LEN = 64; // must match src/lib/password.ts

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, KEY_LEN).toString("hex")}`;
}

// Same rules as src/lib/password-policy.ts.
function unmetRules(pw) {
  const unmet = [];
  if (pw.length < 8) unmet.push("at least 8 characters");
  if (!/\p{Lu}/u.test(pw)) unmet.push("an uppercase letter");
  if (!/\p{Nd}/u.test(pw)) unmet.push("a number");
  if (!/[^\p{L}\p{N}\s]/u.test(pw)) unmet.push("a special character (e.g. ! ? @ # -)");
  return unmet;
}

// Read a line without echoing it to the terminal.
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (s) => { if (!muted) write(s); };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

const user = process.env.PG_ADMIN_USER;
const dbPassword = process.env.PG_ADMIN_PASSWORD;
if (!user || !dbPassword) {
  console.error("Set PG_ADMIN_USER and PG_ADMIN_PASSWORD first (the DATABASE admin, not prism_app).");
  process.exit(1);
}
if (!process.env.AZURE_POSTGRES_HOST || !process.env.AZURE_POSTGRES_DB) {
  console.error("Run with --env-file=.env so the database host and name are known.");
  process.exit(1);
}

console.log(`Reset the PRISM admin password on database "${process.env.AZURE_POSTGRES_DB}" (${process.env.AZURE_POSTGRES_HOST}).`);
const pw1 = await askHidden("New admin password: ");
const unmet = unmetRules(pw1);
if (unmet.length) {
  console.error(`Not changed — the password needs ${unmet.join(", ")}.`);
  process.exit(1);
}
const pw2 = await askHidden("Repeat the new password: ");
if (pw1 !== pw2) {
  console.error("Not changed — the two passwords do not match.");
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.AZURE_POSTGRES_HOST,
  port: Number(process.env.AZURE_POSTGRES_PORT || 5432),
  database: process.env.AZURE_POSTGRES_DB,
  user,
  password: dbPassword,
  ssl: { rejectUnauthorized: true },
});

try {
  await client.connect();
  await client.query("BEGIN");
  // 1–2. The new password (Settings → "Change admin password" writes the same row).
  await client.query(
    `INSERT INTO reporting_platform.app_settings (key, value)
     VALUES ('admin_password_hash', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [hashPassword(pw1)]
  );
  // 3. End every existing admin login (src/lib/session-version.ts).
  await client.query(
    `INSERT INTO reporting_platform.app_settings (key, value) VALUES ('admin_session_version', '1')
     ON CONFLICT (key) DO UPDATE
       SET value = ((COALESCE(NULLIF(app_settings.value, ''), '0'))::int + 1)::text`
  );
  // 4. Clear an admin lock, if the login-attempts table exists.
  const lockTable = await client.query(`SELECT to_regclass('reporting_platform.login_attempts') AS t`);
  if (lockTable.rows[0].t) {
    await client.query(`DELETE FROM reporting_platform.login_attempts WHERE key = 'login:admin'`);
  }
  await client.query("COMMIT");
  console.log("OK — the admin password has been reset. Existing admin logins have been ended.");
  console.log('Sign in at /login with username "admin" and the new password.');
  console.log("Note: running servers notice the change within about 10 seconds.");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`FAILED — nothing was changed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
