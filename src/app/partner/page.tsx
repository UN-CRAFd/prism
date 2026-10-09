"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { cn, shortName } from "@/lib/utils";
import labels from "@/lib/labels";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { LoadingState } from "@/components/admin/shared";
import { buildPartnerProjects } from "@/lib/partner-projects";
import type { FeedbackComment, PartnerProject } from "@/lib/partner-projects";
import type { Report } from "@/lib/types";
import { HorizontalTimeline } from "@/components/partner/horizontal-timeline";
import { ActionRow } from "@/components/partner/project-rows";

export default function PartnerHomePage() {
  const { user } = useAuth();

  const [reports, setReports] = useState<Report[]>([]);
  const [prodocs, setProdocs] = useState<Report[]>([]);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
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
    ]).then(([rpts, pdocs, cmts]) => {
      if (cancelled) return;
      setReports(Array.isArray(rpts) ? rpts : []);
      setProdocs(Array.isArray(pdocs) ? pdocs : []);
      setComments(Array.isArray(cmts) ? cmts : []);
      setDataLoaded(true);
    });
    return () => { cancelled = true; };
  }, [user]);

  const allProjects = useMemo(
    () => (user ? buildPartnerProjects(reports, prodocs, comments, user) : []),
    [reports, prodocs, comments, user]
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
        <p className="text-neutral-400 text-sm mb-1">{labels.app.nameVersion}</p>
        <h1 className="t-title-banner">
          {mounted
            ? `${greeting}, ${shortName(user?.organization) || user?.name || ""}`
            : " "}
        </h1>
        <p className="text-neutral-400 text-sm mt-2">{labels.partnerHome.pageTitle}</p>
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
              <h2 className="t-heading-section mb-4">{labels.partnerHome.yourProjects}</h2>
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
  return (
    <div className="rounded-xl border bg-card">
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-5 flex flex-col sm:flex-row sm:items-center gap-3"
      >
        {/* Left: title + lead org + role badge */}
        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-semibold leading-snug">{project.title}</p>
          <p className="text-[14px] text-muted-foreground mt-1">{shortName(project.lead_org)}</p>
          <span
            className={cn(
              "mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium",
              project.role === "lead"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-violet-50 text-violet-700 border border-violet-200"
            )}
          >
            {project.role === "lead" ? labels.partnerHome.roleLead : labels.partnerHome.roleImpl}
          </span>
        </div>

        {/* Right: status chips + chevron */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {project.hasOverdue && (
            <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 text-[13px] font-medium px-2.5 py-0.5">
              {labels.partnerHome.overdue}
            </span>
          )}
          {actionCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[13px] font-medium px-2.5 py-0.5">
              {actionCount} {actionCount === 1 ? labels.partnerHome.todo : labels.partnerHome.todos}
            </span>
          )}
          {open
            ? <ChevronDown className="size-4 text-muted-foreground shrink-0 ml-1" />
            : <ChevronRight className="size-4 text-muted-foreground shrink-0 ml-1" />}
        </div>
      </button>

      {open && (
        <div className="border-t px-5 py-5 space-y-4">
          {project.timeline.length > 0 && (
            <HorizontalTimeline events={project.timeline} />
          )}
          <div>
            <h3 className="t-heading-sub mb-3">{labels.partnerProject.needsAction}</h3>
            {project.actions.length === 0 ? (
              <div className="flex items-center gap-3 px-2 py-4 justify-center">
                <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                <p className="text-sm text-muted-foreground">{labels.partnerProject.nothingNeeded}</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden divide-y">
                {project.actions.map((action, i) => (
                  <ActionRow key={i} action={action} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
