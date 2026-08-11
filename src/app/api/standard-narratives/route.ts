import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Standard narrative questions are the global library of project-document
// narrative sections (Background & Relevance, Theory of Change, …), authored by
// admins only — every handler is admin-gated. Each new project snapshots this set
// into project_narratives at creation (see /api/projects), so later edits here
// leave existing projects untouched. Mirrors /api/standard-surveys.

// Derive a stable narrative_key slug from a label. The key only needs to be
// unique within the library (it becomes the per-project narrative_key), so on
// collision we append a numeric suffix.
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "narrative";
}

// GET /api/standard-narratives
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  try {
    const rows = await query(
      `SELECT id, narrative_key, label, description, sort_order
         FROM reporting_platform.standard_narrative_questions
        ORDER BY sort_order, id`
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/standard-narratives error:", err);
    return NextResponse.json({ error: "Failed to load standard narrative questions" }, { status: 500 });
  }
}

// POST /api/standard-narratives — { label, description? }
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });

  try {
    // Unique key from the label; disambiguate against existing keys.
    const existing = await query<{ narrative_key: string }>(
      `SELECT narrative_key FROM reporting_platform.standard_narrative_questions`
    );
    const taken = new Set(existing.map((r) => r.narrative_key));
    const base = slugify(label);
    let key = base;
    for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;

    const rows = await query(
      `INSERT INTO reporting_platform.standard_narrative_questions (narrative_key, label, description, sort_order)
       VALUES ($1, $2, $3, COALESCE(
         (SELECT MAX(sort_order) + 1 FROM reporting_platform.standard_narrative_questions), 1))
       RETURNING id, narrative_key, label, description, sort_order`,
      [key, label, description]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    logger.error("POST /api/standard-narratives error:", err);
    return NextResponse.json({ error: "Failed to add standard narrative question" }, { status: 500 });
  }
}

// PATCH /api/standard-narratives — { id, label, description? } (edit the question)
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = Number(body.id);
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });

  try {
    const rows = await query(
      `UPDATE reporting_platform.standard_narrative_questions
          SET label = $2, description = $3
        WHERE id = $1
        RETURNING id, narrative_key, label, description, sort_order`,
      [id, label, description]
    );
    if (rows.length === 0) return NextResponse.json({ error: "Question not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/standard-narratives error:", err);
    return NextResponse.json({ error: "Failed to update standard narrative question" }, { status: 500 });
  }
}

// DELETE /api/standard-narratives?id=123
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    await query(`DELETE FROM reporting_platform.standard_narrative_questions WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/standard-narratives error:", err);
    return NextResponse.json({ error: "Failed to delete standard narrative question" }, { status: 500 });
  }
}
