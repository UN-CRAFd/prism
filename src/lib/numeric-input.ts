// Sanitise a decimal input: digits and a single decimal point only.
// Negatives and text are unrepresentable rather than rejected.
export function numericAmount(v: string): string {
  const s = v.replace(/[^\d.]/g, "");
  const i = s.indexOf(".");
  return i === -1 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
}

// Sanitise a whole-number input: digits only.
export function numericInteger(v: string): string {
  return v.replace(/\D/g, "");
}

// Sanitise a year input: digits only, capped at 4 characters.
export function numericYear(v: string): string {
  return numericInteger(v).slice(0, 4);
}

// Matches the indicator_data year CHECK constraint in db/schema.sql.
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2050;

export function isValidYear(v: number | null): boolean {
  return v === null || (v >= MIN_YEAR && v <= MAX_YEAR);
}

// Project duration ceiling. Beyond this, date arithmetic overflows and
// the value is not a plausible grant length.
export const MAX_DURATION_MONTHS = 120;

export function clampDuration(v: string): string {
  const digits = numericInteger(v);
  if (digits === "") return "";
  return String(Math.min(Number(digits), MAX_DURATION_MONTHS));
}
