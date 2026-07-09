import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Standard budget-category master list (global, seeded).
export async function GET() {
  try {
    const rows = await query(
      `SELECT id, name, sort_order
         FROM reporting_platform.expenditure_categories
        ORDER BY sort_order ASC, id ASC`
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/expenditure-categories error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
