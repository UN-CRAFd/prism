"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn, formatDate } from "@/lib/utils";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  ListTodo,
  Zap,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface Report {
  id: number;
  year: number;
  report_submission_date: string | null;
  authorized: boolean;
  project_title: string;
  project_short_name: string;
  partner_short_name: string;
}

type TimelineType = "deadline" | "submission" | "feedback" | "info";

interface TimelineEvent {
  date: string;
  label: string;
  description: string;
  type: TimelineType;
  _dateObj: Date;
}

// ── Sub-components ─────────────────────────────────────────────────────────

const timelineConfig: Record<TimelineType, { dot: string; label: string }> = {
  deadline: { dot: "bg-red-500 ring-red-200", label: "text-red-600" },
  submission: { dot: "bg-green-500 ring-green-200", label: "text-green-700" },
  feedback: { dot: "bg-blue-500 ring-blue-200", label: "text-blue-600" },
  info: { dot: "bg-neutral-400 ring-neutral-200", label: "text-neutral-500" },
};

function toSlug(report: Report): string {
  return (report.project_short_name ?? report.project_title).toLowerCase();
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PartnerHomePage() {
  const { user } = useAuth();
  const router = useRouter();

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetch("/api/reports")
      .then((r) => r.json())
      .then((all: Report[]) => {
        const filtered = all.filter(
          (r) =>
            r.partner_short_name.toLowerCase() === user.id.toLowerCase() ||
            r.partner_short_name === user.organization
        );
        setReports(filtered);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const pendingReports = useMemo(
    () => reports.filter((r) => !r.authorized),
    [reports]
  );

  const timeline = useMemo<TimelineEvent[]>(() => {
    return reports
      .filter((r) => r.report_submission_date)
      .map((r) => ({
        date: formatDate(r.report_submission_date!),
        label: `${r.year} report deadline`,
        description: r.project_title,
        type: "deadline" as const,
        _dateObj: new Date(r.report_submission_date!),
      }))
      .sort((a, b) => a._dateObj.getTime() - b._dateObj.getTime());
  }, [reports]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const quickLinks = useMemo(() => {
    const links = [
      {
        label: "Reporting",
        description: "View all your reports",
        icon: FileText,
        href: "/partner/dashboard",
      },
    ];
    if (pendingReports.length > 0) {
      const r = pendingReports[0];
      links.push({
        label: "Current report",
        description: `Open ${r.year} — ${r.project_title}`,
        icon: Clock,
        href: `/partner/${toSlug(r)}/${r.year}/overview`,
      });
    }
    return links;
  }, [pendingReports]);

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <p className="text-neutral-400 text-sm mb-1">PRISM V.0.1</p>
        <h1 className="text-3xl font-bold font-qanelas">
          {greeting}, {user?.organization ?? user?.name}
        </h1>
        <p className="text-neutral-400 text-sm mt-2">Partner Dashboard</p>
      </div>

      <div className="flex-1 px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">

          {/* ── To-do ── */}
          <section className="lg:col-span-2 flex flex-col gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ListTodo className="size-4 text-muted-foreground" />
                  <h2 className="text-base font-semibold">To-do</h2>
                </div>
                {!loading && pendingReports.length > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-crafd-yellow text-black text-[10px] font-bold w-5 h-5">
                    {pendingReports.length}
                  </span>
                )}
              </div>

              <div className="rounded-xl border bg-card overflow-hidden divide-y">
                {loading ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  </div>
                ) : pendingReports.length === 0 ? (
                  <div className="flex items-center gap-3 px-4 py-6 justify-center">
                    <CheckCircle2 className="size-4 text-green-500" />
                    <p className="text-sm text-muted-foreground">
                      {reports.length === 0
                        ? "No active reporting cycles — check back later."
                        : "All reports authorized. Nothing pending."}
                    </p>
                  </div>
                ) : (
                  pendingReports.map((report) => (
                    <button
                      key={report.id}
                      onClick={() =>
                        router.push(
                          `/partner/${toSlug(report)}/${report.year}/overview`
                        )
                      }
                      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 group"
                    >
                      <AlertCircle className="size-4 text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          Complete {report.year} annual report
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {report.project_title} · Pending authorization
                        </p>
                      </div>
                      <ArrowRight className="size-3.5 shrink-0 mt-0.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* ── Quick access ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="size-4 text-muted-foreground" />
                <h2 className="text-base font-semibold">Quick access</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {quickLinks.map(({ label, description, icon: Icon, href }) => (
                  <button
                    key={href}
                    onClick={() => router.push(href)}
                    className="group rounded-xl border bg-card p-4 text-left hover:border-neutral-300 transition-colors flex items-start gap-3"
                  >
                    <div className="rounded-lg bg-muted p-2 shrink-0 group-hover:bg-accent transition-colors">
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ── Timeline ── */}
          <section className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold">Timeline</h2>
            </div>

            <div className="relative pl-4">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

              {!loading && timeline.length === 0 && (
                <p className="text-xs text-muted-foreground">No report deadlines found.</p>
              )}

              <ol className="flex flex-col gap-0">
                {timeline.map((event, i) => {
                  const cfg = timelineConfig[event.type];
                  const today = new Date();
                  const isPast = event._dateObj < today;
                  const isNext =
                    !isPast &&
                    timeline.slice(0, i).every((e) => e._dateObj < today);

                  return (
                    <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                      <div
                        className={cn(
                          "absolute -left-4 mt-0.5 size-3.5 rounded-full ring-2 ring-white shrink-0",
                          isNext
                            ? cfg.dot
                            : isPast
                            ? "bg-neutral-200 ring-white"
                            : "bg-white border-2 border-neutral-300"
                        )}
                      />
                      <div className="pl-2">
                        <p className={cn(
                          "text-[10px] font-semibold uppercase tracking-wider mb-0.5",
                          isNext ? cfg.label : "text-muted-foreground"
                        )}>
                          {event.date}
                          {isNext && (
                            <span className="ml-1.5 normal-case font-normal text-[9px] bg-crafd-yellow text-black rounded-full px-1.5 py-0.5">
                              Next
                            </span>
                          )}
                        </p>
                        <p className={cn(
                          "text-sm font-medium leading-snug",
                          isPast && !isNext && "text-muted-foreground"
                        )}>
                          {event.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                          {event.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
