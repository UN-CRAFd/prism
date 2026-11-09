import nodemailer, { type Transporter } from "nodemailer";
import { query } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Outgoing e-mail (currently only "Forgot password" requests to CRAF'd).
//
// Sent over SMTP, configured through environment variables — works with
// Microsoft 365 / Exchange Online, SendGrid, Mailgun and most other providers:
//
//   SMTP_HOST      e.g. smtp.office365.com
//   SMTP_PORT      587 (STARTTLS, default) or 465 (TLS)
//   SMTP_USER      the sending account
//   SMTP_PASSWORD  its password / app password / API key
//   SMTP_FROM      the From address (defaults to SMTP_USER)
//
// WHO receives the requests is not an environment setting: CRAF'd sets that
// address on the admin Settings page (app_settings key 'support_email').
// ─────────────────────────────────────────────────────────────────────────────

export const SUPPORT_EMAIL_KEY = "support_email";

let transporter: Transporter | null = null;

export function mailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 587 upgrades with STARTTLS
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  return transporter;
}

export async function sendMail(msg: { to: string; subject: string; text: string; replyTo?: string }): Promise<void> {
  if (!mailConfigured()) throw new Error("SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASSWORD)");
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
  });
}

/** The CRAF'd address "Forgot password" requests go to, or null if not set. */
export async function getSupportEmail(): Promise<string | null> {
  const rows = await query<{ value: string }>(
    `SELECT value FROM reporting_platform.app_settings WHERE key = $1 LIMIT 1`,
    [SUPPORT_EMAIL_KEY]
  );
  const v = rows[0]?.value?.trim();
  return v ? v : null;
}

export async function setSupportEmail(email: string | null): Promise<void> {
  if (!email) {
    await query(`DELETE FROM reporting_platform.app_settings WHERE key = $1`, [SUPPORT_EMAIL_KEY]);
    return;
  }
  await query(
    `INSERT INTO reporting_platform.app_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [SUPPORT_EMAIL_KEY, email]
  );
}

/** A plain, reasonable e-mail address check (no display names, no lists). */
export function isEmail(v: string): boolean {
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(v) && v.length <= 254;
}
