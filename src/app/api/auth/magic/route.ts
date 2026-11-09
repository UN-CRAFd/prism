import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createMagicToken, verifyMagicToken, magicLinkEnabled } from "@/lib/magic-link";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { passwordPolicyError } from "@/lib/password-policy";
import { bumpPartnerVersion, partnerVersion } from "@/lib/session-version";
import {
  attemptsLeftMessage, clearFailures, lockedMessage, lockStatus, partnerKey, recordFailure,
} from "@/lib/login-throttle";

// Partner setup links — one link per partner organization (not per report).
// The link lets the partner set their PRISM password on first use; subsequent
// visits require re-entry of that password.
//
//   POST { partnerId }           → { token }             — admin mints the link
//   GET  ?token=<token>          → { name, needsSetup }  — landing page probe
//   PUT  { token, password }     → { user, redirect }    — set or verify password, then log in
//
// `partners.password_set_at` distinguishes first-use (setup) from subsequent
// visits (verify). Links are valid for 7 days.

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface PartnerContext extends Record<string, unknown> {
  id: number;
  short_name: string | null;
  long_name: string | null;
  password_hash: string | null;
  password_set_at: string | null;
}

async function resolvePartner(pid: number): Promise<PartnerContext | null> {
  const rows = await query<PartnerContext>(
    `SELECT id, short_name, long_name, password_hash, password_set_at
       FROM reporting_platform.partners WHERE id = $1`,
    [pid]
  );
  return rows[0] ?? null;
}

function sessionFor(ctx: PartnerContext) {
  return {
    user: {
      id: ctx.short_name,
      name: ctx.long_name || ctx.short_name,
      role: "partner" as const,
      organization: ctx.short_name,
      partner_id: ctx.id,
    },
    redirect: "/partner",
  };
}

export async function POST(req: NextRequest) {
  // Only the admin mints setup links; recipients use GET/PUT without a session.
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  if (!magicLinkEnabled()) {
    return NextResponse.json(
      { error: "Setup links are not configured (set MAGIC_LINK_SECRET or ADMIN_PASSWORD)." },
      { status: 503 }
    );
  }

  let body: { partnerId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const partnerId = Number(body.partnerId);
  if (!partnerId) return NextResponse.json({ error: "partnerId is required" }, { status: 400 });

  try {
    const rows = await query(`SELECT id FROM reporting_platform.partners WHERE id = $1`, [partnerId]);
    if (!rows.length) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    const token = createMagicToken({ pid: partnerId, exp: Date.now() + TTL_MS });
    return NextResponse.json({ token });
  } catch (err) {
    logger.error("POST /api/auth/magic error:", err);
    return NextResponse.json({ error: "Could not create setup link" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const payload = verifyMagicToken(req.nextUrl.searchParams.get("token") ?? "");
  if (!payload) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });
  }

  try {
    const ctx = await resolvePartner(payload.pid);
    if (!ctx) {
      return NextResponse.json({ error: "This partner account is no longer available." }, { status: 404 });
    }
    return NextResponse.json({
      name: ctx.long_name || ctx.short_name,
      needsSetup: ctx.password_set_at === null,
    });
  } catch (err) {
    logger.error("GET /api/auth/magic error:", err);
    return NextResponse.json({ error: "Could not open setup link" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = verifyMagicToken(body.token ?? "");
  if (!payload) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });
  }
  const password = body.password ?? "";
  if (!password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  try {
    const ctx = await resolvePartner(payload.pid);
    if (!ctx) {
      return NextResponse.json({ error: "This partner account is no longer available." }, { status: 404 });
    }

    if (ctx.password_set_at === null) {
      // First use: set the partner's password (rules in lib/password-policy).
      const policyError = passwordPolicyError(password);
      if (policyError) {
        return NextResponse.json({ error: policyError }, { status: 400 });
      }
      await query(
        `UPDATE reporting_platform.partners
            SET password_hash = $1, password_set_at = NOW()
          WHERE id = $2`,
        [hashPassword(password), ctx.id]
      );
      // A new password has been set: a locked account is unlocked, and every
      // login made with the old password (any device) is ended.
      await clearFailures(partnerKey(ctx.id));
      await bumpPartnerVersion(ctx.id);
    } else {
      // Subsequent use: verify the password they set. Guesses are limited and
      // share the account's counter with the normal login page; a locked
      // account stays locked until CRAF'd resets the password.
      const key = partnerKey(ctx.id);
      const lock = await lockStatus(key);
      if (lock.locked) {
        return NextResponse.json({ error: lockedMessage(lock.minutes), attemptsLeft: 0 }, { status: 429 });
      }
      if (!ctx.password_hash || !verifyPassword(password, ctx.password_hash)) {
        const left = await recordFailure(key);
        return NextResponse.json(
          { error: attemptsLeftMessage(left, "Incorrect password."), attemptsLeft: left },
          { status: left > 0 ? 401 : 429 }
        );
      }
      await clearFailures(key);
    }

    const session = sessionFor(ctx);
    const token = await createSessionToken({
      role: "partner",
      org: ctx.short_name,
      partner_id: ctx.id,
      name: session.user.name || ctx.short_name || "",
      // The current version (after any bump above), so this login stays valid.
      ver: (await partnerVersion(ctx.id)) ?? 0,
    });
    return setSessionCookie(NextResponse.json(session), token);
  } catch (err) {
    logger.error("PUT /api/auth/magic error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
