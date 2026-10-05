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
  label: string;
  type: TimelineEventType;
  // date shown below the label (for start/end/now; empty for prodoc/deadline)
  date: string;
  // precomputed second line for prodoc/deadline events (empty for start/end/now)
  description: string;
  // visual state
  submitted: boolean;   // green dot + check (prodoc/deadline: status !== "Open")
  overdue: boolean;     // red dot (deadline: not submitted AND deadline < today)
  pastDate: boolean;    // grey dot (start/end: date has passed)
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

// Second line shown in the Documents box (and mirrors the timeline description).
export function docStatusLine(r: Report, today: Date = new Date()): string {
  const submitted = r.status !== "Open";
  if (submitted) {
    return r.submitted_at ? `Submitted ${formatDate(r.submitted_at)}` : "Submitted";
  }
  if (r.data_type === "prodoc") return "Not submitted";
  if (!r.report_submission_date) return "No due date set";
  const dueDate = new Date(r.report_submission_date);
  if (dueDate < today) return `Overdue · due ${formatDate(r.report_submission_date)}`;
  return `Due ${formatDate(r.report_submission_date)}`;
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

    // Actions: Open reports + Open prodoc
    const actions: ProjectAction[] = [];
    for (const r of projectReports) {
      if (r.status === "Open") {
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
        label: "Complete Project Document",
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

  const prodocSubmitted = prodoc.status !== "Open";
  const prodocSubmittedAt = prodoc.submitted_at ? new Date(prodoc.submitted_at) : null;

  // ProDoc: at submitted_at when submitted, epoch when not (always sorts first
  // when not yet submitted).
  events.push({
    label: "Project document",
    type: "prodoc",
    date: "",
    description: prodocSubmitted
      ? prodoc.submitted_at ? `Submitted ${formatDate(prodoc.submitted_at)}` : "Submitted"
      : "Not submitted",
    submitted: prodocSubmitted,
    overdue: false,
    pastDate: false,
    _dateObj: prodocSubmitted && prodocSubmittedAt ? prodocSubmittedAt : new Date(0),
  });

  // Project start
  if (prodoc.project_start_date) {
    const startDate = new Date(prodoc.project_start_date);
    events.push({
      label: "Project start",
      type: "start",
      date: formatDate(prodoc.project_start_date),
      description: "",
      submitted: false,
      overdue: false,
      pastDate: startDate < today,
      _dateObj: startDate,
    });
  }

  // Calculate project end date for no-deadline sentinel
  let projectEndDate: Date | null = null;
  if (prodoc.project_start_date && prodoc.project_duration_months) {
    const start = new Date(prodoc.project_start_date);
    const end = new Date(start);
    end.setMonth(end.getMonth() + prodoc.project_duration_months);
    projectEndDate = end;
  }
  // Sentinel for reports with no deadline: sort just before project end.
  const noDeadlineSentinel = projectEndDate
    ? new Date(projectEndDate.getTime() - 1)
    : new Date(8640000000000000 - 1);

  // Report deadlines — no-deadline reports use the sentinel
  for (const r of reports) {
    const submitted = r.status !== "Open";
    const hasDeadline = !!r.report_submission_date;
    const deadlineDate = hasDeadline ? new Date(r.report_submission_date!) : null;
    const overdue = !submitted && deadlineDate != null && deadlineDate < today;

    let description: string;
    if (submitted) {
      description = r.submitted_at
        ? `Submitted ${formatDate(r.submitted_at)}`
        : "Submitted";
    } else if (!hasDeadline) {
      description = "No due date set";
    } else if (overdue) {
      description = `Overdue · due ${formatDate(r.report_submission_date!)}`;
    } else {
      description = `Due ${formatDate(r.report_submission_date!)}`;
    }

    events.push({
      label: reportName(r.year, r.report_type),
      type: "deadline",
      date: "",
      description,
      submitted,
      overdue,
      pastDate: false,
      _dateObj: deadlineDate ?? noDeadlineSentinel,
    });
  }

  // Project end
  if (projectEndDate) {
    events.push({
      label: "Project end",
      type: "end",
      date: formatDate(projectEndDate),
      description: "",
      submitted: false,
      overdue: false,
      pastDate: projectEndDate < today,
      _dateObj: projectEndDate,
    });
  }

  // Today marker
  events.push({
    label: "Today",
    type: "now",
    date: formatDate(today),
    description: "",
    submitted: false,
    overdue: false,
    pastDate: false,
    _dateObj: today,
  });

  return events.sort((a, b) => a._dateObj.getTime() - b._dateObj.getTime());
}
