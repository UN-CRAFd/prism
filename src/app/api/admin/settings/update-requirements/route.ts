import { NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/authz";
import { getUpdateRequirements, setUpdateRequirements } from "@/lib/update-requirements";
import { normaliseRequirements } from "@/lib/update-modules";
import { logger } from "@/lib/logger";

// Read / replace the admin-authored "update category requirements" — which
// modules each project-update type requires (the permanent ticks in the
// project-update matrix). Reading is open to any signed-in user because the
// matrix is rendered wherever an update is shown; writing is admin-only.

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    return NextResponse.json({ requirements: await getUpdateRequirements() });
  } catch (err) {
    logger.error("GET /api/admin/settings/update-requirements error:", err);
    return NextResponse.json({ error: "Failed to load update requirements" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  let body: { requirements?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { requirements } = body;
  if (!requirements || typeof requirements !== "object" || Array.isArray(requirements)) {
    return NextResponse.json({ error: "`requirements` must be an object" }, { status: 400 });
  }

  try {
    // normaliseRequirements drops unknown types/modules, so a stale client can
    // never write keys the app does not understand.
    await setUpdateRequirements(normaliseRequirements(requirements));
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("PUT /api/admin/settings/update-requirements error:", err);
    return NextResponse.json({ error: "Failed to save update requirements" }, { status: 500 });
  }
}
