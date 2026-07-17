import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createMagicToken, verifyMagicToken, magicLinkEnabled } from "@/lib/magic-link";

// Share links for a report: mint (POST) and redeem (GET).
//   POST { reportId }        → { token }          — admin copies this into a URL
//   GET  ?token=<token>      → { user, redirect } — logs a visitor in as the partner

const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export async function POST(req: NextRequest) {
  if (!magicLinkEnabled()) {
    return NextResponse.json(
      { error: "Share links are not configured (set MAGIC_LINK_SECRET or ADMIN_PASSWORD)." },
      { status: 503 }
    );
  }

  let body: { reportId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reportId = Number(body.reportId);
  if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });

  try {
    const rows = await query(`SELECT id FROM reporting_platform.reports WHERE id = $1`, [reportId]);
    if (!rows.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const token = createMagicToken({ rid: reportId, exp: Date.now() + TTL_MS });
    return NextResponse.json({ token });
  } catch (err) {
    console.error("POST /api/auth/magic error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyMagicToken(token);
  if (!payload) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });
  }

  try {
    const rows = await query<{
      year: number;
      project_title: string;
      project_short_name: string | null;
      partner_short_name: string | null;
      partner_long_name: string | null;
    }>(
      `SELECT r.year,
              p.project_title,
              p.short_name  AS project_short_name,
              pt.short_name AS partner_short_name,
              pt.long_name  AS partner_long_name
         FROM reporting_platform.reports  r
         JOIN reporting_platform.projects p  ON p.id  = r.project_id
         JOIN reporting_platform.partners pt ON pt.id = p.partner_id
        WHERE r.id = $1
        LIMIT 1`,
      [payload.rid]
    );

    const row = rows[0];
    if (!row || !row.partner_short_name) {
      return NextResponse.json({ error: "This report is no longer available." }, { status: 404 });
    }

    // Build the same session shape as /api/auth/login and the same slug as the
    // partner editor's toSlug(), so the guard passes and the URL resolves.
    const slug = (row.project_short_name ?? row.project_title).toLowerCase();
    const user = {
      id: row.partner_short_name,
      name: row.partner_long_name || row.partner_short_name,
      role: "partner" as const,
      organization: row.partner_short_name,
    };
    const redirect = `/partner/${encodeURIComponent(slug)}/${row.year}/overview`;

    return NextResponse.json({ user, redirect });
  } catch (err) {
    console.error("GET /api/auth/magic error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
