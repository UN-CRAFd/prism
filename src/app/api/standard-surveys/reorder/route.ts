import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { loadOptionOverrides } from "@/lib/option-settings";
import { optionValues } from "@/lib/options";
import { isReportType } from "@/app/api/standard-surveys/route";

// PUT /api/standard-surveys/reorder — { report_type, items: [{ id, category }] }
// Sets sort_order and category in one pass. Rejects with 409 if the id set
// doesn't exactly match the stored set for that report_type (concurrent add or
// delete).
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

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
  }
  const items = body.items as unknown[];

  const validCategories = new Set(optionValues("surveyCategory"));
  const typedItems: Array<{ id: number; category: string | null }> = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      return NextResponse.json({ error: "Each item must be an object" }, { status: 400 });
    }
    const { id, category } = item as Record<string, unknown>;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Each item.id must be a positive integer" }, { status: 400 });
    }
    if (category !== null && category !== undefined) {
      if (typeof category !== "string" || !validCategories.has(category)) {
        return NextResponse.json(
          { error: `Unknown category value: ${String(category)}` },
          { status: 400 }
        );
      }
      typedItems.push({ id, category });
    } else {
      typedItems.push({ id, category: null });
    }
  }

  const typedIds = typedItems.map((i) => i.id);
  if (new Set(typedIds).size !== typedIds.length) {
    return NextResponse.json({ error: "items must not contain duplicate ids" }, { status: 400 });
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

    const categories = typedItems.map((i) => i.category);
    await client.query(
      `UPDATE reporting_platform.standard_survey_questions AS q
          SET sort_order = o.ord, category = o.category
         FROM unnest($1::int[], $2::text[]) WITH ORDINALITY AS o(id, category, ord)
        WHERE q.id = o.id`,
      [typedIds, categories]
    );

    const rows = await client.query<{ id: number; report_type: string; question: string; sort_order: number; category: string | null }>(
      `SELECT id, report_type, question, sort_order, category
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
