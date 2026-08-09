import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Standard survey questions are the global library that seeds every new report of
// a given type (annual | final), across all projects. Authoring them is an admin
// concern only — every handler is admin-gated. New reports snapshot these at
// creation (see copyStandardSurveyQuestions in /api/reports).

const REPORT_TYPES = ["annual", "final"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

function isReportType(v: unknown): v is ReportType {
  return typeof v === "string" && (REPORT_TYPES as readonly string[]).includes(v);
}

// GET /api/standard-surveys[?report_type=annual|final]
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const reportType = req.nextUrl.searchParams.get("report_type");
  const values: unknown[] = [];
  let where = "";
  if (isReportType(reportType)) {
    values.push(reportType);
    where = "WHERE report_type = $1";
  }

  try {
    const rows = await query(
      `SELECT id, report_type, question, sort_order
         FROM reporting_platform.standard_survey_questions
         ${where}
        ORDER BY report_type, sort_order, id`,
      values
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/standard-surveys error:", err);
    return NextResponse.json({ error: "Failed to load standard survey questions" }, { status: 500 });
  }
}

// POST /api/standard-surveys — { report_type, question }
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!isReportType(body.report_type)) {
    return NextResponse.json({ error: "report_type must be 'annual' or 'final'" }, { status: 400 });
  }
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  try {
    const rows = await query(
      `INSERT INTO reporting_platform.standard_survey_questions (report_type, question)
       VALUES ($1, $2)
       ON CONFLICT (report_type, question) DO NOTHING
       RETURNING id, report_type, question, sort_order`,
      [body.report_type, question]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "That question already exists for this report type" }, { status: 409 });
    }
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    logger.error("POST /api/standard-surveys error:", err);
    return NextResponse.json({ error: "Failed to add standard survey question" }, { status: 500 });
  }
}

// DELETE /api/standard-surveys?id=123
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    await query(`DELETE FROM reporting_platform.standard_survey_questions WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/standard-surveys error:", err);
    return NextResponse.json({ error: "Failed to delete standard survey question" }, { status: 500 });
  }
}
