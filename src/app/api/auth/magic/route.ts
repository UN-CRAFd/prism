import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createMagicToken, verifyMagicToken, magicLinkEnabled } from "@/lib/magic-link";
import { hashPassword, verifyPassword } from "@/lib/password";

// Share links for a report:
//   POST { reportId }            → { token }                — admin copies this into a URL
//   GET  ?token=<token>          → { name, needsSetup }     — what the landing page should ask for
//   PUT  { token, password }     → { user, redirect }       — set (first use) or verify the password, then log in
//
// A link never logs anyone in automatically: the first visitor sets a password
// (overwriting the partner's password_hash); every visit after that must re-enter
// it. `partners.password_set_at` distinguishes the two.

const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const MIN_PASSWORD = 6;

interface ReportContext extends Record<string, unknown> {
  year: number;
  project_title: string;
  project_short_name: string | null;
  partner_id: number;
  partner_short_name: string | null;
  partner_long_name: string | null;
  password_hash: string | null;
  password_set_at: string | null;
}

async function resolveReport(rid: number): Promise<ReportContext | null> {
  const rows = await query<ReportContext>(
    `SELECT r.year,
            p.project_title,
            p.short_name   AS project_short_name,
            pt.id          AS partner_id,
            pt.short_name  AS partner_short_name,
            pt.long_name   AS partner_long_name,
            pt.password_hash,
            pt.password_set_at
       FROM reporting_platform.reports  r
       JOIN reporting_platform.projects p  ON p.id  = r.project_id
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE r.id = $1
      LIMIT 1`,
    [rid]
  );
  return rows[0] ?? null;
}

function sessionFor(ctx: ReportContext) {
  const slug = (ctx.project_short_name ?? ctx.project_title).toLowerCase();
  return {
    user: {
      id: ctx.partner_short_name,
      name: ctx.partner_long_name || ctx.partner_short_name,
      role: "partner" as const,
      organization: ctx.partner_short_name,
    },
    redirect: `/partner/report-editor/${encodeURIComponent(slug)}/${ctx.year}/overview`,
  };
}

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
  const payload = verifyMagicToken(req.nextUrl.searchParams.get("token") ?? "");
  if (!payload) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });
  }

  try {
    const ctx = await resolveReport(payload.rid);
    if (!ctx || !ctx.partner_short_name) {
      return NextResponse.json({ error: "This report is no longer available." }, { status: 404 });
    }
    return NextResponse.json({
      name: ctx.partner_long_name || ctx.partner_short_name,
      needsSetup: ctx.password_set_at === null,
    });
  } catch (err) {
    console.error("GET /api/auth/magic error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = verifyMagicToken(body.token ?? "");
  if (!payload) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });
  }
  const password = body.password ?? "";
  if (!password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  try {
    const ctx = await resolveReport(payload.rid);
    if (!ctx || !ctx.partner_short_name) {
      return NextResponse.json({ error: "This report is no longer available." }, { status: 404 });
    }

    if (ctx.password_set_at === null) {
      // First use: set the partner's password.
      if (password.length < MIN_PASSWORD) {
        return NextResponse.json(
          { error: `Password must be at least ${MIN_PASSWORD} characters.` },
          { status: 400 }
        );
      }
      await query(
        `UPDATE reporting_platform.partners
            SET password_hash = $1, password_set_at = NOW()
          WHERE id = $2`,
        [hashPassword(password), ctx.partner_id]
      );
    } else {
      // Subsequent use: verify the password they set.
      if (!ctx.password_hash || !verifyPassword(password, ctx.password_hash)) {
        return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
      }
    }

    return NextResponse.json(sessionFor(ctx));
  } catch (err) {
    console.error("PUT /api/auth/magic error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
