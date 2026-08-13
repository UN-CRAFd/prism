import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, requireAdmin, guardReport, guardRow } from "@/lib/authz";
import { parseBody, invalidJson, badRequest, notFound, serverError, deleted } from "@/lib/http";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const reportId = req.nextUrl.searchParams.get("reportId");

  try {
    if (reportId) {
      const gate = await guardReport(session, reportId);
      if (gate) return gate;
      const rows = await query(
        `SELECT id, report_id, question, assessment, context
         FROM reporting_platform.surveys
         WHERE report_id = $1
         ORDER BY id ASC`,
        [reportId]
      );
      return NextResponse.json(rows);
    }

    // No reportId — cross-report listing (admin only).
    const gate = await requireAdmin();
    if (gate instanceof NextResponse) return gate;
    const rows = await query(
      `SELECT
         s.id,
         s.report_id,
         s.question,
         s.assessment,
         s.context,
         r.year,
         r.report_type,
         p.project_title,
         p.short_name   AS project_short_name,
         pt.short_name  AS partner_short_name,
         pt.long_name   AS partner_long_name
       FROM reporting_platform.surveys s
       JOIN reporting_platform.reports  r  ON r.id  = s.report_id
       JOIN reporting_platform.projects p  ON p.id  = r.project_id
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
       WHERE r.data_type = 'report'
       ORDER BY r.year DESC, pt.short_name, p.project_title, s.id`
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/surveys error:", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const body = await parseBody(req);
  if (!body) return invalidJson();
  const { reportId, question } = body as { reportId?: number; question?: string };
  if (!reportId || !question?.trim()) {
    return badRequest("reportId and question are required");
  }
  const gate = await guardReport(session, reportId, { requireOpen: true });
  if (gate) return gate;

  try {
    const rows = await query(
      `INSERT INTO reporting_platform.surveys (report_id, question) VALUES ($1, $2) RETURNING *`,
      [reportId, question.trim()]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    logger.error("POST /api/surveys error:", err);
    return serverError();
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const body = await parseBody(req);
  if (!body) return invalidJson();
  const { id, assessment, context } = body as {
    id?: number;
    assessment?: number | null;
    context?: string | null;
  };
  if (!id) return badRequest("id is required");
  const gate = await guardRow(session, "surveys", id, { requireOpen: true });
  if (gate) return gate;

  try {
    const rows = await query(
      `UPDATE reporting_platform.surveys
       SET assessment = $1, context = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [assessment ?? null, context ?? null, id]
    );
    if (rows.length === 0) return notFound();
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/surveys error:", err);
    return serverError();
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("id is required");
  const gate = await guardRow(session, "surveys", id, { requireOpen: true });
  if (gate) return gate;

  try {
    await query(`DELETE FROM reporting_platform.surveys WHERE id = $1`, [id]);
    return deleted();
  } catch (err) {
    logger.error("DELETE /api/surveys error:", err);
    return serverError();
  }
}
