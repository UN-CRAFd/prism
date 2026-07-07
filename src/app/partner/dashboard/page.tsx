"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn, formatDate } from "@/lib/utils";
import { ArrowRight, FileText, CheckCircle2, Clock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Report {
  id: number;
  project_id: number;
  year: number;
  report_submission_date: string | null;
  authorized: boolean;
  created_at: string;
  project_title: string;
  project_short_name: string;
  partner_short_name: string;
  partner_long_name: string;
  indicator_count: number;
}

function toSlug(report: Report): string {
  return (report.project_short_name ?? report.project_title).toLowerCase();
}

function StatusBadge({ report }: { report: Report }) {
  if (report.authorized) {
    return (
      <Badge variant="outline" className="border-green-300 text-green-700 text-xs">
        <CheckCircle2 className="size-3 mr-1" />
        Authorized
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-300 text-amber-700 text-xs">
      <Clock className="size-3 mr-1" />
      Pending
    </Badge>
  );
}

export default function ReportingPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Group by year, descending
  const byYear = reports.reduce<Record<number, Report[]>>((acc, r) => {
    (acc[r.year] ??= []).push(r);
    return acc;
  }, {});
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  const latestYear = years[0] ?? null;
  const previousYears = years.slice(1);

  const allAuthorized = (list: Report[]) => list.every((r) => r.authorized);
  const anyAuthorized = (list: Report[]) => list.some((r) => r.authorized);

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="bg-neutral-950 text-white px-8 py-8">
        <h1 className="text-3xl font-bold font-qanelas">Reporting</h1>
        {mounted && (
          <p className="text-neutral-400 text-sm mt-2">
            CRAF&apos;d Annual Reporting Platform &middot;{" "}
            {user?.organization ?? user?.name}
          </p>
        )}
      </div>

      <div className="flex-1 px-8 py-8 max-w-5xl">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading reports…</p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && reports.length === 0 && (
          <div className="rounded-xl border bg-card px-6 py-12 text-center mt-4">
            <FileText className="mx-auto size-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No reports found for your organization.
            </p>
          </div>
        )}

        {!loading && !error && latestYear !== null && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-8">

            {/* ── Latest year — featured card ── */}
            <section className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold">
                  {latestYear} Annual Report
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-2 text-xs",
                      allAuthorized(byYear[latestYear])
                        ? "border-green-300 text-green-700"
                        : anyAuthorized(byYear[latestYear])
                        ? "border-amber-300 text-amber-700"
                        : "border-neutral-300 text-neutral-500"
                    )}
                  >
                    {allAuthorized(byYear[latestYear])
                      ? "Authorized"
                      : anyAuthorized(byYear[latestYear])
                      ? "Partial"
                      : "Pending"}
                  </Badge>
                </h2>
                <span className="text-sm text-muted-foreground">
                  {byYear[latestYear].length} project{byYear[latestYear].length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="divide-y">
                  {byYear[latestYear].map((report) => (
                    <div key={report.id} className="px-6 py-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{report.project_title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <StatusBadge report={report} />
                          {report.report_submission_date && (
                            <span className="text-xs text-muted-foreground">
                              Submitted {formatDate(report.report_submission_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => router.push(`/partner/${toSlug(report)}/${report.year}/overview`)}
                        className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Open <ChevronRight className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Footer CTA */}
                <div className="px-6 py-4 border-t bg-muted/20 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {allAuthorized(byYear[latestYear])
                      ? "All reports authorized for " + latestYear
                      : "Continue filling out your " + latestYear + " annual report"}
                  </p>
                  <button
                    onClick={() => router.push(`/partner/${toSlug(byYear[latestYear][0])}/${latestYear}/overview`)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-crafd-yellow px-4 py-2 text-sm font-semibold text-black hover:bg-crafd-yellow/90 transition-colors"
                  >
                    {allAuthorized(byYear[latestYear]) ? "Review" : "Open report"}
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </div>
            </section>

            {/* ── Previous years ── */}
            {previousYears.length > 0 && (
              <section className="lg:col-span-1">
                <h2 className="text-base font-semibold mb-3">Previous years</h2>
                <div className="flex flex-col gap-3">
                  {previousYears.map((year) => {
                    const yearReports = byYear[year];
                    const authorized = yearReports.filter((r) => r.authorized).length;
                    const total = yearReports.length;
                    const done = allAuthorized(yearReports);
                    const partial = anyAuthorized(yearReports);

                    return (
                      <button
                        key={year}
                        onClick={() => router.push(`/partner/${toSlug(yearReports[0])}/${year}/overview`)}
                        className="group rounded-xl border bg-card p-5 text-left hover:border-neutral-300 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <span className="text-2xl font-bold font-qanelas">{year}</span>
                          <span
                            className={cn(
                              "text-xs font-medium rounded-full px-2 py-0.5 border",
                              done
                                ? "bg-green-50 text-green-700 border-green-200"
                                : partial
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-neutral-100 text-neutral-400 border-neutral-200"
                            )}
                          >
                            {done ? "Authorized" : partial ? "Partial" : "Pending"}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {authorized} of {total} report{total !== 1 ? "s" : ""} authorized
                        </p>

                        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                          Open reports <ChevronRight className="size-3" />
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