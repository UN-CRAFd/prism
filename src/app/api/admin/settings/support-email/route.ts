import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { getSupportEmail, isEmail, mailConfigured, setSupportEmail } from "@/lib/mailer";

// The CRAF'd address that "Forgot password" requests are e-mailed to.
// GET → { email, mailConfigured }   PUT { email } → { email }   (admin only)

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  try {
    return NextResponse.json({ email: await getSupportEmail(), mailConfigured: mailConfigured() });
  } catch (err) {
    logger.error("GET /api/admin/settings/support-email error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (email && !isEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid e-mail address." }, { status: 400 });
  }
  try {
    await setSupportEmail(email || null);
    return NextResponse.json({ email: email || null });
  } catch (err) {
    logger.error("PUT /api/admin/settings/support-email error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
