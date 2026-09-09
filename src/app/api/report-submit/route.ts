import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardReport } from "@/lib/authz";
import { logger } from "@/lib/logger";

// POST /api/report-submit — partner submits an annual/final report for review.
// Transitions status Open → Under Review, which locks partner editing.
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    const body = await request.json();
    const reportId = body.report_id;
    if (!reportId) {
      return NextResponse.json({ error: "report_id is required" }, { status: 400 });
    }

    const gate = await guardReport(session, reportId);
    if (gate) return gate;

    const rows = await query<{ id: number; status: string; authorized: boolean; data_type: string }>(
      `SELECT id, status, authorized, data_type
         FROM reporting_platform.reports
        WHERE id = $1`,
      [reportId]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    const report = rows[0];

    if (report.data_type === "prodoc") {
      return NextResponse.json(
        { error: "Project documents are submitted via /api/prodoc-submit." },
        { status: 400 }
      );
    }

    if (report.status !== "Open") {
      return NextResponse.json(
        { error: "This report has already been submitted and cannot be submitted again." },
        { status: 409 }
      );
    }

    if (report.authorized !== true) {
      return NextResponse.json(
        { error: "Please tick the authorization checkbox in the Overview tab before submitting this report." },
        { status: 422 }
      );
    }

    const updated = await query<{ id: number; status: string }>(
      `UPDATE reporting_platform.reports
          SET status = 'Under Review'
        WHERE id = $1 AND status = 'Open'
        RETURNING id, status`,
      [reportId]
    );
    if (updated.length === 0) {
      return NextResponse.json(
        { error: "This report has already been submitted and cannot be submitted again." },
        { status: 409 }
      );
    }

    logger.info("Report submitted", { report_id: reportId, org: session.org });
    return NextResponse.json({ ok: true, status: "Under Review" });
  } catch (err) {
    logger.error("POST /api/report-submit error:", err);
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }
}
