import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getSupportEmail, mailConfigured, sendMail } from "@/lib/mailer";
import { lockStatus, recordFailure } from "@/lib/login-throttle";

// POST { username } — "Forgot password" on the login page. Public (no session).
//
// E-mails the CRAF'd address set on the admin Settings page so the Secretariat
// can help (e.g. send a new share link). The reply is the same whether or not
// the username exists, so this cannot be used to find out which accounts exist.
// Rate-limited per username (3 an hour) and per network address (10 an hour)
// so it cannot be used to flood CRAF'd's inbox; requests over the limit get the
// same reply but send nothing.

const SENT = { message: "CRAF'd has been contacted and will be in touch. This might take a moment." };
const PER_USER = 3;
const PER_IP = 10;
const WINDOW_MIN = 60;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

// One line, no control characters, bounded — it goes into an e-mail.
function clean(s: string, max = 200): string {
  return s.replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export async function POST(request: Request) {
  let body: { username?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const username = clean(typeof body.username === "string" ? body.username : "");
  if (!username) {
    return NextResponse.json({ error: "Please enter your username first." }, { status: 400 });
  }

  try {
    const to = await getSupportEmail();
    if (!to || !mailConfigured()) {
      logger.error("Forgot password: no support e-mail set or SMTP not configured", undefined, {
        supportEmailSet: !!to, smtpConfigured: mailConfigured(),
      });
      return NextResponse.json(
        { error: "We could not contact CRAF'd automatically. Please contact your CRAF'd focal point or email crafd@un.org." },
        { status: 503 }
      );
    }

    // Over the limit: same reply, nothing sent.
    const ip = clientIp(request);
    const userKey = `forgot:${username.toLowerCase()}`;
    const ipKey = `forgot-ip:${ip}`;
    if ((await lockStatus(userKey)).locked || (await lockStatus(ipKey)).locked) {
      return NextResponse.json(SENT);
    }
    await recordFailure(userKey, PER_USER, WINDOW_MIN);
    await recordFailure(ipKey, PER_IP, WINDOW_MIN);

    const rows = await query<{ short_name: string; long_name: string | null; mail_account: string | null }>(
      `SELECT short_name, long_name, mail_account
         FROM reporting_platform.partners
        WHERE lower(short_name) = lower($1) OR lower(mail_account) = lower($1)
        LIMIT 1`,
      [username]
    );
    const p = rows[0];
    const who = username.toLowerCase() === "admin"
      ? "the shared CRAF'd Secretariat admin account"
      : p
        ? `${p.long_name || p.short_name} (${p.short_name})${p.mail_account ? `, account e-mail ${p.mail_account}` : ""}`
        : "no matching partner account (the username may be mistyped)";

    await sendMail({
      to,
      subject: `PRISM: password help requested for "${username}"`,
      text: [
        "Someone used \"Forgot password\" on the PRISM login page.",
        "",
        `Username entered: ${username}`,
        `Account: ${who}`,
        `Time (UTC): ${new Date().toISOString().replace("T", " ").slice(0, 19)}`,
        `Network address: ${ip}`,
        "",
        "To help a partner, open Admin > Partners and send them a new share link (valid for 7 days)",
        "or reset their password. If you did not expect this request, no action is needed.",
      ].join("\n"),
      ...(p?.mail_account ? { replyTo: p.mail_account } : {}),
    });
    return NextResponse.json(SENT);
  } catch (err) {
    logger.error("POST /api/auth/forgot error:", err);
    return NextResponse.json(
      { error: "We could not contact CRAF'd automatically. Please contact your CRAF'd focal point or email crafd@un.org." },
      { status: 503 }
    );
  }
}
