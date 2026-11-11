// Monthly package & security check for PRISM.
//
// 1. Checks the installed packages against known vulnerabilities (npm audit)
//    — separately for packages the live site uses and development-only tools.
// 2. Lists available updates (npm outdated).
// 3. Sends the results to PRISM, which adds its own platform checks (secrets,
//    database safeguards) and stores everything for the admin "Security" page,
//    including what needs immediate action.
//
// Runs automatically on the 1st of every month via
// .github/workflows/monthly-security-check.yml, and can be run by hand from the
// repo root (after `npm install`):
//
//   PowerShell:
//     $env:PRISM_URL = "https://<your PRISM address>"        # or http://localhost:3000
//     $env:SECURITY_CHECK_TOKEN = "<the same token as on the server>"
//     node scripts/security-check.mjs
//
// Without PRISM_URL / SECURITY_CHECK_TOKEN it only prints the results.
// Nothing secret is sent: only package names, versions and advisories.

import { spawnSync } from "node:child_process";

function run(cmd) {
  // shell: true so npm(.cmd) resolves on Windows too. npm audit / outdated exit
  // non-zero when they FIND something — that is not an error here.
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status };
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

const major = (v) => Number(String(v ?? "").replace(/^[^\d]*/, "").split(".")[0]);

// ── npm audit ────────────────────────────────────────────────────────────────
function audit() {
  const all = parseJson(run("npm audit --json").stdout);
  const prod = parseJson(run("npm audit --omit=dev --json").stdout);
  if (!all || !all.vulnerabilities) {
    return { ok: false, error: "npm audit returned no usable result (is the lock file present?)", vulnerabilities: [] };
  }
  const prodNames = new Set(Object.keys(prod?.vulnerabilities ?? {}));
  const vulnerabilities = Object.entries(all.vulnerabilities).map(([name, v]) => {
    const advisories = (v.via ?? [])
      .filter((x) => typeof x === "object" && x.title)
      .map((x) => x.title);
    let fix = null;
    if (v.fixAvailable === true) fix = "npm audit fix";
    else if (v.fixAvailable && typeof v.fixAvailable === "object") {
      fix = `npm install ${v.fixAvailable.name}@${v.fixAvailable.version}` +
        (v.fixAvailable.isSemVerMajor ? " (major update — test carefully)" : "");
    } else fix = "No fix released yet — check again next month";
    return { name, severity: v.severity, production: prodNames.has(name), advisories: [...new Set(advisories)], fix };
  });
  const order = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
  vulnerabilities.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || Number(b.production) - Number(a.production));
  return { ok: true, vulnerabilities };
}

// ── npm outdated ─────────────────────────────────────────────────────────────
function outdated() {
  const r = run("npm outdated --json --long");
  const data = parseJson(r.stdout || "{}");
  if (!data) return { ok: false, error: "npm outdated returned no usable result", packages: [] };
  const packages = Object.entries(data).map(([name, p]) => ({
    name,
    current: p.current ?? "not installed",
    wanted: p.wanted ?? "",
    latest: p.latest ?? "",
    dev: p.type === "devDependencies",
    major: !!p.current && !!p.latest && major(p.latest) > major(p.current),
  }));
  packages.sort((a, b) => Number(a.dev) - Number(b.dev) || a.name.localeCompare(b.name));
  return { ok: true, packages };
}

// ── Run ──────────────────────────────────────────────────────────────────────
console.log("PRISM security check — checking packages…");
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  npm: run("npm --version").stdout.trim(),
  commit: process.env.GITHUB_SHA || run("git rev-parse HEAD").stdout.trim() || undefined,
  audit: audit(),
  outdated: outdated(),
};

const vulns = report.audit.vulnerabilities;
const live = vulns.filter((v) => v.production);
const serious = live.filter((v) => v.severity === "critical" || v.severity === "high");
console.log(`  Vulnerabilities: ${vulns.length} total, ${live.length} in live-site packages (${serious.length} critical/high).`);
for (const v of serious) console.log(`    ! ${v.name} (${v.severity}) — ${v.fix}`);
console.log(`  Updates available: ${report.outdated.packages.length} package(s).`);
if (!report.audit.ok) console.log(`  ! ${report.audit.error}`);

const url = process.env.PRISM_URL?.replace(/\/+$/, "");
const token = process.env.SECURITY_CHECK_TOKEN;
if (!url || !token) {
  console.log("\nPRISM_URL / SECURITY_CHECK_TOKEN not set — results were NOT sent to PRISM.");
  console.log("Full package report:\n" + JSON.stringify(report, null, 2));
  process.exit(serious.length ? 2 : 0);
}

const source = process.env.SECURITY_CHECK_SOURCE || "manual";
try {
  const res = await fetch(`${url}/api/security-checks/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ source, packages: report }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`\nFAILED to store the results in PRISM (${res.status}): ${data.error ?? "unknown error"}`);
    process.exit(1);
  }
  const label = { ok: "All checks passed", attention: "Some items need attention", action: "IMMEDIATE ACTION REQUIRED" }[data.status] ?? data.status;
  console.log(`\nStored in PRISM: ${label}.`);
  if (data.counts) console.log(`  ${data.counts.action} action · ${data.counts.attention} attention · ${data.counts.info} info`);
  console.log("  Details: Admin → Security.");
  // A non-zero exit makes the scheduled GitHub run show as failed (and GitHub
  // e-mails the repository owners) when immediate action is needed.
  process.exit(data.status === "action" ? 2 : 0);
} catch (err) {
  console.error(`\nFAILED to reach PRISM at ${url}: ${err.message}`);
  process.exit(1);
}
