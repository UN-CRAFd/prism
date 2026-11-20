import type { Report } from "@/lib/types";
import { projectSlug, formatDate } from "@/lib/utils";
import { documentPath, documentTitle, firstUnlockedSection } from "@/lib/project-updates";
import { isPartnerEditable } from "@/lib/report-status";
import labels from "@/lib/labels";

// ── Types ──────────────────────────────────────────────────────────────────

export interface FeedbackComment {
  id: number;
  report_id?: number;
  project_id: number;
  section: string;
  body: string;
  item_label: string | null;
  resolved: boolean;
  partner_addressed: boolean;
  year: number;
  report_type: "annual" | "final" | null;
  data_type: "report" | "prodoc" | "update";
  project_title: string;
  project_short_name: string | null;
}

export interface ProjectAction {
  type: "report" | "prodoc" | "update";
  label: string;
  href: string;
  // Report actions
  dueDateFormatted: string | null;
  overdue: boolean;
  dueSoon: boolean;       // due within 30 days, not yet overdue
  // Prodoc actions
  prodocStatus: string | null;
  commentCount: number;
}

// One dot on a project's timeline.
//   approved → green with a check     crafd   → blue (with CRAF'd for review)
//   editing  → orange (partner's turn) pending → hollow grey (not started)
//   passed   → grey filled (a milestone date that has gone by, e.g. Project end)
export type TimelineDotState = "approved" | "crafd" | "editing" | "pending" | "passed";

export interface TimelineEvent {
  label: string;
  state: TimelineDotState;
  detail: string;   // line under the label ("Approved 12/03/2026", "Due 30/06/2026", …)
  warn: boolean;    // detail in red: overdue or due within 30 days
  _dateObj: Date;   // sort key for the documents between Project Document and Project end
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
  updates: UpdateDoc[];
  actions: ProjectAction[];
  timeline: TimelineEvent[];
  isPast: boolean;
  hasOverdue: boolean;    // any report action is past its due date
  // Box header / detail tiles
  mptfo_project_number: string | null;
  project_status: string | null;
  grant_size_usd: string | null;
  periodStart: string | null;   // DD/MM/YYYY
  periodEnd: string | null;     // DD/MM/YYYY
  periodMonths: number | null;
  openCommentCount: number;     // open comments across all of the project's documents
  nextDeadline: string | null;  // earliest due date of a document still with the partner, DD/MM/YYYY
  // Names of documents currently with CRAF'd for review (nothing to do for now).
  underReview: string[];
}

// A project update (reports row with data_type = "update").
export type UpdateDoc = Report & { unlocked_sections?: string[] | null; update_types?: string[] | null; update_index?: string | null };

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
  const submitted = !isPartnerEditable(r.status);
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
  user: SessionUser,
  updates: UpdateDoc[] = []
): PartnerProject[] {
  const isLead = (r: Report) =>
    r.partner_short_name.toLowerCase() === user.id.toLowerCase() ||
    r.partner_short_name === user.organization;

  const reportsByProject = new Map<number, Report[]>();
  for (const r of reports) {
    if (!reportsByProject.has(r.project_id)) reportsByProject.set(r.project_id, []);
    reportsByProject.get(r.project_id)!.push(r);
  }

  const updatesByProject = new Map<number, UpdateDoc[]>();
  for (const u of updates) {
    if (!updatesByProject.has(u.project_id)) updatesByProject.set(u.project_id, []);
    updatesByProject.get(u.project_id)!.push(u);
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
    const projectUpdates = (updatesByProject.get(prodoc.project_id) ?? [])
      .sort((a, b) => a.year - b.year || a.id - b.id);
    const projectComments = commentsByProject.get(prodoc.project_id) ?? [];
    const openComments = projectComments.filter((c) => !c.partner_addressed && !c.resolved);

    // Actions: partner-editable (Open / Partner Review) reports + prodoc
    const actions: ProjectAction[] = [];
    for (const r of projectReports) {
      if (isPartnerEditable(r.status)) {
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
          commentCount: openComments.filter((c) => c.data_type === "report" && c.year === r.year).length,
        });
      }
    }
    // Open project updates requested by CRAF'd are to-dos too.
    for (const u of projectUpdates) {
      if (!isPartnerEditable(u.status)) continue;
      const dueDate = u.report_submission_date ? new Date(u.report_submission_date) : null;
      const overdue = dueDate != null && dueDate < today;
      const dueSoon = dueDate != null && !overdue && dueDate <= thirtyDaysOut;
      actions.push({
        type: "update",
        label: `Complete Project Update ${updateName(u)}`,
        href: documentPath("/partner/project-updates", { ...u, data_type: "update" }, slug, firstUnlockedSection(u.unlocked_sections)),
        dueDateFormatted: u.report_submission_date ? formatDate(u.report_submission_date) : null,
        overdue,
        dueSoon,
        prodocStatus: null,
        commentCount: openComments.filter((c) => c.report_id === u.id).length,
      });
    }
    if (isPartnerEditable(prodoc.status)) {
      actions.push({
        type: "prodoc",
        label: "Complete Project Document",
        href: `/partner/prodoc-editor/${slug}/general`,
        dueDateFormatted: null,
        overdue: false,
        dueSoon: false,
        prodocStatus: prodoc.status,
        commentCount: openComments.filter((c) => c.data_type === "prodoc").length,
      });
    }

    const hasOverdue = actions.some((a) => a.overdue);
    const timeline = buildProjectTimeline(prodoc, projectReports, projectUpdates);

    // Detail tiles.
    let endDate: Date | null = null;
    if (prodoc.project_start_date && prodoc.project_duration_months) {
      endDate = new Date(prodoc.project_start_date);
      endDate.setMonth(endDate.getMonth() + prodoc.project_duration_months);
    }
    const stillWithPartner = [...projectReports, ...projectUpdates].filter(
      (d) => isPartnerEditable(d.status) && d.report_submission_date
    );
    const nextDue = stillWithPartner
      .map((d) => d.report_submission_date as string)
      .sort()[0] ?? null;
    const underReview = [
      ...(prodoc.status === "Under Review" ? [labels.partnerHome.timeline.projectDocument] : []),
      ...projectReports.filter((r) => r.status === "Under Review").map((r) => reportName(r.year, r.report_type)),
      ...projectUpdates.filter((u) => u.status === "Under Review").map((u) => `Project Update ${updateName(u)}`),
    ];

    // isPast: end date before today AND no actions
    let isPast = false;
    if (prodoc.project_start_date && prodoc.project_duration_months) {
      const start = new Date(prodoc.project_start_date);
      const end = new Date(start);
      end.setMonth(end.getMonth() + prodoc.project_duration_months);
      isPast = end < today && actions.length === 0;
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
      updates: projectUpdates,
      actions,
      timeline,
      isPast,
      hasOverdue,
      mptfo_project_number: prodoc.mptfo_project_number ?? null,
      project_status: prodoc.project_status ?? null,
      grant_size_usd: prodoc.grant_size_usd ?? null,
      periodStart: prodoc.project_start_date ? formatDate(prodoc.project_start_date) : null,
      periodEnd: endDate ? formatDate(endDate) : null,
      periodMonths: prodoc.project_duration_months ?? null,
      openCommentCount: openComments.length,
      nextDeadline: nextDue ? formatDate(nextDue) : null,
      underReview,
    });
  }

  return result.sort((a, b) => a.title.localeCompare(b.title));
}

// "2027-BR-TR" style name; the generic fallback already reads "Project Update 2027".
function updateName(u: UpdateDoc): string {
  const t = documentTitle({ ...u, data_type: "update" });
  return t.startsWith("Project Update ") ? t.slice("Project Update ".length) : t;
}

// Timeline order: Project Document → each Annual Report and Project Update (by due
// date; no due date → just before Project end) → Project end → Final Report →
// Closure. Each document dot shows its state: approved, with CRAF'd, or still with the
// partner (editing).
function buildProjectTimeline(prodoc: Report, reports: Report[], updates: UpdateDoc[] = []): TimelineEvent[] {
  const t = labels.partnerHome.timeline;
  const today = new Date();
  const soon = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  let projectEnd: Date | null = null;
  if (prodoc.project_start_date && prodoc.project_duration_months) {
    projectEnd = new Date(prodoc.project_start_date);
    projectEnd.setMonth(projectEnd.getMonth() + prodoc.project_duration_months);
  }
  // Final report is due six months after the project ends.
  const finalDueBy = projectEnd ? new Date(projectEnd) : null;
  if (finalDueBy) finalDueBy.setMonth(finalDueBy.getMonth() + 6);
  const noDueSentinel = projectEnd ? new Date(projectEnd.getTime() - 1) : new Date(8640000000000000 - 1);

  const isApproved = (status: string) => status === "Approved" || status === "Closed";

  // State + detail line for one document.
  function docState(d: Report, fallbackDue: Date | null): Pick<TimelineEvent, "state" | "detail" | "warn"> {
    if (isApproved(d.status)) {
      return {
        state: "approved",
        detail: d.approved_at ? t.approvedOn.replace("{date}", formatDate(d.approved_at)) : t.approved,
        warn: false,
      };
    }
    if (d.status === "Under Review") return { state: "crafd", detail: t.withCrafd, warn: false };
    if (isPartnerEditable(d.status)) {
      if (d.report_submission_date) {
        const due = new Date(d.report_submission_date);
        return { state: "editing", detail: t.due.replace("{date}", formatDate(d.report_submission_date)), warn: due <= soon };
      }
      if (fallbackDue) return { state: "editing", detail: t.dueBy.replace("{date}", formatDate(fallbackDue)), warn: false };
      return { state: "editing", detail: t.inProgress, warn: false };
    }
    return { state: "pending", detail: "", warn: false };
  }

  const events: TimelineEvent[] = [];

  // 1. Project Document (no due date: a partner-editable one reads "In progress").
  events.push({ label: t.projectDocument, ...docState(prodoc, null), _dateObj: new Date(0) });

  // 2. Annual reports and project updates, by due date.
  const docs: TimelineEvent[] = [
    ...reports.filter((r) => r.report_type !== "final").map((r) => ({ r, label: reportName(r.year, r.report_type) })),
    ...updates.map((u) => ({ r: u as Report, label: `Project Update ${updateName(u)}` })),
  ].map(({ r, label }) => ({
    label,
    ...docState(r, null),
    _dateObj: r.report_submission_date ? new Date(r.report_submission_date) : noDueSentinel,
  }));
  docs.sort((a, b) => a._dateObj.getTime() - b._dateObj.getTime());
  events.push(...docs);

  // 3. Project end.
  if (projectEnd) {
    events.push({
      label: t.projectEnd,
      state: projectEnd < today ? "passed" : "pending",
      detail: formatDate(projectEnd),
      warn: false,
      _dateObj: projectEnd,
    });
  }

  // 4. Final Report: its own state when it exists; a final report without a due date
  //    (or none yet) reads "Due by <end + 6 months>".
  const finalReport = reports.find((r) => r.report_type === "final");
  const dueByText = finalDueBy ? t.dueBy.replace("{date}", formatDate(finalDueBy)) : "";
  if (finalReport) {
    events.push({ label: t.finalReport, ...docState(finalReport, finalDueBy), _dateObj: finalDueBy ?? noDueSentinel });
  } else {
    events.push({ label: t.finalReport, state: "pending", detail: dueByText, warn: false, _dateObj: finalDueBy ?? noDueSentinel });
  }

  // 5. Closure: done once the final report is approved.
  events.push({
    label: t.closure,
    state: finalReport && isApproved(finalReport.status) ? "approved" : "pending",
    detail: "",
    warn: false,
    _dateObj: finalDueBy ?? noDueSentinel,
  });

  return events;
}
