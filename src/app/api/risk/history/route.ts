import { NextRequest, NextResponse } from "next/server";
import { requireSession, guardReport } from "@/lib/authz";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  const gate = await guardReport(session, reportId);
  if (gate) return gate;

  try {
    const reportRows = await query<{ project_id: number; year: number; risk_shared_years: number[] }>(
      `SELECT project_id, year, risk_shared_years FROM reporting_platform.reports WHERE id = $1`,
      [reportId]
    );
    if (!reportRows.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const { project_id, year: currentYear, risk_shared_years } = reportRows[0];
    const sharedSet = new Set<number>(risk_shared_years ?? []);
    const isAdmin = session.role === "admin";

    // ProDoc baseline values keyed by origin_risk_id
    const prodocRows = await query<{ origin_risk_id: number; likelihood: number | null; impact: number | null }>(
      `SELECT rm.origin_risk_id, rm.likelihood, rm.impact
         FROM reporting_platform.risk_management rm
         JOIN reporting_platform.reports pd ON pd.id = rm.report_id AND pd.data_type = 'prodoc'
        WHERE pd.project_id = $1 AND rm.origin_risk_id IS NOT NULL`,
      [project_id]
    );
    const prodoc: Record<number, { likelihood: number | null; impact: number | null }> = {};
    for (const row of prodocRows) {
      prodoc[row.origin_risk_id] = { likelihood: row.likelihood, impact: row.impact };
    }

    // Past report years: updated values keyed by (year, origin_risk_id)
    const historyRows = await query<{
      year: number;
      origin_risk_id: number;
      likelihood: number | null;
      impact: number | null;
    }>(
      `SELECT r.year, rm.origin_risk_id,
              rm.updated_likelihood AS likelihood,
              rm.updated_impact     AS impact
         FROM reporting_platform.risk_management rm
         JOIN reporting_platform.reports r ON r.id = rm.report_id AND r.data_type = 'report'
        WHERE r.project_id = $1 AND r.year < $2 AND rm.origin_risk_id IS NOT NULL
        ORDER BY r.year`,
      [project_id, currentYear]
    );

    const yearMap = new Map<number, Record<number, { likelihood: number | null; impact: number | null }>>();
    for (const row of historyRows) {
      if (!yearMap.has(row.year)) yearMap.set(row.year, {});
      yearMap.get(row.year)![row.origin_risk_id] = { likelihood: row.likelihood, impact: row.impact };
    }

    let years = Array.from(yearMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, values]) => ({ year, shared: sharedSet.has(year), values }));

    if (!isAdmin) years = years.filter((y) => y.shared);

    return NextResponse.json({ prodoc, years });
  } catch (err) {
    logger.error("GET /api/risk/history error:", err);
    return NextResponse.json({ error: "Failed to load risk history" }, { status: 500 });
  }
}
