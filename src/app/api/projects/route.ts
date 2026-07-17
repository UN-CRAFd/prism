import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const rows = await query(`
      SELECT pr.*, p.short_name AS partner_short_name, p.long_name AS partner_long_name
      FROM reporting_platform.projects pr
      JOIN reporting_platform.partners p ON p.id = pr.partner_id
      ORDER BY p.short_name, pr.project_title
    `);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/projects error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      partner_id, project_title, short_name,
      mptfo_project_number, grant_size_usd, project_start_date, project_duration_months, geographic_scope,
    } = body;

    if (!partner_id || !project_title) {
      return NextResponse.json(
        { error: "partner_id and project_title are required" },
        { status: 400 }
      );
    }

    const rows = await query(
      `INSERT INTO reporting_platform.projects
         (partner_id, project_title, short_name, mptfo_project_number, grant_size_usd, project_start_date, project_duration_months, geographic_scope)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        partner_id, project_title,
        short_name || null,
        mptfo_project_number || null, grant_size_usd || null,
        project_start_date || null, project_duration_months || null, geographic_scope || null,
      ]
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/projects error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
