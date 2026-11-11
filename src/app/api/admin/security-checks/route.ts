import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { evaluate, runPlatformChecks, statusOf, storeRun, type SecurityReport } from "@/lib/security-check";

// Admin Security page.
//   GET  → { available, latest: { id, runAt, source, status, report } | null,
//            history: [{ id, runAt, source, status, counts }] }   (last 12 runs)
//   POST → re-run the PLATFORM checks now (e.g. after running a migration), with
//          the package results of the latest run carried over and labelled as
//          such. Package checks themselves need scripts/security-check.mjs.

type Row = { id: number; run_at: string; source: string; status: string; report: SecurityReport };

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  try {
    const exists = await query(`SELECT 1 WHERE to_regclass('reporting_platform.security_checks') IS NOT NULL`);
    if (!exists.length) return NextResponse.json({ available: false, latest: null, history: [] });
    const rows = await query<Row>(
      `SELECT id, run_at, source, status, report
         FROM reporting_platform.security_checks
        ORDER BY run_at DESC
        LIMIT 12`
    );
    const latest = rows[0]
      ? { id: rows[0].id, runAt: rows[0].run_at, source: rows[0].source, status: rows[0].status, report: rows[0].report }
      : null;
    const history = rows.map((r) => ({
      id: r.id, runAt: r.run_at, source: r.source, status: r.status, counts: r.report?.counts ?? null,
    }));
    return NextResponse.json({ available: true, latest, history });
  } catch (err) {
    logger.error("GET /api/admin/security-checks error:", err);
    return NextResponse.json({ error: "Failed to load the security checks" }, { status: 500 });
  }
}

export async function POST() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  try {
    const last = await query<{ run_at: string; report: SecurityReport }>(
      `SELECT run_at, report FROM reporting_platform.security_checks
        WHERE report->'packages' IS NOT NULL AND report->>'packages' <> 'null'
        ORDER BY run_at DESC LIMIT 1`
    );
    const packages = last[0]?.report?.packages ?? null;
    const report = evaluate(packages, await runPlatformChecks(), packages ? String(last[0].run_at) : undefined);
    const run = await storeRun("manual-platform", report);
    return NextResponse.json({ ok: true, id: run.id, status: statusOf(report) });
  } catch (err) {
    logger.error("POST /api/admin/security-checks error:", err);
    return NextResponse.json(
      { error: "Could not run the checks. Has db/add-security-checks.sql been run?" },
      { status: 500 }
    );
  }
}
