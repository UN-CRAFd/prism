import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";

// GET → 200 while this login is still valid, 401 once it has ended (e.g. the
// account's password was changed or reset elsewhere). Polled by the client
// (lib/auth-context) so an ended login returns to the login page promptly.
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ ok: true, role: session.role });
}
