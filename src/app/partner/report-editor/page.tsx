"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { ArrowRight, FileText, ChevronRight } from "lucide-react";
import labels from "@/lib/labels.json";
import type { Report } from "@/lib/types";

function toSlug(report: Report): string {
  return (report.project_short_name ?? report.project_title).toLowerCase();
}

const STATUS_PILL: Record<string, string> = {
  Open:           "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Under Review": "bg-amber-50 text-amber-700 border-amber-200",
  Closed:         "bg-neutral-100 text-neutral-500 border-neutral-200",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border",
      STATUS_PILL[status] ?? STATUS_PILL.Closed
    )}>
      {status}
    </span>
  );
}

export default function ReportEditorPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<Record<number, number>>({}); // reportId → sections started (0-7)

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        const res = await fetch("/api/reports?data_type=report");
        if (!res.ok) throw new Error("Failed to load reports");
        const all: Report[] = await res.json();
        const filtered = all.filter(
          (r) =>
            r.partner_short_name.toLowerCase() === user!.id.toLowerCase() ||
            r.partner_short_name === user!.organization
        );
        setReports(filtered);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  // Load completion data for each report
  useEffect(() => {
    if (reports.length === 0) return;
    Promise.all(
      reports.map((r) =>
        fetch(`/api/report-completion?reportId=${r.id}`)
          .then((res) => res.json())
          .then((data) => ({ id: r.id, filled: data.sectionsStarted ?? 0 }))
          .catch(() => ({ id: r.id, filled: 0 }))
      )
    ).then((results) => {
      const c: Record<number, number> = {};
      for (const { id, filled } of results) c[id] = filled;
      setCompletion(c);
    });
  }, [reports]);

  // Group by year, descending
  const byYear = reports.reduce<Record<number, Report[]>>((acc, r) => {
    (acc[r.year] ??= []).push(r);
    return acc;
  }, {});
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  const latestYear = years[0] ?? null;
  const previousYears = years.slice(1);

  const allClosed = (list: Report[]) => list.every((r) => r.status === "Closed");

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="bg-neutral-950 text-white px-8 py-8">
        <h1 className="text-3xl font-bold font-qanelas">{labels.dashboard.title}</h1>
        {mounted && (
          <p className="text-neutral-400 text-sm mt-2">
            {labels.dashboard.subtitle} &middot;{" "}
            {user?.organization ?? user?.name}
          </p>
        )}
      </div>

      <div className="flex-1 px-8 py-8">
        {loading && (
          <p className="text-sm text-muted-foreground">{labels.dashboard.loading}</p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && reports.length === 0 && (
          <div className="rounded-xl border bg-card px-6 py-12 text-center mt-4">
            <FileText className="mx-auto size-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {labels.dashboard.empty}
            </p>
          </div>
        )}

        {!loading && !error && latestYear !== null && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-8">

            {/* ── Latest year — featured card ── */}
            <section className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold">
                  {latestYear} {labels.dashboard.annualReport}
                </h2>
                <span className="text-sm text-muted-foreground">
                  {byYear[latestYear].length} project{byYear[latestYear].length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="divide-y">
                  {byYear[latestYear].map((report) => (
                    <div key={report.id} className="px-6 py-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{report.project_title}</p>
                        <StatusPill status={report.status} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer CTA */}
                <div className="px-6 py-4 border-t bg-muted/20 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {allClosed(byYear[latestYear])
                      ? "Reporting for " + latestYear + " is closed"
                      : "Continue filling out your " + latestYear + " annual report"}
                  </p>
                  <button
                    onClick={() => router.push(`/partner/${toSlug(byYear[latestYear][0])}/${latestYear}/overview`)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-crafd-yellow px-4 py-2 text-sm font-semibold text-black hover:bg-crafd-yellow/90 transition-colors"
                  >
                    {allClosed(byYear[latestYear]) ? labels.dashboard.review : labels.dashboard.openReport}
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </div>
            </section>

            {/* ── Previous years ── */}
            {previousYears.length > 0 && (
              <section className="lg:col-span-1">
                <h2 className="text-base font-semibold mb-3">{labels.dashboard.previousYears}</h2>
                <div className="flex flex-col gap-3">
                  {previousYears.map((year) => {
                    const yearReports = byYear[year];

                    return (
                      <button
                        key={year}
                        onClick={() => router.push(`/partner/${toSlug(yearReports[0])}/${year}/overview`)}
                        className="group rounded-xl border bg-card p-5 text-left hover:border-neutral-300 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <span className="text-2xl font-bold font-qanelas">{year}</span>
                        </div>

                        {(() => {
                          const started = yearReports.reduce((sum, r) => sum + (completion[r.id] ?? 0), 0);
                          const total = yearReports.length * 7;
                          const pct = total > 0 ? Math.min(100, Math.round((started / total) * 100)) : 0;
                          return (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-crafd-yellow rounded-full transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
                            </div>
                          );
                        })()}

                        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                          {labels.dashboard.openReports} <ChevronRight className="size-3" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

          </div>
        )}      </div>
    </div>
  );
}
