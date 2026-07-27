import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireSession, requireAdmin } from "@/lib/authz";

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    // Partners see only their own organization (the client picks "mine" from the
    // list); admins see all. Never expose password_hash.
    const scoped = session.role !== "admin";
    const rows = await query(
      `SELECT p.id, p.short_name, p.long_name, p.organization_website, p.mail_account,
             p.created_at, p.updated_at,
             COALESCE(json_agg(
               json_build_object('id', pr.id, 'project_title', pr.project_title, 'short_name', pr.short_name)
             ) FILTER (WHERE pr.id IS NOT NULL), '[]') AS projects
      FROM reporting_platform.partners p
      LEFT JOIN reporting_platform.projects pr ON pr.partner_id = p.id
      ${scoped ? "WHERE lower(p.short_name) = lower($1)" : ""}
      GROUP BY p.id
      ORDER BY p.short_name`,
      scoped ? [session.org] : []
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/partners error:", err);
    return NextResponse.json({ error: "Failed to load partners" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

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
