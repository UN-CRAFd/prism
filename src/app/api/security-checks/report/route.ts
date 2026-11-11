import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";
import { evaluate, runPlatformChecks, sanitizePackageReport, statusOf, storeRun } from "@/lib/security-check";

// POST — receives the package results of scripts/security-check.mjs (monthly
// GitHub Action or a manual run), adds the platform checks this server runs
// itself, and stores the combined report for the admin Security page.
//
// Not a browser endpoint: there is no session. It is allowed through the
// middleware and authenticated here by a shared secret:
//   Authorization: Bearer <SECURITY_CHECK_TOKEN>
// SECURITY_CHECK_TOKEN must be set on the server (at least 32 random
// characters) — without it the endpoint refuses everything.

const MAX_BYTES = 512 * 1024;

function tokenOk(header: string | null): boolean {
  const expected = process.env.SECURITY_CHECK_TOKEN ?? "";
  if (expected.length < 32 || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length).trim());
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function POST(request: Request) {
  if (!tokenOk(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "Report too large" }, { status: 413 });

  let body: { source?: unknown; packages?: unknown };
  try {
    const text = await request.text();
    if (text.length > MAX_BYTES) return NextResponse.json({ error: "Report too large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const packages = sanitizePackageReport(body.packages);
    const report = evaluate(packages, await runPlatformChecks());
    const source = typeof body.source === "string" && /^[a-z-]{1,40}$/.test(body.source) ? body.source : "script";
    const run = await storeRun(source, report);
    return NextResponse.json({ ok: true, id: run.id, runAt: run.run_at, status: statusOf(report), counts: report.counts });
  } catch (err) {
    logger.error("POST /api/security-checks/report error:", err);
    return NextResponse.json(
      { error: "Could not store the report. Has db/add-security-checks.sql been run?" },
      { status: 500 }
    );
  }
}
