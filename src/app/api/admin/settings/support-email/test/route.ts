import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { getSupportEmail, mailConfigured, sendMail } from "@/lib/mailer";

// POST → send a test e-mail to the saved support address (admin only), so the
// SMTP settings can be checked without anyone using "Forgot password".
export async function POST() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  if (!mailConfigured()) {
    return NextResponse.json(
      { error: "E-mail sending is not configured on the server (SMTP_HOST, SMTP_USER, SMTP_PASSWORD)." },
      { status: 400 }
    );
  }
  try {
    const to = await getSupportEmail();
    if (!to) return NextResponse.json({ error: "Save an address first." }, { status: 400 });
    await sendMail({
      to,
      subject: "PRISM: test e-mail",
      text: "This is a test from the PRISM Settings page. Password help requests from the login page will arrive at this address.",
    });
    return NextResponse.json({ ok: true, to });
  } catch (err) {
    // The SMTP error (e.g. authentication failed) helps the admin fix the setup;
    // it never contains the password.
    logger.error("POST /api/admin/settings/support-email/test error:", err);
    const detail = err instanceof Error ? err.message.slice(0, 300) : "unknown error";
    return NextResponse.json({ error: `Sending failed: ${detail}` }, { status: 502 });
  }
}
