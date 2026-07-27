import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/authz";

// Standard budget-category master list (global, seeded).
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const rows = await query(
      `SELECT id, name, sort_order
         FROM reporting_platform.expenditure_categories
        ORDER BY sort_order ASC, id ASC`
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/expenditure-categories error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
