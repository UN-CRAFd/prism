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
  trailingCols = [],
  fillHeight = false,
  children,
}: {
  minWidth: number;
  leadingCols: MatrixLeadingCol[];
  years: number[];
  currentYear: number | null;
  subCols: MatrixSubCol[];
  trailingCols?: MatrixTrailingCol[];
  // When true the table lives in a bounded scroll box (parent is a flex column)
  // and the two header rows freeze to the top as the body scrolls — same frozen
  // header the workplan grid uses. z-order: leading (corner) cells sit above the
  // top header (30) which sits above the frozen-left body cells (20); the corner
  // is the only place the two frozen axes overlap.
  fillHeight?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border bg-card", fillHeight ? "flex-1 min-h-0 overflow-auto" : "overflow-x-auto")}>
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
            {years.map((year) => (
              <th
                key={year}
                colSpan={subCols.length}
                className={cn(
                  "px-2 py-2 text-center text-muted-foreground border-l border-b",
                  HEAD_TEXT,
                  year === currentYear ? CURRENT_YEAR_HEAD : "bg-neutral-100",
                  fillHeight && "sticky top-0 z-30 h-8"
                )}
              >
                {year}
              </th>
            ))}
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
              return (
                <Fragment key={year}>
                  {subCols.map((sc, i) => (
                    <th
                      key={i}
                      className={cn("px-2 py-1.5 text-left border-b", SUBHEAD_TEXT, i === 0 && "border-l", sc.minWidth, bg, fillHeight && "sticky top-8 z-30")}
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
  );
}
