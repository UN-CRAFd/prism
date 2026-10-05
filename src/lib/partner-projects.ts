import type { Report } from "@/lib/types";
import { projectSlug, formatDate } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

export interface FeedbackComment {
  id: number;
  project_id: number;
  section: string;
  body: string;
  item_label: string | null;
  resolved: boolean;
  partner_addressed: boolean;
  year: number;
  report_type: "annual" | "final" | null;
  data_type: "report" | "prodoc";
  project_title: string;
  project_short_name: string | null;
}

export interface ProjectAction {
  type: "report" | "prodoc";
  label: string;
  href: string;
  // Report actions
  dueDateFormatted: string | null;
  overdue: boolean;
  dueSoon: boolean;       // due within 30 days, not yet overdue
  // Prodoc actions
  prodocStatus: string | null;
}

export type TimelineEventType = "start" | "prodoc" | "deadline" | "end" | "now";

export interface TimelineEvent {
  date: string;           // formatted DD/MM/YYYY, empty for the ProDoc step
  label: string;
  description?: string;
  type: TimelineEventType;
  done: boolean;
  _dateObj: Date;
}

export interface PartnerProject {
  project_id: number;
  slug: string;
  title: string;
  short_name: string | null;
  lead_org: string;
  role: "lead" | "implementing";
  prodoc: Report;
  reports: Report[];
  actions: ProjectAction[];
  unansweredComments: FeedbackComment[];
  timeline: TimelineEvent[];
  isPast: boolean;
  hasOverdue: boolean;    // any report action is past its due date
}

interface SessionUser {
  id: string;
  organization?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Canonical report name used everywhere: timeline, action rows, document rows.
export function reportName(
  year: number,
  reportType: "annual" | "final" | null | undefined
): string {
  return `${year} ${reportType === "final" ? "Final" : "Annual"} Report`;
}

// ── Pure builder ────────────────────────────────────────────────────────────

export function buildPartnerProjects(
  reports: Report[],
  prodocs: Report[],
  comments: FeedbackComment[],
  user: SessionUser
): PartnerProject[] {
  const isLead = (r: Report) =>
    r.partner_short_name.toLowerCase() === user.id.toLowerCase() ||
    r.partner_short_name === user.organization;

  const reportsByProject = new Map<number, Report[]>();
  for (const r of reports) {
    if (!reportsByProject.has(r.project_id)) reportsByProject.set(r.project_id, []);
    reportsByProject.get(r.project_id)!.push(r);
  }

  const commentsByProject = new Map<number, FeedbackComment[]>();
  for (const c of comments) {
    if (!commentsByProject.has(c.project_id)) commentsByProject.set(c.project_id, []);
    commentsByProject.get(c.project_id)!.push(c);
  }

  const today = new Date();
  const thirtyDaysOut = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const seenProjectIds = new Set<number>();
  const result: PartnerProject[] = [];

  for (const prodoc of prodocs) {
    if (seenProjectIds.has(prodoc.project_id)) continue;
    seenProjectIds.add(prodoc.project_id);

    const slug = projectSlug(prodoc.project_short_name, prodoc.project_title);
    const projectReports = (reportsByProject.get(prodoc.project_id) ?? [])
      .sort((a, b) => a.year - b.year);
    const projectComments = commentsByProject.get(prodoc.project_id) ?? [];
    const unansweredComments = projectComments.filter((c) => !c.partner_addressed);

    // Actions: pending reports (in year order) + open prodoc
    const actions: ProjectAction[] = [];
    for (const r of projectReports) {
      if (!r.authorized) {
        const dueDate = r.report_submission_date ? new Date(r.report_submission_date) : null;
        const overdue = dueDate != null && dueDate < today;
        const dueSoon = dueDate != null && !overdue && dueDate <= thirtyDaysOut;
        actions.push({
          type: "report",
          label: `Complete ${reportName(r.year, r.report_type)}`,
          href: `/partner/report-editor/${slug}/${r.year}/overview`,
          dueDateFormatted: r.report_submission_date ? formatDate(r.report_submission_date) : null,
          overdue,
          dueSoon,
          prodocStatus: null,
        });
      }
    }
    if (prodoc.status === "Open") {
      actions.push({
        type: "prodoc",
        label: "Complete project document",
        href: `/partner/prodoc-editor/${slug}/general`,
        dueDateFormatted: null,
        overdue: false,
        dueSoon: false,
        prodocStatus: prodoc.status,
      });
    }

    const hasOverdue = actions.some((a) => a.overdue);
    const timeline = buildProjectTimeline(prodoc, projectReports);

    // isPast: end date before today AND no actions AND no unanswered comments
    let isPast = false;
    if (prodoc.project_start_date && prodoc.project_duration_months) {
      const start = new Date(prodoc.project_start_date);
      const end = new Date(start);
      end.setMonth(end.getMonth() + prodoc.project_duration_months);
      isPast = end < today && actions.length === 0 && unansweredComments.length === 0;
    }

    result.push({
      project_id: prodoc.project_id,
      slug,
      title: prodoc.project_title,
      short_name: prodoc.project_short_name,
      lead_org: prodoc.partner_short_name,
      role: isLead(prodoc) ? "lead" : "implementing",
      prodoc,
      reports: projectReports,
      actions,
      unansweredComments,
      timeline,
      isPast,
      hasOverdue,
    });
  }

  return result.sort((a, b) => a.title.localeCompare(b.title));
}

function buildProjectTimeline(prodoc: Report, reports: Report[]): TimelineEvent[] {
  const today = new Date();
  const events: TimelineEvent[] = [];

  // ProDoc step — always first (epoch _dateObj), no date shown.
  events.push({
    date: "",
    label: "Project document",
    description: prodoc.status ?? undefined,
    type: "prodoc",
    done: prodoc.status !== "Open",
    _dateObj: new Date(0),
  });

  // Project start
  if (prodoc.project_start_date) {
    const startDate = new Date(prodoc.project_start_date);
    events.push({
      date: formatDate(prodoc.project_start_date),
      label: "Project start",
      type: "start",
      done: startDate < today,
      _dateObj: startDate,
    });
  }

  // Report deadlines
  for (const r of reports) {
    if (!r.report_submission_date) continue;
    const deadlineDate = new Date(r.report_submission_date);
    events.push({
      date: formatDate(r.report_submission_date),
      label: reportName(r.year, r.report_type),
      type: "deadline",
      done: r.authorized === true || deadlineDate < today,
      _dateObj: deadlineDate,
    });
  }

  // Project end
  if (prodoc.project_start_date && prodoc.project_duration_months) {
    const start = new Date(prodoc.project_start_date);
    const end = new Date(start);
    end.setMonth(end.getMonth() + prodoc.project_duration_months);
    events.push({
      date: formatDate(end),
      label: "Project end",
      type: "end",
      done: end < today,
      _dateObj: end,
    });
  }

  // Today marker
  events.push({
    date: formatDate(today),
    label: "Today",
    type: "now",
    done: false,
    _dateObj: today,
  });

  // ProDoc is pinned to epoch (new Date(0)) so it always sorts first.
  return events.sort((a, b) => a._dateObj.getTime() - b._dateObj.getTime());
}
