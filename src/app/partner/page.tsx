"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn, shortName } from "@/lib/utils";
import labels from "@/lib/labels";
import { ChevronDown, ChevronRight } from "lucide-react";
import { LoadingState } from "@/components/admin/shared";
import { buildPartnerProjects } from "@/lib/partner-projects";
import type { FeedbackComment, PartnerProject } from "@/lib/partner-projects";
import type { Report } from "@/lib/types";

export default function PartnerHomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const showAll = search.get("all") === "1";

  const [reports, setReports] = useState<Report[]>([]);
  const [prodocs, setProdocs] = useState<Report[]>([]);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  // Set to true once we've decided NOT to redirect (i.e. safe to render the list).
  const [redirectChecked, setRedirectChecked] = useState(false);
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

  // If exactly one current project and no ?all=1, skip the list and go to that project.
  useEffect(() => {
    if (!dataLoaded) return;
    if (showAll) { setRedirectChecked(true); return; }
    if (currentProjects.length === 1) {
      router.replace(`/partner/projects/${currentProjects[0].slug}`);
      // Stay on loading while the navigation settles.
    } else {
      setRedirectChecked(true);
    }
  }, [dataLoaded, currentProjects, showAll, router]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

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
        <p className="text-neutral-400 text-sm mt-2">Partner Dashboard</p>
      </div>

      <div className="flex-1 px-8 py-8">
        {!redirectChecked ? (
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {currentProjects.map((p) => (
                    <ProjectCard
                      key={p.project_id}
                      project={p}
                      onClick={() => router.push(`/partner/projects/${p.slug}`)}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pastProjects.map((p) => (
                      <ProjectCard
                        key={p.project_id}
                        project={p}
                        onClick={() => router.push(`/partner/projects/${p.slug}`)}
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

function ProjectCard({
  project,
  onClick,
}: {
  project: PartnerProject;
  onClick: () => void;
}) {
  const actionCount = project.actions.length;
  const commentCount = project.unansweredComments.length;
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border bg-card p-5 hover:bg-accent/40 transition-colors group flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{project.title}</p>
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
            project.role === "lead"
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "bg-violet-50 text-violet-700 border border-violet-200"
          )}
        >
          {project.role === "lead"
            ? labels.partnerHome.roleLead
            : labels.partnerHome.roleImpl}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{shortName(project.lead_org)}</p>
      {(project.hasOverdue || actionCount > 0 || commentCount > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {project.hasOverdue && (
            <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 text-[13px] font-semibold px-2.5 py-0.5">
              {labels.partnerHome.overdue}
            </span>
          )}
          {actionCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[13px] font-semibold px-2.5 py-0.5">
              {actionCount} {actionCount === 1 ? labels.partnerHome.todo : labels.partnerHome.todos}
            </span>
          )}
          {commentCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 text-[13px] font-semibold px-2.5 py-0.5">
              {commentCount} {commentCount === 1 ? labels.partnerHome.comment : labels.partnerHome.comments}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
