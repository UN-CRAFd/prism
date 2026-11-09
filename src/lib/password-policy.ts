// ─────────────────────────────────────────────────────────────────────────────
// Partner password rules. Shared by the share-link page (shown live while
// typing) and the server (which enforces them — the page is not a trust
// boundary). No server-only imports, so it is safe in client components.
// ─────────────────────────────────────────────────────────────────────────────

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (pw) => pw.length >= PASSWORD_MIN_LENGTH },
  { label: "At least one uppercase letter", test: (pw) => /\p{Lu}/u.test(pw) },
  { label: "At least one number", test: (pw) => /\p{Nd}/u.test(pw) },
  // Any character that is not a letter, digit or space: ! ? @ # - _ . etc.
  { label: "At least one special character (e.g. ! ? @ # -)", test: (pw) => /[^\p{L}\p{N}\s]/u.test(pw) },
];

/** The rules the password does not meet yet (empty = acceptable). */
export function unmetPasswordRules(pw: string): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label);
}

/** One sentence for an error message, or null when the password is acceptable. */
export function passwordPolicyError(pw: string): string | null {
  const unmet = unmetPasswordRules(pw);
  if (!unmet.length) return null;
  return `The password needs: ${unmet.map((u) => u.charAt(0).toLowerCase() + u.slice(1)).join(", ")}.`;
}
