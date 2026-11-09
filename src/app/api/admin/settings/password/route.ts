import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { verifyAdminPassword, setAdminPassword } from "@/lib/admin-settings";
import { logger } from "@/lib/logger";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { bumpAdminVersion } from "@/lib/session-version";
import { passwordPolicyError } from "@/lib/password-policy";

// Change the shared admin login password. Admin-only (enforced server-side via
// requireAdmin, not just the middleware). The caller must prove knowledge of the
// current password before a new one is accepted.


export async function POST(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Both current and new password are required" }, { status: 400 });
  }
  // Same rules as partner passwords (lib/password-policy): 8+ characters, an
  // uppercase letter, a number and a special character.
  const policyError = passwordPolicyError(newPassword);
  if (policyError) {
    return NextResponse.json({ error: policyError }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must differ from the current password" },
      { status: 400 }
    );
  }

  try {
    if (!(await verifyAdminPassword(currentPassword))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }
    await setAdminPassword(newPassword);
    // Everyone signed in to the shared admin account is logged out; the person
    // who made the change gets a fresh login so they stay signed in.
    const ver = await bumpAdminVersion();
    const token = await createSessionToken({ role: "admin", org: null, name: session.name, ver });
    return setSessionCookie(NextResponse.json({ ok: true }), token);
  } catch (err) {
    logger.error("POST /api/admin/settings/password error:", err);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
