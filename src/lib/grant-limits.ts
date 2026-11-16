// Requested funding amount (projects.grant_size_usd is NUMERIC(15,2)): the editor
// and the projects API share one cap so they can never disagree.
export const MAX_GRANT_SIZE_USD = 1_000_000_000;

/** True when a parsed amount is outside 0 … MAX_GRANT_SIZE_USD (NaN is not "out of range"). */
export function isGrantSizeOutOfRange(n: number): boolean {
  return Number.isFinite(n) && (n < 0 || n > MAX_GRANT_SIZE_USD);
}
