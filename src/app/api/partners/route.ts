import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export async function GET() {
  try {
    const rows = await query(`
      SELECT p.id, p.short_name, p.long_name, p.organization_website, p.mail_account,
             p.created_at, p.updated_at,
             COALESCE(json_agg(
               json_build_object('id', pr.id, 'project_title', pr.project_title, 'short_name', pr.short_name)
             ) FILTER (WHERE pr.id IS NOT NULL), '[]') AS projects
      FROM reporting_platform.partners p
      LEFT JOIN reporting_platform.projects pr ON pr.partner_id = p.id
      GROUP BY p.id
      ORDER BY p.short_name
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
    const { short_name, long_name, organization_website, password, mail_account } = body;

    // Email is optional — partners log in by short name (or email if set) and set
    // their own password via a share link. Long name is the required identifier.
    if (!short_name || !long_name || !password) {
      return NextResponse.json(
        { error: "short_name, long_name, and password are required" },
        { status: 400 }
      );
    }

    const rows = await query(
      `INSERT INTO reporting_platform.partners
         (short_name, long_name, organization_website, password_hash, mail_account)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, short_name, long_name, organization_website, mail_account, created_at, updated_at`,
      [short_name, long_name, organization_website || null, hashPassword(password), mail_account || null]
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/partners error:", err);
    const msg = String(err);
    if (msg.includes("duplicate key")) {
      return NextResponse.json({ error: "A partner with this email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
