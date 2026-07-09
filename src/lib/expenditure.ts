// Expenditure domain helpers: all totals/differences are computed from the two
// stored inputs (approved annual budgets + actual annual expenditure).

export interface ExpenditureCategory {
  id: number;
  name: string;
  sort_order: number;
}

// year → categoryId → amount
export type AmountMatrix = Record<number, Record<number, number | null>>;

export interface ExpenditureData {
  indirectRate: number;
  currentYear: number;
  categories: ExpenditureCategory[];
  years: number[]; // all report years for the project, ascending
  budgets: AmountMatrix; // approved annual budget
  expenditure: AmountMatrix; // actual annual expenditure
  comments: Record<number, Record<number, string | null>>; // year → categoryId → comment
}

export function num(v: number | null | undefined): number {
  return typeof v === "number" && !isNaN(v) ? v : 0;
}

// Σ of a category's amounts across every year in the matrix.
export function categoryTotal(matrix: AmountMatrix, categoryId: number): number {
  let sum = 0;
  for (const year of Object.keys(matrix)) {
    sum += num(matrix[Number(year)]?.[categoryId]);
  }
  return sum;
}

// Σ over the direct categories for one year (or the whole-project total when
// `matrix` is collapsed via categoryTotal upstream).
export function columnSubTotal(
  categories: ExpenditureCategory[],
  amounts: Record<number, number | null> | undefined
): number {
  return categories.reduce((acc, c) => acc + num(amounts?.[c.id]), 0);
}

export function indirect(subTotal: number, rate: number): number {
  return subTotal * rate;
}

export function grandTotal(subTotal: number, rate: number): number {
  return subTotal + indirect(subTotal, rate);
}

// USD formatting matching the reference sheet: thousands separators, no decimals,
// negatives as "-1,234". Blank for null so empty cells stay empty.
const FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatAmount(v: number | null | undefined, { blankZero = false } = {}): string {
  if (v === null || v === undefined) return "";
  if (blankZero && v === 0) return "";
  return FMT.format(Math.round(v));
}

// Difference = actual − approved (negative = underspend, as in the sheet).
export function difference(actual: number | null, approved: number | null): number {
  return num(actual) - num(approved);
}
