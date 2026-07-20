import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Admin comments on report items (polymorphic — see migrations/032).
//   GET ?reportId=<id>                → all comments for a report (editor)
//   GET ?partnerShortName=<name>      → all comments across that partner's reports
//                                       with project/year context (partner home)
//   POST   { reportId, section, itemId?, body, author? }
//   PATCH  { id, body?, resolved? }
//   DELETE ?id=<id>

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  const partnerShortName = req.nextUrl.searchParams.get("partnerShortName");

  try {
    if (reportId) {
      const rows = await query(
        `SELECT id, report_id, section, item_id, body, resolved, author, created_at
           FROM reporting_platform.item_comments
          WHERE report_id = $1
          ORDER BY created_at ASC`,
        [reportId]
      );
      return NextResponse.json(rows);
    }

    if (partnerShortName) {
      const rows = await query(
        `SELECT c.id, c.report_id, c.section, c.item_id, c.body, c.resolved, c.created_at,
                r.year,
                p.project_title,
                p.short_name AS project_short_name
           FROM reporting_platform.item_comments c
           JOIN reporting_platform.reports  r  ON r.id  = c.report_id
           JOIN reporting_platform.projects p  ON p.id  = r.project_id
           JOIN reporting_platform.partners pt ON pt.id = p.partner_id
          WHERE r.data_type = 'report'
            AND LOWER(pt.short_name) = LOWER($1)
          ORDER BY c.resolved ASC, c.created_at DESC`,
        [partnerShortName]
      );
      return NextResponse.json(rows);
    }

    return NextResponse.json({ error: "reportId or partnerShortName is required" }, { status: 400 });
  } catch (err) {
    console.error("GET /api/comments error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const reportId = Number(body.reportId);
  const section = typeof body.section === "string" ? body.section : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!reportId || !section || !text) {
    return NextResponse.json({ error: "reportId, section and body are required" }, { status: 400 });
  }
  const itemId = body.itemId == null ? null : Number(body.itemId);
  const author = typeof body.author === "string" ? body.author : null;

  try {
    const rows = await query(
      `INSERT INTO reporting_platform.item_comments (report_id, section, item_id, body, author)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, report_id, section, item_id, body, resolved, author, created_at`,
      [reportId, section, itemId, text, author]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/comments error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (typeof body.body === "string") { sets.push(`body = $${i++}`); values.push(body.body.trim()); }
  if (typeof body.resolved === "boolean") { sets.push(`resolved = $${i++}`); values.push(body.resolved); }
  if (sets.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  values.push(id);
  try {
    const rows = await query(
      `UPDATE reporting_platform.item_comments SET ${sets.join(", ")}
        WHERE id = $${i}
        RETURNING id, report_id, section, item_id, body, resolved, author, created_at`,
      values
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/comments error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    await query(`DELETE FROM reporting_platform.item_comments WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/comments error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
