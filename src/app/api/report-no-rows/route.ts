import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardReport } from "@/lib/authz";
import { logger } from "@/lib/logger";

// "Nothing to report" confirmation for the Transfers to Implementing Partners and
// Complementary Funding sections of a report / project update. Like the project
// document's "No documents to upload": a section with zero rows counts as complete
// only when its flag is set (see /api/report-completion). The flag is cleared
// automatically when a row is added (POST /api/transfer-data, /api/complementary-data).
//
//   GET ?reportId=X&section=transfers|complementary          → { confirmed: boolean }
//   PUT { reportId, section, confirmed: boolean }            → { confirmed: boolean }

// Fixed whitelist — the column name is interpolated into SQL, never taken from input.
const COLUMN: Record<string, string> = {
  transfers: "no_transfers_confirmed",
  complementary: "no_complementary_confirmed",
};

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  const section = req.nextUrl.searchParams.get("section") ?? "";
  if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  const column = COLUMN[section];
  if (!column) return NextResponse.json({ error: "section must be 'transfers' or 'complementary'" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardReport(session, reportId);
  if (gate) return gate;

  try {
    const rows = await query<{ confirmed: boolean }>(
      `SELECT ${column} AS confirmed FROM reporting_platform.reports WHERE id = $1`,
      [reportId]
    );
    if (!rows.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    return NextResponse.json({ confirmed: rows[0].confirmed === true });
  } catch (err) {
    logger.error("GET /api/report-no-rows error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reportId = body.reportId;
  if (reportId == null || reportId === "") {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }
  const column = COLUMN[typeof body.section === "string" ? body.section : ""];
  if (!column) return NextResponse.json({ error: "section must be 'transfers' or 'complementary'" }, { status: 400 });
  if (typeof body.confirmed !== "boolean") {
    return NextResponse.json({ error: "confirmed must be a boolean" }, { status: 400 });
  }

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardReport(session, reportId as string | number, { requireOpen: true });
  if (gate) return gate;

  try {
    const rows = await query<{ confirmed: boolean }>(
      `UPDATE reporting_platform.reports
          SET ${column} = $2
        WHERE id = $1
        RETURNING ${column} AS confirmed`,
      [reportId, body.confirmed]
    );
    if (!rows.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    return NextResponse.json({ confirmed: rows[0].confirmed === true });
  } catch (err) {
    logger.error("PUT /api/report-no-rows error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
