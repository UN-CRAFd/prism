import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Partner contacts (people at a partner organization).
//   GET ?partner_id=X → that partner's contacts (partner view)
//   GET               → all contacts with partner context (admin view)
//   POST { partner_id, name, role, email }
//   PATCH { id, name, role, email }
//   DELETE ?id=

const FIELDS = ["name", "role", "email"] as const;

export async function GET(req: NextRequest) {
  const partnerId = req.nextUrl.searchParams.get("partner_id");
  try {
    if (partnerId) {
      const rows = await query(
        `SELECT id, partner_id, name, role, email, sort_order
           FROM reporting_platform.partner_contacts
          WHERE partner_id = $1
          ORDER BY sort_order ASC, id ASC`,
        [partnerId]
      );
      return NextResponse.json(rows);
    }

    const rows = await query(
      `SELECT c.id, c.partner_id, c.name, c.role, c.email, c.sort_order,
              p.short_name AS partner_short_name, p.long_name AS partner_long_name
         FROM reporting_platform.partner_contacts c
         JOIN reporting_platform.partners p ON p.id = c.partner_id
        ORDER BY p.short_name, c.sort_order ASC, c.id ASC`
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/partner-contacts error:", err);
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

  const partnerId = body.partner_id;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  try {
    const existing = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM reporting_platform.partner_contacts WHERE partner_id = $1`,
      [partnerId]
    );
    const nextOrder = Number(existing[0].count) + 1;

    const rows = await query(
      `INSERT INTO reporting_platform.partner_contacts (partner_id, name, role, email, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [partnerId, name, body.role ?? null, body.email ?? null, nextOrder]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/partner-contacts error:", err);
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
    const values = [
      typeof body.name === "string" ? body.name.trim() : body.name ?? null,
      body.role ?? null,
      body.email ?? null,
      id,
    ];
    const rows = await query(
      `UPDATE reporting_platform.partner_contacts
          SET ${setClause}, updated_at = NOW()
        WHERE id = $${FIELDS.length + 1}
      RETURNING *`,
      values
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/partner-contacts error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    await query(`DELETE FROM reporting_platform.partner_contacts WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/partner-contacts error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
