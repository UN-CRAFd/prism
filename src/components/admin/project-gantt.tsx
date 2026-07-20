"use client";

import { useMemo } from "react";
import { formatDate } from "@/lib/utils";

export interface GanttProject {
  id: number;
  project_title: string;
  short_name: string | null;
  partner_short_name: string | null;
  project_start_date: string | null;
  project_duration_months: number | null;
}

export interface GanttReport {
  id: number;
  project_id: number;
  year: number;
  report_type: "annual" | "final" | null;
  report_submission_date: string | null;
}

// Distinct, reasonably-saturated bar colours; assigned per partner so a partner's
// projects share a colour across the chart.
const PALETTE = [
  "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444",
  "#06b6d4", "#f97316", "#14b8a6", "#ec4899", "#84cc16",
];

const LABEL_W = "14rem";

// Parse just the date portion in local time so a "YYYY-MM-DD" (or ISO datetime)
// never shifts a day across time zones.
function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// A report sits at its submission date, or mid-year of its reporting year when
// no date is set.
function reportDate(r: GanttReport): Date {
  return r.report_submission_date ? parseDate(r.report_submission_date) : new Date(r.year, 6, 1);
}

export function ProjectGantt({ projects, reports = [] }: { projects: GanttProject[]; reports?: GanttReport[] }) {
  const reportsByProject = useMemo(() => {
    const map = new Map<number, GanttReport[]>();
    for (const r of reports) {
      const list = map.get(r.project_id) ?? [];
      list.push(r);
      map.set(r.project_id, list);
    }
    return map;
  }, [reports]);

  const model = useMemo(() => {
    const dated = projects
      .filter((p) => p.project_start_date && p.project_duration_months)
      .map((p) => {
        const start = parseDate(p.project_start_date!);
        return { ...p, start, end: addMonths(start, p.project_duration_months!) };
      })
      .sort(
        (a, b) =>
          a.start.getTime() - b.start.getTime() ||
          (a.short_name || a.project_title).localeCompare(b.short_name || b.project_title)
      );

    if (dated.length === 0) return null;

    // Range spans whole calendar years: Jan 1 of the earliest start → Jan 1 after
    // the latest end.
    const minYear = Math.min(...dated.map((d) => d.start.getFullYear()));
    const maxEnd = new Date(Math.max(...dated.map((d) => d.end.getTime())));
    const maxYear =
      maxEnd.getMonth() === 0 && maxEnd.getDate() === 1
        ? maxEnd.getFullYear()
        : maxEnd.getFullYear() + 1;

    const rangeStart = new Date(minYear, 0, 1).getTime();
    const rangeEnd = new Date(maxYear, 0, 1).getTime();
    const span = rangeEnd - rangeStart;

    const years: number[] = [];
    for (let y = minYear; y < maxYear; y++) years.push(y);

    const partners = Array.from(new Set(dated.map((d) => d.partner_short_name || "—")));

    return { dated, years, partners, rangeStart, span };
  }, [projects]);

  const skipped = projects.length - (model?.dated.length ?? 0);

  if (!model) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        No projects have both a start date and a duration set, so there is nothing to chart yet.
      </div>
    );
  }

  const { dated, years, partners, rangeStart, span } = model;
  const pct = (t: number) => ((t - rangeStart) / span) * 100;
  const colorFor = (partner: string | null) =>
    PALETTE[Math.max(0, partners.indexOf(partner || "—")) % PALETTE.length];

  const todayPct = pct(Date.now());
  const showToday = todayPct >= 0 && todayPct <= 100;

  return (
    <div className="rounded-xl border bg-card p-4 overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Year scale */}
        <div className="flex">
          <div style={{ width: LABEL_W }} className="shrink-0" />
          <div className="relative flex-1 h-6">
            {years.map((y) => {
              const left = pct(new Date(y, 0, 1).getTime());
              const width = pct(new Date(y + 1, 0, 1).getTime()) - left;
              return (
                <div
                  key={y}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  className="absolute top-0 text-center text-xs font-medium text-muted-foreground"
                >
                  {y}
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows */}
        <div className="flex">
          {/* Project labels */}
          <div style={{ width: LABEL_W }} className="shrink-0">
            {dated.map((d) => (
              <div key={d.id} className="h-9 flex items-center pr-3">
                <span
                  className="truncate text-sm font-medium"
                  title={`${d.short_name || d.project_title}${d.partner_short_name ? ` · ${d.partner_short_name}` : ""}`}
                >
                  {d.short_name || d.project_title}
                </span>
              </div>
            ))}
          </div>

          {/* Timeline track */}
          <div className="relative flex-1">
            {/* Year gridlines */}
            {years.map((y) => (
              <div
                key={y}
                style={{ left: `${pct(new Date(y, 0, 1).getTime())}%` }}
                className="absolute top-0 bottom-0 border-l border-border/60"
              />
            ))}
            <div className="absolute top-0 bottom-0 right-0 border-l border-border/60" />

            {/* Today marker */}
            {showToday && (
              <div
                style={{ left: `${todayPct}%` }}
                className="absolute top-0 bottom-0 z-20 border-l-2 border-red-500"
              >
                <span className="absolute top-0 left-1 text-[10px] font-semibold text-red-500">today</span>
              </div>
            )}

            {/* Bars */}
            {dated.map((d) => {
              const left = pct(d.start.getTime());
              const width = pct(d.end.getTime()) - left;
              return (
                <div key={d.id} className="h-9 relative">
                  <div
                    style={{ left: `${left}%`, width: `${width}%`, backgroundColor: colorFor(d.partner_short_name) }}
                    className="absolute top-1.5 h-6 rounded-md flex items-center px-2 overflow-hidden z-10 shadow-sm ring-1 ring-black/5"
                    title={`${d.short_name || d.project_title}\n${d.partner_short_name ?? ""}\n${formatDate(d.start)} – ${formatDate(d.end)} · ${d.project_duration_months} months`}
                  >
                    <span className="truncate text-[11px] font-semibold text-white/95">
                      {d.project_duration_months} mo
                    </span>
                  </div>

                  {/* Report markers — a tick on the bar per report */}
                  {(reportsByProject.get(d.id) ?? []).map((r) => {
                    const rp = pct(reportDate(r).getTime());
                    if (rp < left || rp > left + width) return null;
                    return (
                      <div
                        key={r.id}
                        style={{ left: `${rp}%` }}
                        className="absolute top-1.5 h-6 w-0.5 -translate-x-1/2 bg-white/90 z-30"
                        title={`${r.report_type ?? "annual"} report ${r.year}${r.report_submission_date ? ` · due ${formatDate(r.report_submission_date)}` : ""}`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
          {partners.map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-3 rounded-sm" style={{ backgroundColor: colorFor(p) }} />
              {p}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-3 w-0.5 bg-neutral-500" />
            report
          </span>
        </div>

        {skipped > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {skipped} project{skipped > 1 ? "s" : ""} without a start date or duration {skipped > 1 ? "are" : "is"} not shown.
          </p>
        )}
      </div>
    </div>
  );
}
