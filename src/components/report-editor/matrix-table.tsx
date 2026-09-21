import { Fragment, type CSSProperties, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";

// Shared shell for the report editor's "year-matrix" tables (indicators,
// transfers, complementary funding). They all share the same frame: a set of
// frozen left columns, a scrollable band of per-year column groups (each split
// into sub-columns), and optional trailing frozen columns (subtotal, delete).
//
// Only the frame + header live here so a styling/width/border change is a
// single edit. The bespoke <tbody>/<tfoot> are passed as children.

export const MATRIX_TABLE = "w-full text-sm border-separate border-spacing-0";

// Expand / collapse affordance for a table that lives in a height-capped box.
// The fullscreen gesture: two corner arrows on the top-left ↔ bottom-right
// diagonal, pointing outwards to expand and inwards to collapse. lucide's
// Maximize2/Minimize2 are the same idea drawn on the other diagonal, so the
// paths below are those mirrored (x → 24-x), kept in lucide's 24x24 stroke
// style so the icon sits with the rest of the set.
export function TableExpandToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const label = expanded ? "Collapse table to fit the page" : "Expand table to show all rows";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      className="shrink-0 text-muted-foreground/70 hover:text-foreground transition-colors"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden="true"
      >
        {expanded ? (
          <>
            <path d="M4 10h6V4" />
            <path d="m10 10-7-7" />
            <path d="M20 14h-6v6" />
            <path d="m14 14 7 7" />
          </>
        ) : (
          <>
            <path d="M9 3H3v6" />
            <path d="m3 3 7 7" />
            <path d="M15 21h6v-6" />
            <path d="m21 21-7-7" />
          </>
        )}
      </svg>
    </button>
  );
}

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
  trailingCols = [],
  fillHeight = false,
  hugContent = false,
  maxHeightPx,
  cardRef,
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
  // fillHeight only: let the card stop under its last row instead of stretching to
  // the bottom of its slot. The slot still claims the same share of the height —
  // this only decides whether a short table draws its border around the rows and
  // leaves the rest blank, or around the whole (mostly empty) slot.
  hugContent?: boolean;
  // Without fillHeight the card is as tall as its rows. Pass a pixel cap to hold
  // it at a measured height instead and let the body scroll inside — used to pin
  // a table at the size it already had when a sibling was expanded out of the
  // shared flex layout.
  maxHeightPx?: number;
  // The visible card (border + scroll box), so callers can measure its height.
  cardRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    // Outer = invisible layout slot that claims the height; inner = the visible card.
    // Splitting them is what makes `hugContent` possible: the slot keeps its size
    // while the card is free to be shorter.
    <div className={cn(fillHeight && "flex-1 min-h-0")}>
    <div
      ref={cardRef}
      style={maxHeightPx === undefined ? undefined : { maxHeight: maxHeightPx }}
      className={cn(
        "rounded-xl border bg-card",
        fillHeight
          ? (hugContent ? "max-h-full overflow-auto" : "h-full overflow-auto")
          : (maxHeightPx === undefined ? "overflow-x-auto" : "overflow-auto")
      )}
    >
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
                  "px-2 text-center text-muted-foreground border-l border-b",
                  YEAR_ROW_HEIGHT,
                  HEAD_TEXT,
                  year === currentYear ? CURRENT_YEAR_HEAD : "bg-neutral-100",
                  fillHeight && "sticky top-0 z-30"
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
    </div>
  );
}
