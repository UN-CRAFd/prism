"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn, formatDate } from "@/lib/utils";
import labels from "@/lib/labels.json";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ListTodo,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommentContextBadges } from "@/components/comment-context-badges";
import type { Report } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────

interface FeedbackComment {
  id: number;
  section: string;
  body: string;
  item_label: string | null;
  resolved: boolean;
  partner_addressed: boolean;
  year: number;
  report_type: "annual" | "final" | null;
  project_title: string;
  project_short_name: string | null;
}

type TimelineType = "start" | "deadline" | "end" | "now";

interface TimelineEvent {
  date: string;
  label: string;
  description: string;
  type: TimelineType;
  _dateObj: Date;
}

// ── Sub-components ─────────────────────────────────────────────────────────

const timelineConfig: Record<TimelineType, { dot: string; label: string }> = {
  start: { dot: "bg-green-500 ring-green-200", label: "text-green-700" },
  deadline: { dot: "bg-amber-500 ring-amber-200", label: "text-amber-600" },
  end: { dot: "bg-blue-500 ring-blue-200", label: "text-blue-600" },
  now: { dot: "bg-red-500 ring-red-200", label: "text-red-600" },
};

function toSlug(report: Report): string {
  return (report.project_short_name ?? report.project_title).toLowerCase();
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PartnerHomePage() {
  const { user } = useAuth();
  const router = useRouter();

  const [reports, setReports] = useState<Report[]>([]);
  // Prodocs (one per project) — the source of project dates, independent of
  // whether any reporting-year reports exist yet.
  const [projects, setProjects] = useState<Report[]>([]);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [loading, setLoading] = useState(true);
  // The greeting (time-based) and user (client-side auth) only exist on the
  // client; defer rendering them until mounted so hydration matches the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!user) return;
    const forPartner = (r: Report) =>
      r.partner_short_name.toLowerCase() === user.id.toLowerCase() ||
      r.partner_short_name === user.organization;

    fetch("/api/reports?data_type=report")
      .then((r) => r.json())
      .then((all: Report[]) => setReports(all.filter(forPartner)))
      .catch(() => {})
      .finally(() => setLoading(false));

    // Prodocs give us every project (and its dates) even with zero reports.
    fetch("/api/reports?data_type=prodoc")
      .then((r) => r.json())
      .then((all: Report[]) => setProjects(all.filter(forPartner)))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/comments?partnerShortName=${encodeURIComponent(user.organization || user.id)}`)
      .then((r) => r.json())
      .then((data: FeedbackComment[]) => setComments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [user]);

  // Partner-side "addressed" confirmation. Optimistic; reverts on failure.
  async function toggleAddressed(id: number, next: boolean) {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, partner_addressed: next } : c)));
    try {
      const res = await fetch("/api/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, partner_addressed: next }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, partner_addressed: !next } : c)));
    }
  }

  const pendingReports = useMemo(
    () => reports.filter((r) => !r.authorized),
    [reports]
  );

  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];

    // Project start & end — one pair per project, sourced from prodocs so they
    // show even when no reporting-year reports exist. Fall back to report rows
    // if prodocs haven't loaded for some reason.
    const projectRows = projects.length > 0 ? projects : reports;
    const seenProjects = new Set<number>();
    for (const r of projectRows) {
      if (seenProjects.has(r.project_id)) continue;
      seenProjects.add(r.project_id);
      if (!r.project_start_date) continue;

      const start = new Date(r.project_start_date);
      events.push({
        date: formatDate(start),
        label: "Project start",
        description: r.project_title,
        type: "start",
        _dateObj: start,
      });

      if (r.project_duration_months) {
        const end = new Date(start);
        end.setMonth(end.getMonth() + r.project_duration_months);
        events.push({
          date: formatDate(end),
          label: "Project end",
          description: r.project_title,
          type: "end",
          _dateObj: end,
        });
      }
    }

    // Report deadlines
    for (const r of reports) {
      if (!r.report_submission_date) continue;
      events.push({
        date: formatDate(r.report_submission_date),
        label: `${r.year} report deadline`,
        description: r.project_title,
        type: "deadline",
        _dateObj: new Date(r.report_submission_date),
      });
    }

    if (events.length === 0) return [];

    // "You are here" marker at today's chronological position
    const now = new Date();
    events.push({
      date: formatDate(now),
      label: "Today",
      description: "",
      type: "now",
      _dateObj: now,
    });

    return events.sort((a, b) => a._dateObj.getTime() - b._dateObj.getTime());
  }, [reports, projects]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);


  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <p className="text-neutral-400 text-sm mb-1">{labels.app.nameVersion}</p>
        <h1 className="text-3xl font-bold font-qanelas">
          {mounted ? `${greeting}, ${user?.organization ?? user?.name ?? ""}` : " "}
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
                          `/partner/report-editor/${toSlug(report)}/${report.year}/overview`
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

            {/* ── Feedback from CRAF'd ── */}
            {comments.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="size-4 text-muted-foreground" />
                    <h2 className="text-base font-semibold">Feedback from CRAF&apos;d</h2>
                  </div>
                  {comments.some((c) => !c.partner_addressed) && (
                    <span className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold w-5 h-5">
                      {comments.filter((c) => !c.partner_addressed).length}
                    </span>
                  )}
                </div>
                <div className="rounded-xl border bg-card overflow-hidden divide-y">
                  {comments.map((c) => {
                    const slug = (c.project_short_name ?? c.project_title).toLowerCase();
                    const done = c.partner_addressed;
                    return (
                      <div key={c.id} className={cn("px-4 py-3 transition-colors cursor-pointer hover:bg-accent/60", done && "bg-muted/20")} onClick={() => router.push(`/partner/report-editor/${slug}/${c.year}/${c.section}`)}>
                        <div className="w-full flex items-start gap-3 text-left">
                          <MessageSquare className={cn("size-4 mt-0.5 shrink-0", done ? "text-muted-foreground/40" : "text-amber-500")} />
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm", done && "line-through text-muted-foreground")}>{c.body}</p>
                            <div className={cn("flex items-center justify-between gap-2 mt-2", done && "opacity-60")}>
                              <CommentContextBadges
                                reportType={c.report_type}
                                year={c.year}
                                project={c.project_short_name ?? c.project_title}
                                section={c.section}
                                itemLabel={c.item_label}
                                className="!gap-1"
                              />
                              {done ? (
                                <Button size="sm" variant="outline" className="h-6 px-2 gap-1 text-xs shrink-0" onClick={(e) => { e.stopPropagation(); toggleAddressed(c.id, false); }}>
                                  <RotateCcw className="size-3" /> Undo
                                </Button>
                              ) : (
                                <Button size="sm" className="h-6 px-2 gap-1 text-xs shrink-0" onClick={(e) => { e.stopPropagation(); toggleAddressed(c.id, true); }}>
                                  <Check className="size-3" /> Confirm
                                </Button>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="size-3.5 shrink-0 mt-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
                  const isNow = event.type === "now";
                  const isPast = !isNow && event._dateObj < new Date();

                  return (
                    <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                      <div
                        className={cn(
                          "absolute -left-4 mt-0.5 size-3.5 rounded-full ring-2 ring-white shrink-0",
                          isNow
                            ? "bg-red-500 ring-red-200 animate-pulse"
                            : cn(cfg.dot, isPast && "opacity-40")
                        )}
                      />
                      <div className="pl-2">
                        <p className={cn(
                          "text-[10px] font-semibold uppercase tracking-wider mb-0.5",
                          isNow ? cfg.label : isPast ? "text-muted-foreground" : cfg.label
                        )}>
                          {event.date}
                          {isNow && (
                            <span className="ml-1.5 normal-case font-normal text-[9px] bg-red-500 text-white rounded-full px-1.5 py-0.5">
                              You are here
                            </span>
                          )}
                        </p>
                        <p className={cn(
                          "text-sm font-medium leading-snug",
                          isNow && "text-red-600",
                          isPast && "text-muted-foreground"
                        )}>
                          {event.label}
                        </p>
                        {event.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                            {event.description}
                          </p>
                        )}
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
