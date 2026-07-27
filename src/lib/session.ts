// ─────────────────────────────────────────────────────────────────────────────
// Server-side sessions. On successful login (password or share-link) the server
// mints a signed, HMAC-SHA256 token carrying the caller's role + organization and
// sets it as an httpOnly cookie. Every request is authenticated by verifying that
// cookie — the client can no longer grant itself a role by editing localStorage.
//
// Implemented with the Web Crypto API (no Node `crypto`, no `Buffer`) so the exact
// same verify path runs in both the Edge middleware and the Node route handlers.
//
// Secret resolution: SESSION_SECRET, else ADMIN_PASSWORD (so the app keeps working
// with no new config). A dedicated SESSION_SECRET is strongly recommended so that
// rotating the admin password does not invalidate every session, and so the admin
// credential is not reused as a signing key. If neither is set, sessions are
// disabled and every guarded request is rejected.
// ─────────────────────────────────────────────────────────────────────────────

const SECRET = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";

export const SESSION_COOKIE = "crafd_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type Role = "admin" | "partner";

export interface Session {
  role: Role;
  /** Partner short_name (the ownership key). `null` for admin. */
  org: string | null;
  name: string;
  exp: number; // epoch ms
}

export function sessionsEnabled(): boolean {
  return SECRET.length > 0;
}

// ── base64url without Buffer (works on Edge + Node) ──────────────────────────
function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  let str = s.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sign(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function createSessionToken(
  input: { role: Role; org: string | null; name: string; exp?: number }
): Promise<string> {
  const payload: Session = {
    role: input.role,
    org: input.org,
    name: input.name,
    exp: input.exp ?? Date.now() + SESSION_TTL_MS,
  };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64urlEncode(await sign(body));
  return `${body}.${sig}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<Session | null> {
  if (!SECRET || !token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = b64urlEncode(await sign(body));
  if (!timingSafeEqual(b64urlDecode(sig), b64urlDecode(expected))) return null;

  let payload: Session;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return null;
  }
  if (payload.role !== "admin" && payload.role !== "partner") return null;
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
  return payload;
}
