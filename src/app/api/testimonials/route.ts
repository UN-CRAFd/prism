import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Testimonials section (qualitative). Two kinds, each with its own per-report cap:
//   • leadership — exactly one quote from the organisation's leadership (max 1)
//   • partner    — up to three quotes from partners or users (max 3)
// GET ?reportId=&kind= (kind optional), POST { reportId, kind, ... }, PATCH { id, ... }, DELETE ?id=

const FIELDS = ["quote", "person_name", "person_title", "photo_label", "photo_link", "photo_credits"] as const;
const KIND_MAX: Record<string, number> = { leadership: 1, partner: 3 };

function isKind(v: unknown): v is "leadership" | "partner" {
  return v === "leadership" || v === "partner";
}

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  const kind = req.nextUrl.searchParams.get("kind");
  try {
    if (reportId) {
      const params: unknown[] = [reportId];
      let where = "report_id = $1";
      if (kind && isKind(kind)) {
        params.push(kind);
        where += " AND kind = $2";
      }
      const rows = await query(
        `SELECT id, report_id, kind, ${FIELDS.join(", ")}, sort_order
           FROM reporting_platform.testimonials
          WHERE ${where}
          ORDER BY sort_order ASC, id ASC`,
        params
      );
      return NextResponse.json(rows);
    }

    // Cross-report listing with project/partner context (admin / export views).
    const rows = await query(
      `SELECT
         t.id, t.report_id, t.kind, ${FIELDS.map((f) => `t.${f}`).join(", ")}, t.sort_order,
         r.year, r.report_type,
         p.project_title, p.short_name AS project_short_name,
         pt.short_name AS partner_short_name, pt.long_name AS partner_long_name
       FROM reporting_platform.testimonials t
       JOIN reporting_platform.reports  r  ON r.id  = t.report_id
       JOIN reporting_platform.projects p  ON p.id  = r.project_id
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
       WHERE r.data_type = 'report'
       ORDER BY r.year DESC, pt.short_name, p.project_title, t.kind, t.sort_order`
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/testimonials error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reportId, kind } = body;
  if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  if (!isKind(kind)) return NextResponse.json({ error: "kind must be 'leadership' or 'partner'" }, { status: 400 });

  try {
    const existing = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM reporting_platform.testimonials WHERE report_id = $1 AND kind = $2`,
      [reportId, kind]
    );
    const count = Number(existing[0].count);
    const max = KIND_MAX[kind];
    if (count >= max) {
      return NextResponse.json(
        { error: `Maximum of ${max} ${kind} ${max === 1 ? "quote" : "quotes"} per report` },
        { status: 400 }
      );
    }

    const cols = ["report_id", "kind", ...FIELDS, "sort_order"];
    const values = [reportId, kind, ...FIELDS.map((f) => body[f] ?? null), count + 1];
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");

    const rows = await query(
      `INSERT INTO reporting_platform.testimonials (${cols.join(", ")})
       VALUES (${placeholders})
       RETURNING *`,
      values
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/testimonials error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const setClause = FIELDS.map((f, i) => `${f} = $${i + 1}`).join(", ");
    const values = [...FIELDS.map((f) => body[f] ?? null), id];
    const rows = await query(
      `UPDATE reporting_platform.testimonials
          SET ${setClause}, updated_at = NOW()
        WHERE id = $${FIELDS.length + 1}
      RETURNING *`,
      values
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/testimonials error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    await query(`DELETE FROM reporting_platform.testimonials WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/testimonials error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
