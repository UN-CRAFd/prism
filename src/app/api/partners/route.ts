import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const rows = await query(`
      SELECT p.id, p.organization_name, p.organization_website, p.mail_account, p.created_at, p.updated_at,
             COALESCE(json_agg(
               json_build_object('id', pr.id, 'project_title', pr.project_title)
             ) FILTER (WHERE pr.id IS NOT NULL), '[]') AS projects
      FROM reporting_platform.partners p
      LEFT JOIN reporting_platform.projects pr ON pr.partner_id = p.id
      GROUP BY p.id
      ORDER BY p.organization_name
    `);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/partners error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { organization_name, organization_website, password, mail_account } = body;

    if (!organization_name || !mail_account || !password) {
      return NextResponse.json(
        { error: "organization_name, mail_account, and password are required" },
        { status: 400 }
      );
    }

    const rows = await query(
      `INSERT INTO reporting_platform.partners (organization_name, organization_website, password_hash, mail_account)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [organization_name, organization_website || null, password, mail_account]
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/partners error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
