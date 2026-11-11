import { query } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Monthly package & security check — evaluation and storage.
//
// Two halves come together here:
//   • PACKAGE results (npm audit / npm outdated) — produced by
//     scripts/security-check.mjs, which needs the code and its lock file and
//     runs monthly in GitHub Actions (or by hand), then POSTs them to
//     /api/security-checks/report.
//   • PLATFORM checks — run HERE, inside the app, because only the running
//     server knows its real configuration (secrets set? database safeguards in
//     place?). Nothing secret is ever stored: only "set / not set / too short".
//
// evaluate() turns both into findings with a level:
//   action    → needs immediate action (shown at the top of the Security page)
//   attention → should be fixed soon
//   info      → for the record
// and the run's overall status is the worst level found.
// ─────────────────────────────────────────────────────────────────────────────

export type Level = "action" | "attention" | "info";
export type RunStatus = "ok" | "attention" | "action";

export interface Finding {
  level: Level;
  area: "packages" | "platform";
  title: string;
  detail?: string;
  fix?: string;
}

export interface Vulnerability {
  name: string;
  severity: "critical" | "high" | "moderate" | "low" | "info";
  production: boolean; // false = only in development tools, not the live site
  advisories: string[];
  fix: string | null;
}

export interface OutdatedPackage {
  name: string;
  current: string;
  wanted: string; // newest version allowed by package.json (same major)
  latest: string;
  dev: boolean;
  major: boolean; // latest is a new major version (may need code changes)
}

export interface PackageReport {
  generatedAt: string;
  node?: string;
  npm?: string;
  commit?: string;
  audit: { ok: boolean; error?: string; vulnerabilities: Vulnerability[] };
  outdated: { ok: boolean; error?: string; packages: OutdatedPackage[] };
}

export interface PlatformCheck {
  id: string;
  label: string;
  ok: boolean;
  level: Level; // the level used when not ok
  detail: string;
}

export interface SecurityReport {
  packages: PackageReport | null;
  packagesFrom?: string; // when package results were reused from an earlier run
  platform: PlatformCheck[];
  findings: Finding[];
  counts: { action: number; attention: number; info: number };
}

// ── Validating what the script sends (it comes over the network) ────────────

const SEVERITIES = new Set(["critical", "high", "moderate", "low", "info"]);
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");

export function sanitizePackageReport(raw: unknown): PackageReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const audit = (r.audit ?? {}) as Record<string, unknown>;
  const outdated = (r.outdated ?? {}) as Record<string, unknown>;
  const vulns = Array.isArray(audit.vulnerabilities) ? audit.vulnerabilities.slice(0, 300) : [];
  const pkgs = Array.isArray(outdated.packages) ? outdated.packages.slice(0, 300) : [];
  return {
    generatedAt: str(r.generatedAt, 40) || new Date().toISOString(),
    node: str(r.node, 40) || undefined,
    npm: str(r.npm, 40) || undefined,
    commit: str(r.commit, 60) || undefined,
    audit: {
      ok: audit.ok === true,
      error: str(audit.error) || undefined,
      vulnerabilities: vulns
        .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
        .map((v) => ({
          name: str(v.name, 120),
          severity: (SEVERITIES.has(String(v.severity)) ? v.severity : "info") as Vulnerability["severity"],
          production: v.production === true,
          advisories: (Array.isArray(v.advisories) ? v.advisories : []).slice(0, 10).map((a) => str(a, 200)),
          fix: str(v.fix, 200) || null,
        }))
        .filter((v) => v.name),
    },
    outdated: {
      ok: outdated.ok === true,
      error: str(outdated.error) || undefined,
      packages: pkgs
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
        .map((p) => ({
          name: str(p.name, 120),
          current: str(p.current, 40),
          wanted: str(p.wanted, 40),
          latest: str(p.latest, 40),
          dev: p.dev === true,
          major: p.major === true,
        }))
        .filter((p) => p.name),
    },
  };
}

// ── Platform checks (run inside the app) ─────────────────────────────────────

async function exists(sql: string, params: unknown[] = []): Promise<boolean> {
  try {
    return (await query(sql, params)).length > 0;
  } catch {
    return false;
  }
}

export async function runPlatformChecks(): Promise<PlatformCheck[]> {
  const checks: PlatformCheck[] = [];
  const add = (id: string, label: string, ok: boolean, level: Level, detail: string) =>
    checks.push({ id, label, ok, level, detail });

  // Secrets — only "set / long enough / distinct" is recorded, never values.
  const session = process.env.SESSION_SECRET ?? "";
  const magic = process.env.MAGIC_LINK_SECRET ?? "";
  add("session-secret", "Login signing key (SESSION_SECRET)", session.length >= 32, "action",
    session ? (session.length >= 32 ? "Set." : `Too short (${session.length} characters; use at least 32 random characters).`)
      : "Not set — logins fall back to ADMIN_PASSWORD as the signing key.");
  add("magic-secret", "Share-link signing key (MAGIC_LINK_SECRET)", magic.length >= 32, "action",
    magic ? (magic.length >= 32 ? "Set." : `Too short (${magic.length} characters; use at least 32 random characters).`)
      : "Not set — share links fall back to ADMIN_PASSWORD as the signing key.");
  add("secrets-distinct", "Signing keys are different from each other", !session || !magic || session !== magic, "action",
    session && magic && session === magic ? "SESSION_SECRET and MAGIC_LINK_SECRET are identical." : "OK.");
  add("admin-env-password", "No admin password in the server settings (ADMIN_PASSWORD)", !process.env.ADMIN_PASSWORD, "attention",
    process.env.ADMIN_PASSWORD
      ? "ADMIN_PASSWORD is still set. Once an admin password is saved in Settings, remove it from the server settings."
      : "Not set.");
  add("production-mode", "Running in production mode", process.env.NODE_ENV === "production", "info",
    process.env.NODE_ENV === "production" ? "Yes." : `NODE_ENV is "${process.env.NODE_ENV ?? "unset"}" — these platform results describe a development server, not the live site.`);

  // Database safeguards.
  const adminHash = await exists(`SELECT 1 FROM reporting_platform.app_settings WHERE key = 'admin_password_hash'`);
  add("admin-password-set", "Admin password saved (hashed) in the database", adminHash, "action",
    adminHash ? "Yes." : "No — admin login still relies on the ADMIN_PASSWORD server setting.");

  const plaintext = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM reporting_platform.partners
      WHERE password_hash IS NOT NULL AND password_hash NOT LIKE 'scrypt:%'`
  ).catch(() => [{ n: -1 }]);
  const pt = plaintext[0]?.n ?? -1;
  add("no-plaintext-passwords", "No partner passwords stored in plain text", pt === 0, "action",
    pt === 0 ? "None." : pt > 0 ? `${pt} partner password(s) are stored in plain text — reset them (Partners → Reset password).` : "Could not be checked.");

  const loginAttempts = await exists(`SELECT 1 WHERE to_regclass('reporting_platform.login_attempts') IS NOT NULL`);
  add("migration-login-attempts", "Password-guess limit active", loginAttempts, "action",
    loginAttempts ? "Yes." : "No — run db/add-login-attempts.sql (logins are not limited).");

  const sessionVersions = await exists(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'reporting_platform'
        AND table_name = 'partners' AND column_name = 'session_version'`
  );
  add("migration-session-versions", "Logout on password change active", sessionVersions, "action",
    sessionVersions ? "Yes." : "No — run db/add-session-versions.sql (partner logins survive a password reset).");

  const auditEditable = await query<{ u: boolean; d: boolean }>(
    `SELECT has_table_privilege(current_user, 'reporting_platform.version_log', 'UPDATE') AS u,
            has_table_privilege(current_user, 'reporting_platform.version_log', 'DELETE') AS d`
  ).catch(() => []);
  const editable = auditEditable.length ? auditEditable[0].u || auditEditable[0].d : null;
  add("audit-log-append-only", "Version log cannot be altered by the app", editable === false, "action",
    editable === false ? "Yes (append-only)." : editable ? "The app's database account can change or delete version-log entries — re-run the REVOKE in db/roles.sql." : "Could not be checked.");

  const role = await query<{ s: boolean; r: boolean; d: boolean }>(
    `SELECT rolsuper AS s, rolcreaterole AS r, rolcreatedb AS d FROM pg_roles WHERE rolname = current_user`
  ).catch(() => []);
  const elevated = role.length ? role[0].s || role[0].r || role[0].d : null;
  add("least-privilege-db", "App uses a least-privilege database account", elevated === false, "action",
    elevated === false ? "Yes." : elevated ? "The app connects with an elevated database account — switch it to prism_app (db/roles.sql)." : "Could not be checked.");

  const shortNameUq = await exists(
    `SELECT 1 FROM pg_indexes WHERE schemaname = 'reporting_platform' AND indexname = 'partners_short_name_lower_uq'`
  );
  add("unique-partner-names", "Partner short names are unique (database rule)", shortNameUq, "attention",
    shortNameUq ? "Yes." : "Missing — create the index partners_short_name_lower_uq from db/schema.sql.");

  const oneProdoc = await exists(
    `SELECT 1 FROM pg_indexes WHERE schemaname = 'reporting_platform' AND indexname = 'reports_one_prodoc_per_project'`
  );
  add("one-prodoc-per-project", "One project document per project (database rule)", oneProdoc, "attention",
    oneProdoc ? "Yes." : "Missing — create the index reports_one_prodoc_per_project from db/schema.sql.");

  const locked = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM reporting_platform.login_attempts
      WHERE key LIKE 'login:partner:%' AND locked_until > NOW()`
  ).catch(() => [{ n: 0 }]);
  const nLocked = locked[0]?.n ?? 0;
  add("locked-accounts", "Partner accounts locked after wrong passwords", nLocked === 0, "info",
    nLocked === 0 ? "None." : `${nLocked} account(s) — see the Locked badges on the Partners page.`);

  return checks;
}

// ── Evaluation ───────────────────────────────────────────────────────────────

export function evaluate(pkg: PackageReport | null, platform: PlatformCheck[], packagesFrom?: string): SecurityReport {
  const findings: Finding[] = [];

  if (!pkg) {
    findings.push({
      level: "attention", area: "packages", title: "No package check results",
      detail: "Run scripts/security-check.mjs (scheduled monthly) to check the packages.",
    });
  } else {
    if (!pkg.audit.ok) {
      findings.push({ level: "attention", area: "packages", title: "The vulnerability check could not run", detail: pkg.audit.error });
    }
    const live = pkg.audit.vulnerabilities.filter((v) => v.production);
    const devOnly = pkg.audit.vulnerabilities.filter((v) => !v.production);
    for (const v of live.filter((v) => v.severity === "critical" || v.severity === "high")) {
      findings.push({
        level: "action", area: "packages",
        title: `${v.name}: ${v.severity} vulnerability in a package the live site uses`,
        detail: v.advisories.join(" · ") || undefined,
        fix: v.fix ?? "Run `npm audit fix`, then build and test.",
      });
    }
    const moderate = live.filter((v) => v.severity === "moderate");
    if (moderate.length) {
      findings.push({
        level: "attention", area: "packages",
        title: `${moderate.length} moderate vulnerabilit${moderate.length === 1 ? "y" : "ies"} in live-site packages`,
        detail: moderate.map((v) => v.name).join(", "),
        fix: "Run `npm audit fix` at the next update.",
      });
    }
    const devSerious = devOnly.filter((v) => v.severity === "critical" || v.severity === "high");
    if (devSerious.length) {
      findings.push({
        level: "attention", area: "packages",
        title: `${devSerious.length} serious vulnerabilit${devSerious.length === 1 ? "y" : "ies"} in development tools only`,
        detail: `${devSerious.map((v) => v.name).join(", ")} — not part of the live site, but update them.`,
        fix: "Run `npm audit fix`.",
      });
    }
    if (!pkg.outdated.ok) {
      findings.push({ level: "info", area: "packages", title: "The update check could not run", detail: pkg.outdated.error });
    }
    const next = pkg.outdated.packages.find((p) => p.name === "next");
    if (next && next.wanted && next.current !== next.wanted) {
      findings.push({
        level: "attention", area: "packages",
        title: `Next.js ${next.current} → ${next.wanted} available`,
        detail: "Next.js updates often contain security fixes.",
        fix: `npm install next@${next.wanted} eslint-config-next@${next.wanted}`,
      });
    }
    const minor = pkg.outdated.packages.filter((p) => p.current !== p.wanted && p.name !== "next");
    if (minor.length) {
      findings.push({
        level: "info", area: "packages",
        title: `${minor.length} package update${minor.length === 1 ? "" : "s"} available within the current versions`,
        detail: minor.map((p) => `${p.name} ${p.current} → ${p.wanted}`).join(", "),
        fix: "Run `npm update`, then build and test.",
      });
    }
    const majors = pkg.outdated.packages.filter((p) => p.major);
    if (majors.length) {
      findings.push({
        level: "info", area: "packages",
        title: `${majors.length} new major version${majors.length === 1 ? "" : "s"} (may need code changes)`,
        detail: majors.map((p) => `${p.name} ${p.current} → ${p.latest}`).join(", "),
      });
    }
  }

  for (const c of platform.filter((c) => !c.ok)) {
    findings.push({ level: c.level, area: "platform", title: c.label, detail: c.detail });
  }

  const order: Record<Level, number> = { action: 0, attention: 1, info: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  const counts = {
    action: findings.filter((f) => f.level === "action").length,
    attention: findings.filter((f) => f.level === "attention").length,
    info: findings.filter((f) => f.level === "info").length,
  };
  return { packages: pkg, packagesFrom, platform, findings, counts };
}

export function statusOf(report: SecurityReport): RunStatus {
  return report.counts.action ? "action" : report.counts.attention ? "attention" : "ok";
}

export async function storeRun(source: string, report: SecurityReport): Promise<{ id: number; run_at: string }> {
  const rows = await query<{ id: number; run_at: string }>(
    `INSERT INTO reporting_platform.security_checks (source, status, report)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id, run_at`,
    [source.slice(0, 40), statusOf(report), JSON.stringify(report)]
  );
  return rows[0];
}
