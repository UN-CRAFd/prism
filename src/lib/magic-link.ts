import { createHmac, timingSafeEqual } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Magic-link tokens. A short, URL-safe, HMAC-signed token that encodes a report
// id + expiry. Only the server (which holds the secret) can mint or verify one,
// so a link cannot be forged by editing the URL. Exchanged for a partner session
// by GET /api/auth/magic.
//
// Secret resolution mirrors admin login: MAGIC_LINK_SECRET, else ADMIN_PASSWORD.
// If neither is configured, magic links are disabled rather than falling back to
// a guessable value.
// ─────────────────────────────────────────────────────────────────────────────

const SECRET = process.env.MAGIC_LINK_SECRET || process.env.ADMIN_PASSWORD || "";

export interface MagicPayload {
  rid: number; // report id
  exp: number; // epoch ms expiry
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  let str = s.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

export function magicLinkEnabled(): boolean {
  return SECRET.length > 0;
}

export function createMagicToken(payload: MagicPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyMagicToken(token: string): MagicPayload | null {
  if (!SECRET) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = b64url(createHmac("sha256", SECRET).update(body).digest());
  const given = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  let payload: MagicPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.rid !== "number" || typeof payload.exp !== "number") return null;
  if (Date.now() > payload.exp) return null;
  return payload;
}
