import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireAdmin } from "@/lib/authz";
import { getCharLimits, setCharLimits } from "@/lib/char-limits";
import { DESCRIPTION_MAX_CHARS } from "@/lib/limits";
import { logger } from "@/lib/logger";

// GET — any logged-in session (partners need it for client-side char counters).
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const limits = await getCharLimits();
    const defaults = {
      description: DESCRIPTION_MAX_CHARS,
      narratives: {} as Record<string, number>,
    };
    return NextResponse.json({ limits, defaults });
  } catch (err) {
    logger.error("GET /api/admin/settings/char-limits error:", err);
    return NextResponse.json({ error: "Failed to load char limits" }, { status: 500 });
  }
}

// PUT — admin only. Body: { description?: number, narratives?: Record<string, number> }
export async function PUT(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await setCharLimits(body);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    const limits = await getCharLimits();
    return NextResponse.json({ limits });
  } catch (err) {
    logger.error("PUT /api/admin/settings/char-limits error:", err);
    return NextResponse.json({ error: "Failed to save char limits" }, { status: 500 });
  }
}
