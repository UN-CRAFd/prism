"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { cn, shortName } from "@/lib/utils";
import labels from "@/lib/labels";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import { LoadingState } from "@/components/admin/shared";
import { buildPartnerProjects } from "@/lib/partner-projects";
import type { FeedbackComment, PartnerProject, UpdateDoc } from "@/lib/partner-projects";
import type { Report } from "@/lib/types";
import { HorizontalTimeline } from "@/components/partner/horizontal-timeline";
import { ActionRow } from "@/components/partner/project-rows";
import { isFinalStatus } from "@/lib/report-status";

// "Wednesday 25 November 2026" (no comma, whatever the locale data says).
function longDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`;
}

// DD/MM/YYYY → sortable YYYYMMDD.
const ddmmKey = (s: string) => s.split("/").reverse().join("");

export default function PartnerHomePage() {
  const { user } = useAuth();

  const [reports, setReports] = useState<Report[]>([]);
  const [prodocs, setProdocs] = useState<Report[]>([]);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [updates, setUpdates] = useState<UpdateDoc[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const org = encodeURIComponent(user.organization || user.id);
    Promise.all([
      fetch("/api/reports?data_type=report").then((r) => r.json()).catch(() => []),
      fetch("/api/reports?data_type=prodoc").then((r) => r.json()).catch(() => []),
      fetch(`/api/comments?partnerShortName=${org}`).then((r) => r.json()).catch(() => []),
      fetch("/api/reports?data_type=update").then((r) => r.json()).catch(() => []),
    ]).then(([rpts, pdocs, cmts, upds]) => {
      if (cancelled) return;
      setReports(Array.isArray(rpts) ? rpts : []);
      setProdocs(Array.isArray(pdocs) ? pdocs : []);
      setComments(Array.isArray(cmts) ? cmts : []);
      setUpdates(Array.isArray(upds) ? upds : []);
      setDataLoaded(true);
    });
    return () => { cancelled = true; };
  }, [user]);

  const allProjects = useMemo(
    () => (user ? buildPartnerProjects(reports, prodocs, comments, user, updates) : []),
    [reports, prodocs, comments, user, updates]
  );

  const currentProjects = useMemo(() => allProjects.filter((p) => !p.isPast), [allProjects]);
  const pastProjects = useMemo(() => allProjects.filter((p) => p.isPast), [allProjects]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  // Header summary: the same to-do count and next deadline the project boxes show,
  // over the current projects.
  const todoCount = currentProjects.reduce((n, p) => n + p.actions.length, 0);
  const nextDeadline = currentProjects
    .map((p) => p.nextDeadline)
    .filter((d): d is string => !!d)
    .sort((a, b) => ddmmKey(a).localeCompare(ddmmKey(b)))[0] ?? null;
  const summary = (() => {
    const h = labels.partnerHome;
    const n = currentProjects.length;
    return [
      `${n} ${n === 1 ? h.summary.project : h.summary.projects}`,
      `${todoCount} ${todoCount === 1 ? h.summary.thing : h.summary.things}`,
      ...(nextDeadline ? [h.summary.nextDeadline.replace("{date}", nextDeadline)] : []),
    ].join(" · ");
  })();

  const [openBoxes, setOpenBoxes] = useState<Set<number>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!dataLoaded || initializedRef.current) return;
    initializedRef.current = true;
    if (currentProjects.length === 1) {
      setOpenBoxes(new Set([currentProjects[0].project_id]));
    }
  }, [dataLoaded, currentProjects]);

  function toggleBox(id: number) {
    setOpenBoxes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [pastExpanded, setPastExpanded] = useState(false);

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header banner */}
      <div className="bg-neutral-950 text-white px-8 min-h-32 py-4 flex flex-col justify-center">
        <h1 className="t-title-banner">
          {mounted
            ? `${greeting}, ${shortName(user?.organization) || user?.name || ""}`
            : " "}
        </h1>
        {mounted && (
          <>
            <p className="mt-1 text-sm text-neutral-400">{longDate(new Date())}</p>
            {dataLoaded && allProjects.length > 0 && <p className="text-sm text-neutral-400">{summary}</p>}
          </>
        )}
      </div>

      <div className="flex-1 px-8 py-8">
        {!dataLoaded ? (
          <LoadingState className="py-16" />
        ) : allProjects.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            {labels.partnerHome.noProjects}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Current projects */}
            <div>
              <h2 className="text-xl font-bold mb-4">{labels.partnerHome.yourProjects}</h2>
              {currentProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">{labels.partnerHome.noCurrent}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {currentProjects.map((p) => (
                    <ProjectBox
                      key={p.project_id}
                      project={p}
                      open={openBoxes.has(p.project_id)}
                      onToggle={() => toggleBox(p.project_id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Past projects — collapsed by default */}
            {pastProjects.length > 0 && (
              <div>
                <button
                  className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-3"
                  onClick={() => setPastExpanded((v) => !v)}
                >
                  {pastExpanded
                    ? <ChevronDown className="size-4" />
                    : <ChevronRight className="size-4" />}
                  {labels.partnerHome.pastProjects} ({pastProjects.length})
                </button>
                {pastExpanded && (
                  <div className="flex flex-col gap-3">
                    {pastProjects.map((p) => (
                      <ProjectBox
                        key={p.project_id}
                        project={p}
                        open={openBoxes.has(p.project_id)}
                        onToggle={() => toggleBox(p.project_id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectBox({
  project,
  open,
  onToggle,
}: {
  project: PartnerProject;
  open: boolean;
  onToggle: () => void;
}) {
  const actionCount = project.actions.length;
  // An open (or To revise) Project Document always comes first; the rest by urgency:
  // overdue, then earliest due date.
  const orderedActions = [...project.actions].sort(
    (a, b) =>
      Number(b.type === "prodoc") - Number(a.type === "prodoc") ||
      Number(b.overdue) - Number(a.overdue) ||
      (a.dueIso ?? "9999").localeCompare(b.dueIso ?? "9999")
  );
  const h = labels.partnerHome;
  const grant = project.grant_size_usd != null && project.grant_size_usd !== "" && Number.isFinite(Number(project.grant_size_usd))
    ? `USD ${Number(project.grant_size_usd).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : "—";
  // Next deadline: red with an "Overdue" line once past, dark yellow within 14 days.
  const dueDate = project.nextDeadlineIso ? new Date(project.nextDeadlineIso) : null;
  const deadlineOverdue = dueDate != null && dueDate < new Date();
  const deadlineSoon = dueDate != null && !deadlineOverdue && dueDate <= new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const tiles: { label: string; value: string; sub?: string; valueClass?: string; subClass?: string }[] = [
    // "Requested" until the project document is approved, "Grant" after.
    { label: isFinalStatus(project.prodoc.status) ? h.tiles.grant : h.tiles.requested, value: grant },
    {
      label: h.tiles.period,
      value: project.periodStart && project.periodEnd ? `${project.periodStart} – ${project.periodEnd}` : "—",
      sub: project.periodMonths != null ? h.tiles.months.replace("{n}", String(project.periodMonths)) : undefined,
    },
    { label: h.tiles.openComments, value: String(project.openCommentCount) },
    {
      label: h.tiles.nextDeadline,
      value: project.nextDeadline ?? "—",
      valueClass: deadlineOverdue ? "text-red-600" : deadlineSoon ? "text-crafd-yellow-900" : undefined,
      sub: deadlineOverdue ? h.overdue : undefined,
      subClass: "text-red-600",
    },
  ];
  return (
    <div className={cn("rounded-xl border overflow-hidden", project.hasOverdue ? "border-red-200 bg-red-50" : "bg-card")}>
      {/* Header: a div (not a button) so the MPTFO link can sit inside it. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className={cn("w-full text-left px-5 py-5 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer transition-colors", project.hasOverdue ? "hover:bg-red-100" : "hover:bg-muted/60")}
      >
        {/* Left: title, then role and MPTFO link */}
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold leading-snug">{project.title}</p>
          <p className="text-[14px] text-muted-foreground mt-1">
            {project.role === "lead" ? h.roleLead : h.roleImpl}
            {project.mptfo_project_number && (
              <>
                {" · "}
                <a
                  href={`https://mptf.undp.org/project/${project.mptfo_project_number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-600 hover:underline"
                >
                  {h.mptfo} {project.mptfo_project_number}
                </a>
              </>
            )}
          </p>
        </div>

        {/* Right: project status tag, chips, chevron */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {project.hasOverdue && (
            <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 text-[13px] font-medium px-2.5 py-0.5">
              {h.overdue}
            </span>
          )}
          {actionCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-crafd-yellow-100 text-crafd-grey-800 text-[13px] font-medium px-2.5 py-0.5">
              {actionCount} {actionCount === 1 ? h.todo : h.todos}
            </span>
          )}
          {open
            ? <ChevronDown className="size-5 text-foreground/70 shrink-0 ml-1" />
            : <ChevronRight className="size-5 text-foreground/70 shrink-0 ml-1" />}
        </div>
      </div>

      {open && (
        <div className={cn("border-t px-5 py-5 space-y-6 bg-card", project.hasOverdue && "border-red-200")}>
          {/* Detail tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-lg bg-muted/50 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">{tile.label}</p>
                <p className={cn("text-sm font-semibold mt-0.5", tile.valueClass)}>{tile.value}</p>
                {tile.sub && <p className={cn("text-xs mt-0.5", tile.subClass ?? "text-muted-foreground")}>{tile.sub}</p>}
              </div>
            ))}
          </div>

          {project.timeline.length > 0 && (
            <HorizontalTimeline events={project.timeline} />
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{h.nextSteps}</h3>
            <div className="rounded-lg border overflow-hidden">
              <div className="divide-y">
                {/* No action rows: one muted line at the top. */}
                {project.actions.length === 0 && (
                  <div className="px-4 py-3">
                    <p className="text-sm text-muted-foreground">{h.nothingNow}</p>
                  </div>
                )}
                {orderedActions.map((action) => (
                  <ActionRow key={action.href} action={action} />
                ))}
                {/* Documents with CRAF'd: muted rows after the action rows, no button. */}
                {project.underReview.map((name) => (
                  <div key={name} className="px-4 py-3">
                    <p className="text-sm font-medium text-muted-foreground">{name}</p>
                    <p className="flex items-center gap-1.5 text-xs mt-0.5 text-muted-foreground">
                      <Clock className="size-3 shrink-0" />
                      {h.withCrafdRow}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
