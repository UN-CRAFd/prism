"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { ArrowRight, FileText } from "lucide-react";
import labels from "@/lib/labels";
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
        setReports(all);
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

  // Only show Open and Under Review reports; Closed reports are excluded.
  const activeReports = reports.filter(
    (r) => r.status === "Open" || r.status === "Under Review"
  );

  // Group by year, newest first. Empty year sections cannot occur because we
  // filtered above before grouping.
  const byYear = activeReports.reduce<Record<number, Report[]>>((acc, r) => {
    (acc[r.year] ??= []).push(r);
    return acc;
  }, {});
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="bg-neutral-950 text-white px-8 py-8">
        <h1 className="t-title-banner">{labels.dashboard.title}</h1>
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

        {!loading && !error && years.length === 0 && (
          <div className="rounded-xl border bg-card px-6 py-12 text-center mt-4">
            <FileText className="mx-auto size-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {labels.dashboard.empty}
            </p>
          </div>
        )}

        {!loading && !error && years.length > 0 && (
          <div className="flex flex-col gap-10 pt-8">
            {years.map((year) => (
              <section key={year}>
                <h2 className="t-heading-section mb-3">{year}</h2>
                <div className="rounded-xl border bg-card overflow-hidden divide-y">
                  {byYear[year].map((report) => {
                    const started = completion[report.id] ?? 0;
                    const pct = Math.min(100, Math.round((started / 7) * 100));
                    return (
                      <div
                        key={report.id}
                        className="px-6 py-4 flex items-center gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-sm font-medium truncate">{report.project_title}</p>
                            <StatusPill status={report.status} />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-crafd-yellow rounded-full transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            router.push(
                              `/partner/report-editor/${toSlug(report)}/${report.year}/overview`
                            )
                          }
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-crafd-yellow px-3 py-1.5 text-sm font-semibold text-black hover:bg-crafd-yellow/90 transition-colors"
                        >
                          {labels.dashboard.openReport}
                          <ArrowRight className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
