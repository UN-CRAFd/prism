import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

const INVALID = { error: "Invalid username or password" };

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json(INVALID, { status: 401 });
  }

  // ── Admin — verified server-side (password never shipped to the client) ──
  if (username.toLowerCase() === "admin") {
    const adminPassword =
      process.env.ADMIN_PASSWORD ?? process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "admin";
    if (password === adminPassword) {
      return NextResponse.json({
        user: { id: "admin", name: "CRAF'd Secretariat", role: "admin" },
      });
    }
    return NextResponse.json(INVALID, { status: 401 });
  }

  // ── Partner — matched by short name or email, verified against the DB ──
  try {
    const rows = await query<{ short_name: string; long_name: string | null; password_hash: string | null }>(
      `SELECT short_name, long_name, password_hash
       FROM reporting_platform.partners
       WHERE lower(short_name) = lower($1) OR lower(mail_account) = lower($1)
       LIMIT 1`,
      [username]
    );

    const partner = rows[0];
    if (!partner || !partner.password_hash || !verifyPassword(password, partner.password_hash)) {
      return NextResponse.json(INVALID, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: partner.short_name,
        name: partner.long_name || partner.short_name,
        role: "partner",
        organization: partner.short_name,
      },
    });
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
