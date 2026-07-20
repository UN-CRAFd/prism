import { Fragment, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared shell for the report editor's "year-matrix" tables (indicators,
// transfers, complementary funding). They all share the same frame: a set of
// frozen left columns, a scrollable band of per-year column groups (each split
// into sub-columns), and optional trailing frozen columns (subtotal, delete).
//
// Only the frame + header live here so a styling/width/border change is a
// single edit. The bespoke <tbody>/<tfoot> are passed as children.

export const MATRIX_WRAPPER = "overflow-x-auto rounded-xl border bg-card";
export const MATRIX_TABLE = "w-full text-sm border-separate border-spacing-0";

// Shared header-cell base for a frozen leading column.
const HEAD_CELL = "px-3 py-2 font-medium text-muted-foreground border-b bg-neutral-100 align-bottom";

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
  children,
}: {
  minWidth: number;
  leadingCols: MatrixLeadingCol[];
  years: number[];
  currentYear: number | null;
  subCols: MatrixSubCol[];
  trailingCols?: MatrixTrailingCol[];
  children: ReactNode;
}) {
  return (
    <div className={MATRIX_WRAPPER}>
      <table className={MATRIX_TABLE} style={{ minWidth }}>
        <thead>
          {/* Year-group header */}
          <tr className="text-xs">
            {leadingCols.map((c, i) => (
              <th key={i} rowSpan={2} style={c.style} className={cn("text-left border-r", HEAD_CELL)}>
                {c.label}
              </th>
            ))}
            {years.map((year) => (
              <th
                key={year}
                colSpan={subCols.length}
                className={cn(
                  "px-2 py-2 text-center font-semibold text-muted-foreground border-l border-b",
                  year === currentYear ? "bg-crafd-yellow/20" : "bg-neutral-100"
                )}
              >
                {year}
              </th>
            ))}
            {trailingCols.map((c, i) => (
              <th key={i} rowSpan={2} className={c.className}>
                {c.label}
              </th>
            ))}
          </tr>
          {/* Sub-column header */}
          <tr className="text-[11px] text-muted-foreground">
            {years.map((year) => {
              const bg = year === currentYear ? "bg-crafd-yellow/20" : "bg-neutral-50";
              return (
                <Fragment key={year}>
                  {subCols.map((sc, i) => (
                    <th
                      key={i}
                      className={cn("px-2 py-1.5 text-left font-medium border-b", i === 0 && "border-l", sc.minWidth, bg)}
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
