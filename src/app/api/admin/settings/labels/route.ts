import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { getLabelOverrides, setLabelOverrides } from "@/lib/label-settings";
import { logger } from "@/lib/logger";

// Read / replace the admin-authored UI label overrides. Admin-only (enforced
// server-side via requireAdmin). The overrides are a partial, same-shaped
// subtree of labels.json; they are merged over the compiled-in defaults at
// render time (see lib/labels.ts + the root layout).

export async function GET() {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  try {
    const overrides = await getLabelOverrides();
    return NextResponse.json({ overrides });
  } catch (err) {
    logger.error("GET /api/admin/settings/labels error:", err);
    return NextResponse.json({ error: "Failed to load label overrides" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  let body: { overrides?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const overrides = body.overrides;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return NextResponse.json({ error: "`overrides` must be an object" }, { status: 400 });
  }

  try {
    await setLabelOverrides(overrides as Record<string, unknown>);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("PUT /api/admin/settings/labels error:", err);
    return NextResponse.json({ error: "Failed to save label overrides" }, { status: 500 });
  }
}
