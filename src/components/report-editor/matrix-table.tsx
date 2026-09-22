import { Fragment, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared shell for the report editor's "year-matrix" tables (indicators,
// transfers, complementary funding). They all share the same frame: a set of
// frozen left columns, a scrollable band of per-year column groups (each split
// into sub-columns), and optional trailing frozen columns (subtotal, delete).
//
// Only the frame + header live here so a styling/width/border change is a
// single edit. The bespoke <tbody>/<tfoot> are passed as children.

export const MATRIX_TABLE = "w-full text-sm border-separate border-spacing-0";

// Unified column-header typography for every quant table (report + prodoc).
// HEAD_TEXT: primary column headers (row labels, year groups, single-row heads).
// SUBHEAD_TEXT: the second header row (year → sub-columns / quarters).
// Both bold, one step larger than the old text-xs/text-[11px] headers.
export const HEAD_TEXT = "text-sm font-bold";
export const SUBHEAD_TEXT = "text-xs font-bold";

// Shared header-cell base for a frozen leading column.
const HEAD_CELL = `px-3 py-2 ${HEAD_TEXT} text-muted-foreground border-b bg-neutral-100 align-bottom`;

// The frozen header is two stacked rows, so row two's sticky offset has to equal
// row one's *rendered* height exactly — a mismatch makes the sub-column header
// slide up into the year row as the body scrolls. `height` on a table cell is only
// a minimum, so row one is pinned at h-9 (36px) with padding small enough that its
// text can never outgrow it: 20px line-height + 12px (py-1.5) + 1px border = 33px.
// Keep these two in step; changing the padding or type scale means re-deriving both.
const YEAR_ROW_HEIGHT = "h-9 py-1.5";
const SUBHEAD_STICKY_TOP = "top-9";

// Current-year header highlight. An OPAQUE blend (crafd-yellow 20% mixed into
// white — visually identical to bg-crafd-yellow/20 over the white card) so that
// when the header is frozen (fillHeight), body rows scrolling underneath stay
// hidden instead of bleeding through a translucent tint.
export const CURRENT_YEAR_HEAD = "bg-[color-mix(in_srgb,var(--color-crafd-yellow)_20%,white)]";

export interface MatrixLeadingCol {
  label: ReactNode;
  style: CSSProperties; // sticky position + width (from ifz/tfz)
}

export interface MatrixSubCol {
  label: ReactNode;
  minWidth?: string; // tailwind min-w-[..] utility
}

export interface MatrixTrailingCol {
  label?: ReactNode;
  className: string; // fully specified — these vary (subtotal vs delete spacer)
}

export function MatrixTableShell({
  minWidth,
  leadingCols,
  years,
  currentYear,
  subCols,
  pastSubCols,
  trailingCols = [],
  fillHeight = false,
  hugContent = false,
  footer,
  children,
}: {
  minWidth: number;
  leadingCols: MatrixLeadingCol[];
  years: number[];
  currentYear: number | null;
  subCols: MatrixSubCol[];
  // When provided, non-current years use these sub-columns instead of subCols.
  // If omitted, all years use subCols (preserves existing behaviour).
  pastSubCols?: MatrixSubCol[];
  trailingCols?: MatrixTrailingCol[];
  // When true the table lives in a bounded scroll box (parent is a flex column)
  // and the two header rows freeze to the top as the body scrolls — same frozen
  // header the workplan grid uses. z-order: leading (corner) cells sit above the
  // top header (30) which sits above the frozen-left body cells (20); the corner
  // is the only place the two frozen axes overlap.
  fillHeight?: boolean;
  // fillHeight only: let the card stop under its last row instead of stretching to
  // the bottom of its slot. The slot still claims the same share of the height —
  // this only decides whether a short table draws its border around the rows and
  // leaves the rest blank, or around the whole (mostly empty) slot.
  hugContent?: boolean;
  // Rendered inside the layout slot, directly under the card, so it tracks the
  // card's real bottom edge. A control left as a sibling of the slot gets pinned to
  // the bottom of the tab instead, stranded far below a short table. Turning the
  // slot into a flex column also means the card has to stop claiming the full slot
  // height, or it would overflow past the footer — hence the class swaps below.
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    // Outer = invisible layout slot that claims the height; inner = the visible card.
    // Splitting them is what makes `hugContent` possible: the slot keeps its size
    // while the card is free to be shorter.
    <div className={cn(fillHeight && "flex-1 min-h-0", footer && "flex flex-col gap-2")}>
    <div className={cn(
      "rounded-xl border bg-card",
      fillHeight
        ? (hugContent
            ? cn("overflow-auto", footer ? "min-h-0" : "max-h-full")
            : cn("overflow-auto", footer ? "min-h-0 flex-1" : "h-full"))
        : "overflow-x-auto"
    )}>
      <table className={MATRIX_TABLE} style={{ minWidth }}>
        <thead>
          {/* Year-group header */}
          <tr className="text-xs">
            {leadingCols.map((c, i) => (
              <th
                key={i}
                rowSpan={2}
                style={fillHeight ? { ...c.style, top: 0, zIndex: 40 } : c.style}
                className={cn("text-left border-r", HEAD_CELL, fillHeight && "sticky")}
              >
                {c.label}
              </th>
            ))}
            {years.map((year) => {
              const cols = (year !== currentYear && pastSubCols) ? pastSubCols : subCols;
              return (
                <th
                  key={year}
                  colSpan={cols.length}
                  className={cn(
                    "px-2 text-center text-muted-foreground border-l border-b",
                    YEAR_ROW_HEIGHT,
                    HEAD_TEXT,
                    year === currentYear ? CURRENT_YEAR_HEAD : "bg-neutral-100",
                    fillHeight && "sticky top-0 z-30"
                  )}
                >
                  {year}
                </th>
              );
            })}
            {trailingCols.map((c, i) => (
              <th key={i} rowSpan={2} className={cn(c.className, fillHeight && "sticky top-0 z-30")}>
                {c.label}
              </th>
            ))}
          </tr>
          {/* Sub-column header */}
          <tr className="text-[11px] text-muted-foreground">
            {years.map((year) => {
              const bg = year === currentYear ? CURRENT_YEAR_HEAD : "bg-neutral-50";
              const cols = (year !== currentYear && pastSubCols) ? pastSubCols : subCols;
              return (
                <Fragment key={year}>
                  {cols.map((sc, i) => (
                    <th
                      key={i}
                      className={cn("px-2 py-1.5 text-left border-b", SUBHEAD_TEXT, i === 0 && "border-l", sc.minWidth, bg, fillHeight && cn("sticky z-30", SUBHEAD_STICKY_TOP))}
                    >
                      {sc.label}
                    </th>
                  ))}
                </Fragment>
              );
            })}
          </tr>
        </thead>
        {children}
      </table>
    </div>
    {footer}
    </div>
  );
}
