"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { cn, shortName } from "@/lib/utils";
import labels from "@/lib/labels";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { LoadingState } from "@/components/admin/shared";
import { buildPartnerProjects } from "@/lib/partner-projects";
import type { FeedbackComment, PartnerProject, UpdateDoc } from "@/lib/partner-projects";
import type { Report } from "@/lib/types";
import { HorizontalTimeline } from "@/components/partner/horizontal-timeline";
import { ActionRow } from "@/components/partner/project-rows";
import { Tag } from "@/components/ui/tag";

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
      <div className="bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <h1 className="t-title-banner">
          {mounted
            ? `${greeting}, ${shortName(user?.organization) || user?.name || ""}`
            : " "}
        </h1>
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
  const h = labels.partnerHome;
  const statusLabel = project.project_status
    ? (h.projectStatus as Record<string, string | undefined>)[project.project_status]
    : undefined;
  const grant = project.grant_size_usd != null && project.grant_size_usd !== "" && Number.isFinite(Number(project.grant_size_usd))
    ? `USD ${Number(project.grant_size_usd).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : "—";
  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: h.tiles.grant, value: grant },
    {
      label: h.tiles.period,
      value: project.periodStart && project.periodEnd ? `${project.periodStart} – ${project.periodEnd}` : "—",
      sub: project.periodMonths != null ? h.tiles.months.replace("{n}", String(project.periodMonths)) : undefined,
    },
    { label: h.tiles.openComments, value: String(project.openCommentCount) },
    { label: h.tiles.nextDeadline, value: project.nextDeadline ?? "—" },
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
          {statusLabel && <Tag>{statusLabel}</Tag>}
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
                <p className="text-sm font-semibold mt-0.5">{tile.value}</p>
                {tile.sub && <p className="text-xs text-muted-foreground mt-0.5">{tile.sub}</p>}
              </div>
            ))}
          </div>

          {project.timeline.length > 0 && (
            <HorizontalTimeline events={project.timeline} />
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{h.nextSteps}</h3>
            <div className="rounded-lg border overflow-hidden">
              {project.actions.length === 0 ? (
                <div className="flex items-center gap-3 px-2 py-4 justify-center">
                  <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                  <p className="text-sm text-muted-foreground">{labels.partnerProject.nothingNeeded}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {project.actions.map((action, i) => (
                    <ActionRow key={i} action={action} />
                  ))}
                </div>
              )}
            </div>
            {project.underReview.map((name) => (
              <p key={name} className="text-sm text-muted-foreground">
                {h.withCrafdNote.replace("{name}", name)}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
