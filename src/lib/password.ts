import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Password hashing using Node's built-in scrypt (no external dependency).
 * Stored format: `scrypt:<salt-hex>:<hash-hex>`.
 */

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;

  const parts = stored.split(":");
  // Legacy rows stored the password in plain text — compare directly so
  // existing partners are not locked out. They get re-hashed on next save.
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return stored === password;
  }

  const [, salt, hashHex] = parts;
  const derived = scryptSync(password, salt, KEY_LEN);
  const hashBuf = Buffer.from(hashHex, "hex");
  if (hashBuf.length !== derived.length) return false;
  return timingSafeEqual(hashBuf, derived);
}

export function isHashed(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith("scrypt:");
}
