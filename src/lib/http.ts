import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Shared HTTP helpers for the API routes. The route handlers previously each
// re-implemented JSON-body parsing, numeric coercion and the success/error
// response envelopes, with small divergences (isNaN vs Number.isNaN, {ok:true}
// vs {deleted:true} vs {success:true}, "Invalid JSON" vs "Invalid JSON body").
// This module is the single source of truth for those shapes so every route
// answers the same way.
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a JSON request body, returning null on malformed input. */
export async function parseBody(
  req: Request
): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Standard 400 for a body that could not be parsed as JSON. */
export function invalidJson() {
  return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
}

/** Standard 400 for a missing/invalid field. */
export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Standard 404. */
export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

/**
 * Standard 500. Logs the real error via the caller's logger; the client only
 * ever sees the generic message so DB internals never leak.
 */
export function serverError() {
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}

/** Uniform success envelope for a delete. */
export function deleted() {
  return NextResponse.json({ ok: true });
}

// ── Value coercion ──────────────────────────────────────────────────────────

/** Coerce to a number, mapping "", null and non-numeric input to null. */
export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Coerce to a positive integer id, mapping anything else to null. */
export function toIntId(v: unknown): number | null {
  const n = toNumber(v);
  return n !== null && Number.isInteger(n) ? n : null;
}
