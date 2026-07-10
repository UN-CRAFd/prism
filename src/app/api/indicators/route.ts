import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/indicators
//   ?project_id=X       → standard library + that project's custom indicators (for the report-editor typeahead)
//   (no project_id)     → standard library only (for the admin indicators page)
//   &include_archived=1 → also include soft-deleted (archived) rows
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  const includeArchived = req.nextUrl.searchParams.get("include_archived") === "1";
  try {
    const where: string[] = [];
    const values: unknown[] = [];
    if (!includeArchived) where.push("archived_at IS NULL");
    if (projectId) {
      values.push(projectId);
      where.push(`(is_standard OR project_id = $${values.length})`);
    } else {
      where.push("is_standard");
    }

    const rows = await query(
      `SELECT id, name, description, means_of_verification, category, cycle,
              is_standard, project_id, archived_at, created_at, updated_at
         FROM reporting_platform.indicators
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY is_standard DESC, name`,
      values
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/indicators error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/indicators — create a standard (admin library) or custom (report-editor) indicator.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const isStandard = body.is_standard === undefined ? true : Boolean(body.is_standard);
  const projectId = body.project_id ?? null;
  if (!isStandard && !projectId) {
    return NextResponse.json({ error: "project_id is required for custom indicators" }, { status: 400 });
  }

  try {
    const rows = await query(
      `INSERT INTO reporting_platform.indicators
         (name, description, means_of_verification, category, cycle, is_standard, project_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, means_of_verification, category, cycle,
                 is_standard, project_id, archived_at, created_at, updated_at`,
      [
        name,
        body.description || null,
        body.means_of_verification || null,
        body.category || null,
        body.cycle || null,
        isStandard,
        isStandard ? null : projectId,
      ]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/indicators error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
