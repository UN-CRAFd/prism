import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { loadOptionOverrides } from "@/lib/option-settings";
import { isReportType } from "@/app/api/standard-surveys/route";

// PUT /api/standard-surveys/reorder — { report_type, ids: number[] }
// Renumbers sort_order 1-based in the given order. Rejects with 409 if the id
// set doesn't exactly match the stored set for that report_type (concurrent add
// or delete).
export async function PUT(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await loadOptionOverrides();
  if (!isReportType(body.report_type)) {
    return NextResponse.json({ error: "report_type is not a valid value" }, { status: 400 });
  }
  const reportType = body.report_type;

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }
  const ids = body.ids as unknown[];
  if (!ids.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)) {
    return NextResponse.json({ error: "ids must be positive integers" }, { status: 400 });
  }
  const typedIds = ids as number[];
  if (new Set(typedIds).size !== typedIds.length) {
    return NextResponse.json({ error: "ids must not contain duplicates" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ id: number }>(
      `SELECT id FROM reporting_platform.standard_survey_questions WHERE report_type = $1 FOR UPDATE`,
      [reportType]
    );
    const existingIds = new Set(existing.rows.map((r) => r.id));
    if (typedIds.length !== existingIds.size || !typedIds.every((id) => existingIds.has(id))) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Question list is out of date, please reload" },
        { status: 409 }
      );
    }

    await client.query(
      `UPDATE reporting_platform.standard_survey_questions
          SET sort_order = o.ord
         FROM unnest($1::int[]) WITH ORDINALITY AS o(id, ord)
        WHERE standard_survey_questions.id = o.id`,
      [typedIds]
    );

    const rows = await client.query<{ id: number; report_type: string; question: string; sort_order: number }>(
      `SELECT id, report_type, question, sort_order
         FROM reporting_platform.standard_survey_questions
        WHERE report_type = $1
        ORDER BY sort_order, id`,
      [reportType]
    );

    await client.query("COMMIT");
    return NextResponse.json(rows.rows);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("PUT /api/standard-surveys/reorder error:", err);
    return NextResponse.json({ error: "Failed to reorder questions" }, { status: 500 });
  } finally {
    client.release();
  }
}
