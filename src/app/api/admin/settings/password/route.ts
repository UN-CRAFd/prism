import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { verifyAdminPassword, setAdminPassword } from "@/lib/admin-settings";
import { logger } from "@/lib/logger";

// Change the shared admin login password. Admin-only (enforced server-side via
// requireAdmin, not just the middleware). The caller must prove knowledge of the
// current password before a new one is accepted.

const MIN_LENGTH = 8;

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
  if (newPassword.length < MIN_LENGTH) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_LENGTH} characters` },
      { status: 400 }
    );
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("POST /api/admin/settings/password error:", err);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
