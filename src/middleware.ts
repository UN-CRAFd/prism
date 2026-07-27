import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// ─────────────────────────────────────────────────────────────────────────────
// The single choke point that makes the app non-public. Every /api call and every
// /admin or /partner page must present a valid signed session cookie; without one
// the request is rejected (API → 401 JSON, page → redirect to /login) before it
// ever reaches a handler or renders. Fine-grained ownership (a partner may only
// touch their own reports) is enforced per-route in lib/authz.ts.
// ─────────────────────────────────────────────────────────────────────────────

// Endpoints that must stay reachable without a session (they establish one).
const PUBLIC_API = new Set([
  "/api/auth/login",
  "/api/auth/magic",
  "/api/auth/logout",
]);

// APIs only the admin (CRAF'd Secretariat) may call — bulk export/import of every
// partner's data and the cross-partner admin dashboard. Everything else is either
// partner-scoped (enforced in-route) or read-only listings.
const ADMIN_ONLY_API = ["/api/download", "/api/upload", "/api/reports/activity"];

function isPublicApi(pathname: string): boolean {
  if (PUBLIC_API.has(pathname)) return true;
  // Trailing-slash / nested variants of the auth endpoints.
  return [...PUBLIC_API].some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  // ── API routes ──────────────────────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) return NextResponse.next();

    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (
      session.role !== "admin" &&
      ADMIN_ONLY_API.some((p) => pathname === p || pathname.startsWith(p + "/"))
    ) {
      return NextResponse.json(
        { error: "You don't have access to this resource" },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  // ── Protected pages ─────────────────────────────────────────────────────
  const loginUrl = new URL("/login", req.url);

  if (pathname.startsWith("/admin")) {
    if (!session) return NextResponse.redirect(loginUrl);
    if (session.role !== "admin") return NextResponse.redirect(new URL("/partner", req.url));
    return NextResponse.next();
  }

  if (pathname.startsWith("/partner")) {
    if (!session) return NextResponse.redirect(loginUrl);
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/partner/:path*"],
};
