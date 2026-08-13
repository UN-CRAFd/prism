import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

// Clear the session cookie. The client also drops its cosmetic localStorage user.
export async function POST() {
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
