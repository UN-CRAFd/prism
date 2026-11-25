import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireAdmin } from "@/lib/authz";
import { getWordLimitOverrides, setWordLimits } from "@/lib/word-limits";
import { logger } from "@/lib/logger";

// GET — any logged-in session (partners need it for the editors' word counters).
// Returns only the overrides; the defaults live in lib/limits.ts.
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    return NextResponse.json({ overrides: await getWordLimitOverrides() });
  } catch (err) {
    logger.error("GET /api/admin/settings/word-limits error:", err);
    return NextResponse.json({ error: "Failed to load word limits" }, { status: 500 });
  }
}

// PUT — admin only. Body: { limits: { [limitKey]: number } }
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
    const result = await setWordLimits(body.limits);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ overrides: await getWordLimitOverrides() });
  } catch (err) {
    logger.error("PUT /api/admin/settings/word-limits error:", err);
    return NextResponse.json({ error: "Failed to save word limits" }, { status: 500 });
  }
}
