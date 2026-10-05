"use client";

import { Fragment, useMemo, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn, shortName } from "@/lib/utils";
import labels from "@/lib/labels";
import { ArrowLeft, ArrowRight, CheckCircle2, FileStack, FileText } from "lucide-react";
import { LoadingState } from "@/components/admin/shared";
import { buildPartnerProjects, reportName } from "@/lib/partner-projects";
import { ActionRow, CommentRow } from "@/components/partner/project-rows";
import type { FeedbackComment, PartnerProject, TimelineEvent } from "@/lib/partner-projects";
import type { Report } from "@/lib/types";

// ── Timeline stepper ─────────────────────────────────────────────────────────

function HorizontalTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex items-start min-w-full">
        {events.map((ev, i) => {
          const isNow = ev.type === "now";
          const isLast = i === events.length - 1;
          const dotClass = isNow
            ? "bg-red-500 ring-2 ring-red-200 animate-pulse"
            : ev.done
            ? "bg-green-500 ring-2 ring-green-200"
            : "bg-white border-2 border-gray-300";
          const labelClass = isNow
            ? "text-red-600"
            : ev.done
            ? "text-green-700"
            : "text-muted-foreground";
          return (
            <Fragment key={i}>
              {/* Event column */}
              <div className="flex flex-col items-center shrink-0" style={{ minWidth: 80 }}>
                <div className={cn("size-4 rounded-full", dotClass)} />
                <p
                  className={cn(
                    "text-sm font-semibold mt-2 text-center leading-tight",
                    labelClass
                  )}
                >
                  {ev.label}
                </p>
                {ev.description && (
                  <p className="text-[13px] text-muted-foreground text-center mt-0.5">
                    {ev.description}
                  </p>
                )}
                {ev.date && (
                  <p className="text-[13px] text-muted-foreground text-center mt-0.5">
                    {ev.date}
                  </p>
                )}
              </div>
              {/* Growing connector */}
              {!isLast && (
                <div className="flex-1 min-w-4 self-start mt-2">
                  <div className="h-px bg-border" />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocumentRow({
  icon: Icon,
  label,
  status,
  href,
}: {
  icon: React.ElementType;
  label: string;
  status: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 hover:bg-accent/60 transition-colors group"
    >
      <Icon className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground">{status}</p>
      </div>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams<{ project: string }>();
  const projectParam = params.project;

  const [reports, setReports] = useState<Report[]>([]);
  const [prodocs, setProdocs] = useState<Report[]>([]);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  const allProjects = useMemo(
    () => (user ? buildPartnerProjects(reports, prodocs, comments, user) : []),
    [reports, prodocs, comments, user]
  );

  const project: PartnerProject | undefined = allProjects.find(
    (p) => p.slug === projectParam
  );

  function toggleAddressed(id: number, next: boolean) {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, partner_addressed: next } : c))
    );
    fetch("/api/comments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, partner_addressed: next }),
    }).then((res) => {
      if (!res.ok) throw new Error("failed");
    }).catch(() => {
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, partner_addressed: !next } : c))
      );
    });
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <PageHeader project={null} loading />
        <LoadingState className="py-16" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <PageHeader project={null} loading={false} />
        <div className="px-8 py-16 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{labels.partnerProject.notFound}</p>
          <Link
            href="/partner?all=1"
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {labels.partnerProject.allProjects}
          </Link>
        </div>
      </div>
    );
  }

  const needsAttention =
    project.actions.length > 0 || project.unansweredComments.length > 0;

  const prodocSlug = project.slug;
  const prodocHref = `/partner/prodoc-editor/${prodocSlug}/general`;

  return (
    <div className="flex flex-col min-h-full bg-background">
      <PageHeader project={project} loading={false} />

      <div className="flex-1 px-8 py-8 space-y-6">

        {/* Timeline card */}
        {project.timeline.length > 0 && (
          <div className="rounded-xl border bg-card px-6 py-5">
            <HorizontalTimeline events={project.timeline} />
          </div>
        )}

        {/* Two-column action + documents panel — items-start so cards size to content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* Needs your action */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="t-heading-sub">{labels.partnerProject.needsAction}</h2>
            </div>
            {!needsAttention ? (
              <div className="flex items-center gap-3 px-6 py-8 justify-center">
                <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  {labels.partnerProject.nothingNeeded}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {project.actions.map((action, i) => (
                  <ActionRow key={i} action={action} />
                ))}
                {project.unansweredComments.map((c) => (
                  <CommentRow key={c.id} comment={c} onToggle={toggleAddressed} hideProject />
                ))}
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="t-heading-sub">{labels.partnerProject.documents}</h2>
            </div>
            <div className="divide-y">
              <DocumentRow
                icon={FileStack}
                label={labels.partnerProject.projectDocument}
                status={project.prodoc.status ?? "—"}
                href={prodocHref}
              />
              {project.reports.map((r) => (
                <DocumentRow
                  key={r.id}
                  icon={FileText}
                  label={reportName(r.year, r.report_type)}
                  status={r.status ?? "—"}
                  href={`/partner/report-editor/${prodocSlug}/${r.year}/overview`}
                />
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

function PageHeader({
  project,
  loading,
}: {
  project: PartnerProject | null;
  loading: boolean;
}) {
  return (
    <div className="bg-neutral-950 text-white px-8 pt-6 pb-6 flex flex-col gap-3">
      <Link
        href="/partner?all=1"
        className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors text-xs w-fit"
      >
        <ArrowLeft className="size-3.5" />
        {labels.partnerProject.allProjects}
      </Link>
      {loading || !project ? (
        <div className="h-7" />
      ) : (
        <>
          <div className="flex items-start gap-3 flex-wrap">
            <h1 className="t-title-banner text-2xl leading-snug">{project.title}</h1>
            <span
              className={cn(
                "mt-1 shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                project.role === "lead"
                  ? "bg-blue-900/60 text-blue-200 border border-blue-700"
                  : "bg-violet-900/60 text-violet-200 border border-violet-700"
              )}
            >
              {project.role === "lead"
                ? labels.partnerHome.roleLead
                : labels.partnerHome.roleImpl}
            </span>
          </div>
          <p className="text-neutral-400 text-sm">{shortName(project.lead_org)}</p>
        </>
      )}
    </div>
  );
}
