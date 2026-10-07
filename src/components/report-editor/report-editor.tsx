"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { ReadOnlyProvider } from "@/components/ui/read-only-context";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { StatusChangeDialog } from "@/components/ui/status-change-dialog";
import { Loader2, FileQuestion, Lock, AlertTriangle, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { cn, projectSlug, shortName } from "@/lib/utils";
import labels from "@/lib/labels";
import { WorkplanPartnerEditor } from "@/components/workplan-grid";
import { useUndoHistory } from "@/components/report-editor/use-undo-history";
import { SectionTableEditor, buildSectionSpecs } from "@/components/section-table-editor";
import { ExpenditurePartnerEditor } from "@/components/expenditure-grid";
import { useAutosave, AutosaveIndicator, type SaveState } from "@/components/autosave";
import { LoadingState } from "@/components/admin/shared";
import { REPORT_SECTION_GROUPS, GROUP_STYLES, REPORT_SECTIONS } from "@/lib/report-sections";
import { CommentsProvider, ItemComments } from "@/components/report-editor/comments-context";
import { reportStatusStyle } from "@/lib/reports";
import { optionValues } from "@/lib/options";
import type { Report } from "@/lib/types";
import { ContributorMatrix, TRANSFERS_MATRIX_CONFIG, COMPLEMENTARY_MATRIX_CONFIG, type ContributorActivity } from "@/components/report-editor/contributor-matrix";
import {
  EMPTY_OVERVIEW,
  type Survey,
  type RowState,
  type OverviewData,
  type Risk,
  type RiskState,
  type IndicatorMatrixRow,
  type IndicatorState,
} from "@/components/report-editor/types";
import { OverviewSection } from "@/components/report-editor/sections/overview-section";
import { SurveysSection } from "@/components/report-editor/sections/surveys-section";
import { RiskSection } from "@/components/report-editor/sections/risk-section";
import { IndicatorsSection } from "@/components/report-editor/sections/indicators-section";
import { TestimonialsSection } from "@/components/report-editor/sections/testimonials-section";
import { useReportLock } from "@/components/report-editor/use-report-lock";

export interface RiskHistory {
  prodoc: Record<number, { likelihood: number | null; impact: number | null }>;
  years: Array<{
    year: number;
    shared: boolean;
    values: Record<number, { likelihood: number | null; impact: number | null }>;
  }>;
}

function toSlug(r: Report): string {
  return projectSlug(r.project_short_name, r.project_title);
}

// Quant tables that scroll inside their own bounded box with a frozen column
// header (rather than scrolling with the whole page). The section fills the
// leftover height so the header stays pinned while the body scrolls.
const FILL_HEIGHT_SECTIONS = new Set(["workplan", "transfers", "complementary", "expenditure", "indicators"]);

export interface ReportEditorProps {
  // "partner" filters reports to the logged-in partner and is editable;
  // "admin" shows every report and (with forceReadOnly) is a read-only mirror.
  mode?: "partner" | "admin";
  forceReadOnly?: boolean;
  showSectionTabs?: boolean;
  basePath?: string;
}

export function ReportEditor({
  mode = "partner",
  forceReadOnly = false,
  showSectionTabs = false,
  basePath = "/partner",
}: ReportEditorProps = {}) {
  const { user } = useAuth();
  const params = useParams<{ project: string; year: string; section: string }>();
  const confirm = useConfirm();
  const router = useRouter();

  // Built once per mount so the labels the specs read reflect admin overrides
  // (see buildSectionSpecs); identity stays stable across re-renders.
  const sectionSpecs = useMemo(() => buildSectionSpecs(), []);

  const [reports, setReports] = useState<Report[]>([]);
  const [reportId, setReportId] = useState<number | null>(null);
  const [loadingReports, setLoadingReports] = useState(true);

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [rowStates, setRowStates] = useState<Record<number, RowState>>({});
  const [loadingSurveys, setLoadingSurveys] = useState(false);

  const [overview, setOverview] = useState<OverviewData>(EMPTY_OVERVIEW);
  const [overviewDirty, setOverviewDirty] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(false);

  const [risks, setRisks] = useState<Risk[]>([]);
  const [riskStates, setRiskStates] = useState<Record<number, RiskState>>({});
  const [loadingRisk, setLoadingRisk] = useState(false);

  // Past-year risk history (prodoc baseline + updated values per report year).
  const [riskHistory, setRiskHistory] = useState<RiskHistory | null>(null);

  // Risks are report-scoped and can be added here; editing and deleting their
  // core (admin-owned) fields is the ProDoc editor's job.
  const [newRiskName, setNewRiskName] = useState("");
  const [newRiskDescription, setNewRiskDescription] = useState("");
  const [newRiskCategory, setNewRiskCategory] = useState<string[]>([]);
  const [addingRisk, setAddingRisk] = useState(false);

  const [indicatorRows, setIndicatorRows] = useState<IndicatorMatrixRow[]>([]);
  const [indicatorYears, setIndicatorYears] = useState<number[]>([]);
  const [indicatorCurrentYear, setIndicatorCurrentYear] = useState<number | null>(null);
  const [indicatorStates, setIndicatorStates] = useState<Record<number, IndicatorState>>({});
  const [loadingIndicators, setLoadingIndicators] = useState(false);

  // Activities for the linked outcome / objective column in the indicators table (read-only display).
  const [activities, setActivities] = useState<ContributorActivity[]>([]);

  const loadActivities = useCallback(async (projectId: number) => {
    try {
      const res = await fetch(`/api/workplan-activities?projectId=${projectId}`);
      if (!res.ok) return;
      const data = await res.json();
      setActivities(Array.isArray(data.activities) ? data.activities : []);
    } catch { /* quiet — empty list is fine */ }
  }, []);

  // Undo / redo over the parent-managed section edits. History is per section
  // visit (reset when the section or report changes, inside the hook).
  const scheduleRef = useRef<(() => void) | undefined>(undefined);
  const { pushCommand } = useUndoHistory({
    resetKeys: [reportId, params.section],
    onAfterApply: () => scheduleRef.current?.(),
  });

  // Every section autosaves. The child editors (list sections, expenditure,
  // workplan) report their save state up via onSaveStateChange; the parent-managed
  // sections (surveys, overview, risk, indicators) drive the autosave hook below.
  const [childSaveState, setChildSaveState] = useState<SaveState>("idle");

  // Keep-alive: each section mounts once and is hidden via the `hidden` attribute
  // rather than being unmounted on tab switch. visitedRef tracks which sections have
  // been mounted at least once. setMountTick forces a re-render after the ref grows.
  const visitedRef = useRef<Set<string>>(new Set([params.section ?? "overview"]));
  const [, setMountTick] = useState(0);

  const [pendingStatus, setPendingStatus] = useState<Report["status"] | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sectionCompletion, setSectionCompletion] = useState<Record<string, boolean> | null>(null);

  const loadSurveys = useCallback(async (id: number) => {
    setLoadingSurveys(true);
    setError(null);
    try {
      const res = await fetch(`/api/surveys?reportId=${id}`);
      if (!res.ok) throw new Error("Failed to load surveys");
      const data: Survey[] = await res.json();
      setSurveys(data);
      const states: Record<number, RowState> = {};
      for (const s of data) {
        states[s.id] = { assessment: s.assessment, context: s.context ?? "", dirty: false };
      }
      setRowStates(states);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingSurveys(false);
    }
  }, []);

  const loadOverview = useCallback(async (id: number) => {
    setLoadingOverview(true);
    setError(null);
    try {
      const res = await fetch(`/api/overview?reportId=${id}`);
      if (!res.ok) throw new Error("Failed to load overview");
      const data = await res.json();
      if (data) {
        setOverview({
          project_title: data.project_title ?? "",
          mptfo_project_number: data.mptfo_project_number ?? "",
          organization_name: data.organization_name ?? "",
          organization_website: data.organization_website ?? "",
          grant_size_usd: data.grant_size_usd != null ? String(data.grant_size_usd) : "",
          participating_organizations: Array.isArray(data.participating_organizations) ? data.participating_organizations : [],
          implementing_partners: Array.isArray(data.implementing_partners) ? data.implementing_partners : [],
          geographic_scope: data.geographic_scope ?? "",
          report_submission_date: data.report_submission_date?.slice(0, 10) ?? "",
          project_start_date: data.project_start_date?.slice(0, 10) ?? "",
          project_duration_months: data.project_duration_months != null ? String(data.project_duration_months) : "",
          authorized: data.authorized ?? false,
        });
      }
      setOverviewDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const loadRisk = useCallback(async (id: number) => {
    setLoadingRisk(true);
    setError(null);
    try {
      const res = await fetch(`/api/risk?reportId=${id}`);
      if (!res.ok) throw new Error("Failed to load risks");
      const data: Risk[] = await res.json();
      setRisks(data);
      const states: Record<number, RiskState> = {};
      for (const r of data) {
        states[r.id] = {
          risk_name: r.risk_name,
          risk_description: r.risk_description ?? "",
          risk_category: r.risk_category ?? [],
          updated_likelihood: r.updated_likelihood,
          updated_impact: r.updated_impact,
          updated_mitigation: r.updated_mitigation ?? "",
          project_revision: r.project_revision,
          dirty: false,
        };
      }
      setRiskStates(states);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingRisk(false);
    }
  }, []);

  const loadRiskHistory = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/risk/history?reportId=${id}`);
      if (!res.ok) return;
      const data: RiskHistory = await res.json();
      setRiskHistory(data);
    } catch { /* quiet — history is non-blocking */ }
  }, []);

  const loadIndicators = useCallback(async (id: number) => {
    setLoadingIndicators(true);
    setError(null);
    try {
      const res = await fetch(`/api/indicator-data?reportId=${id}&matrix=1`);
      if (!res.ok) throw new Error("Failed to load indicators");
      const data: { years: number[]; currentYear: number | null; rows: IndicatorMatrixRow[] } = await res.json();
      setIndicatorRows(data.rows);
      setIndicatorYears(data.years);
      setIndicatorCurrentYear(data.currentYear);
      const states: Record<number, IndicatorState> = {};
      for (const row of data.rows) {
        const cell = data.currentYear != null ? row.byYear[data.currentYear] : undefined;
        states[row.currentLineId] = {
          baseline_value: row.baseline_value ?? "",
          baseline_year: row.baseline_year != null ? String(row.baseline_year) : "",
          target_value: row.target_value ?? "",
          target_year: row.target_year != null ? String(row.target_year) : "",
          achieved_value: cell?.achieved_value ?? "",
          status: cell?.status ?? null,
          comment: cell?.comment ?? "",
          dirty: false,
        };
      }
      setIndicatorStates(states);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingIndicators(false);
    }
  }, []);

  const fetchCompletion = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/report-completion?reportId=${id}`);
      if (!res.ok) return;
      const data: { sections: Record<string, boolean> } = await res.json();
      setSectionCompletion(data.sections);
    } catch {
      // don't block submit on transient network errors
    }
  }, []);

  // Load reports once per project/year
  useEffect(() => {
    if (!user) return;
    setLoadingReports(true);
    setReportId(null);
    fetch("/api/reports?data_type=report")
      .then((r) => r.json())
      .then((all: Report[]) => {
        const list = Array.isArray(all) ? all : [];
        setReports(list);
        const match = list.find(
          (r) => toSlug(r) === params.project && String(r.year) === params.year
        );
        if (match) {
          setReportId(match.id);
          setOverview({
            project_title: match.project_title || "",
            mptfo_project_number: match.mptfo_project_number || "",
            organization_name: match.partner_long_name || "",
            organization_website: match.organization_website || "",
            grant_size_usd: match.grant_size_usd != null ? String(match.grant_size_usd) : "",
            participating_organizations: [],
            implementing_partners: [],
            geographic_scope: match.geographic_scope || "",
            report_submission_date: match.report_submission_date?.slice(0, 10) || "",
            project_start_date: match.project_start_date?.slice(0, 10) || "",
            project_duration_months: match.project_duration_months != null ? String(match.project_duration_months) : "",
            authorized: false,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingReports(false));
  }, [user, params.project, params.year]);

  // Load all parent-managed section data once per report (not per section switch).
  // With keep-alive, all four sections are mounted before the user visits them so
  // their data must be available up-front. Config-driven list sections and the
  // transfer/complementary matrices load their own data inside their child components.
  useEffect(() => {
    if (!reportId) return;
    setChildSaveState("idle");
    // Reset visited sections for the new report so old-report tab state is discarded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    visitedRef.current = new Set([params.section ?? "overview"]);
    setMountTick((t) => t + 1);
    loadSurveys(reportId);
    loadOverview(reportId);
    loadRisk(reportId);
    loadRiskHistory(reportId);
    loadIndicators(reportId);
    const projectId = reports.find((r) => r.id === reportId)?.project_id;
    if (projectId) loadActivities(projectId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, loadSurveys, loadOverview, loadRisk, loadRiskHistory, loadIndicators, loadActivities, reports]);

  useEffect(() => {
    if (!reportId) return;
    fetchCompletion(reportId);
  }, [reportId, params.section, fetchCompletion]);

  // Reset section-specific UI state on section change so that forms left open
  // on one section (e.g. "Add risk") do not reappear when returning to it.
  useEffect(() => {
    setSubmitError(null);
    setAddingRisk(false);
    setNewRiskName("");
    setNewRiskCategory([]);
    setChildSaveState("idle");
  }, [params.section]);

  // Track visited sections and pre-mount background tabs one at a time so the
  // first visible section stays on the critical path.
  useEffect(() => {
    if (!reportId) return;
    visitedRef.current.add(params.section);
    const unvisited = REPORT_SECTIONS.map((s) => s.value).filter((k) => !visitedRef.current.has(k));
    if (!unvisited.length) return;
    let i = 0;
    const scheduleNext = () => {
      if (i >= unvisited.length) return;
      const fn = () => {
        visitedRef.current.add(unvisited[i]);
        i++;
        setMountTick((t) => t + 1);
        scheduleNext();
      };
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(fn, { timeout: 300 });
      } else {
        setTimeout(fn, 50);
      }
    };
    scheduleNext();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.section, reportId]);

  function handleReportChange(val: string) {
    const report = reports.find((r) => String(r.id) === val);
    if (!report) return;
    // Preserve the current section when switching reports, but default to
    // overview when there is no section yet (e.g. opening from the landing page).
    router.push(`${basePath}/${toSlug(report)}/${report.year}/${params.section ?? "overview"}`);
  }

  function handleSectionChange(section: string) {
    if (!selectedReport || section === params.section) return;
    router.push(`${basePath}/${toSlug(selectedReport)}/${selectedReport.year}/${section}`);
  }

  // Change the report's status from the top bar (admin only). Opens the
  // StatusChangeDialog to collect a name and reason before applying.
  function handleReportStatusChange(newStatus: Report["status"]) {
    if (!selectedReport) return;
    setPendingStatus(newStatus);
  }

  async function applyStatusChange({ actorName, reason }: { actorName: string; reason: string }) {
    if (!selectedReport || !pendingStatus) return;
    const id = selectedReport.id;
    const newStatus = pendingStatus;
    setPendingStatus(null);
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
    await fetch(`/api/reports/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: newStatus,
        actor_name: actorName || null,
        reason: reason || null,
      }),
    });
  }

  async function handleSubmit() {
    if (!selectedReport || !reportId) return;
    const ok = await confirm({
      title: "Submit report?",
      message:
        "Once submitted, this report will be locked for editing and CRAF'd will be notified to begin their review.",
      confirmLabel: "Submit",
      cancelLabel: "Cancel",
      variant: "default",
    });
    if (!ok) return;

    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/report-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to submit report.");
      } else {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status: "Under Review" } : r))
        );
        await confirm({
          acknowledgement: true,
          title: "Report submitted",
          message:
            "Your report is now locked for editing. Please email crafd@un.org to let CRAF'd know it's ready for review.",
          confirmLabel: "OK",
        });
      }
    } catch {
      setSubmitError("Failed to submit report. Please try again.");
    } finally {
      setSubmitLoading(false);
    }
  }

  // ── Autosave for the parent-managed sections ──────────────────────────────
  // Saves every dirty item across surveys / overview / risk / indicators, so an
  // in-flight edit is never dropped when the user switches section before it
  // fires. A dirty flag is only cleared if the content is unchanged since the
  // snapshot, so edits made during the network round-trip survive.
  const overviewRef = useRef<OverviewData>(overview);
  useEffect(() => { overviewRef.current = overview; }, [overview]);

  const flushParent = async () => {
    if (!reportId) return;
    const dirtySurveys = surveys.filter((s) => rowStates[s.id]?.dirty);
    const surveySnap = new Map(dirtySurveys.map((s) => [s.id, JSON.stringify({ a: rowStates[s.id].assessment, c: rowStates[s.id].context })]));
    const dirtyRisks = risks.filter((r) => riskStates[r.id]?.dirty);
    const riskSnap = new Map(dirtyRisks.map((r) => [r.id, JSON.stringify({ n: riskStates[r.id].risk_name, d: riskStates[r.id].risk_description, c: riskStates[r.id].risk_category, ul: riskStates[r.id].updated_likelihood, ui: riskStates[r.id].updated_impact, m: riskStates[r.id].updated_mitigation, p: riskStates[r.id].project_revision })]));
    const dirtyInd = indicatorRows.filter((r) => indicatorStates[r.currentLineId]?.dirty);
    const indSnap = new Map(dirtyInd.map((r) => [r.currentLineId, JSON.stringify(indicatorStates[r.currentLineId])]));
    const saveOverview = overviewDirty;
    const overviewSnap = JSON.stringify(overview);

    const ok = async (r: Response) => {
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        throw new Error(errData.error || labels.common.saveFailed);
      }
    };
    try {
      await Promise.all([
        ...dirtySurveys.map((s) => {
          const st = rowStates[s.id];
          return fetch("/api/surveys", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, assessment: st.assessment, context: st.context || null }) }).then(ok);
        }),
        ...dirtyRisks.map((r) => {
          const st = riskStates[r.id];
          const patch: Record<string, unknown> = { id: r.id, updated_likelihood: st.updated_likelihood, updated_impact: st.updated_impact, updated_mitigation: st.updated_mitigation || null, project_revision: st.project_revision };
          if (r.source_risk_id === null) { patch.risk_name = st.risk_name; patch.risk_description = st.risk_description || null; patch.risk_category = st.risk_category; }
          return fetch("/api/risk", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then(ok);
        }),
        ...dirtyInd.map((r) => {
          const st = indicatorStates[r.currentLineId];
          return fetch("/api/indicator-data", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            id: r.currentLineId,
            baseline_value: st.baseline_value || null,
            baseline_year: st.baseline_year || null,
            target_value: st.target_value || null,
            target_year: st.target_year || null,
            achieved_value: st.achieved_value || null,
            status: st.status,
            comment: st.comment || null,
          }) }).then(ok);
        }),
        ...(saveOverview ? [fetch("/api/overview", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId, authorized: overview.authorized }) }).then(ok)] : []),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.common.saveFailed);
      throw e;
    }

    if (dirtySurveys.length) setRowStates((prev) => {
      const n = { ...prev };
      for (const s of dirtySurveys) { const cur = prev[s.id]; if (cur && JSON.stringify({ a: cur.assessment, c: cur.context }) === surveySnap.get(s.id)) n[s.id] = { ...cur, dirty: false }; }
      return n;
    });
    if (dirtyRisks.length) setRiskStates((prev) => {
      const n = { ...prev };
      for (const r of dirtyRisks) { const cur = prev[r.id]; if (cur && JSON.stringify({ n: cur.risk_name, d: cur.risk_description, c: cur.risk_category, ul: cur.updated_likelihood, ui: cur.updated_impact, m: cur.updated_mitigation, p: cur.project_revision }) === riskSnap.get(r.id)) n[r.id] = { ...cur, dirty: false }; }
      return n;
    });
    if (dirtyInd.length) setIndicatorStates((prev) => {
      const n = { ...prev };
      for (const r of dirtyInd) { const cur = prev[r.currentLineId]; if (cur && JSON.stringify(cur) === indSnap.get(r.currentLineId)) n[r.currentLineId] = { ...cur, dirty: false }; }
      return n;
    });
    if (saveOverview && JSON.stringify(overviewRef.current) === overviewSnap) setOverviewDirty(false);
  };

  const parentAutosave = useAutosave(flushParent);
  useEffect(() => { scheduleRef.current = parentAutosave.schedule; }, [parentAutosave.schedule]);

  // Flush any pending parent-managed edit when navigating away from the editor.
  useEffect(() => () => { parentAutosave.flushNow(); }, [parentAutosave.flushNow]);

  function updateRow(id: number, patch: Partial<RowState>) {
    pushMapEdit(setRowStates, rowStates, id, patch, { dirty: true });
  }

  function updateOverview(patch: Partial<OverviewData>) {
    const before = overview;
    const after = { ...overview, ...patch };
    setOverview(after);
    setOverviewDirty(true);
    pushCommand({
      undo: () => { setOverview(before); setOverviewDirty(true); },
      redo: () => { setOverview(after); setOverviewDirty(true); },
    });
    parentAutosave.schedule();
  }

  function updateRisk(id: number, patch: Partial<RiskState>) {
    pushMapEdit(setRiskStates, riskStates, id, patch, { dirty: true });
  }

  async function handleRiskAdd() {
    if (!newRiskName.trim() || !reportId) return;
    setAddingRisk(true);
    setError(null);
    try {
      const res = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          risk_name: newRiskName,
          risk_description: newRiskDescription || null,
          risk_category: newRiskCategory,
        }),
      });
      if (!res.ok) throw new Error("Failed to add risk");
      const created: Risk = await res.json();
      setRisks((prev) => [...prev, created]);
      setRiskStates((prev) => ({
        ...prev,
        [created.id]: {
          risk_name: created.risk_name,
          risk_description: created.risk_description ?? "",
          risk_category: created.risk_category ?? [],
          updated_likelihood: created.updated_likelihood,
          updated_impact: created.updated_impact,
          updated_mitigation: created.updated_mitigation ?? "",
          project_revision: created.project_revision,
          dirty: false,
        },
      }));
      setNewRiskName("");
      setNewRiskDescription("");
      setNewRiskCategory([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAddingRisk(false);
    }
  }

  async function handleRiskDelete(id: number) {
    const ok = await confirm({
      title: "Remove risk",
      message: "This risk was added during reporting and will be permanently deleted.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/risk?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete risk");
      setRisks((prev) => prev.filter((r) => r.id !== id));
      setRiskStates((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleShareYear(year: number, shared: boolean) {
    if (!reportId || !riskHistory) return;
    const currentShared = riskHistory.years.filter((y) => y.shared).map((y) => y.year);
    const next = shared
      ? [...new Set([...currentShared, year])]
      : currentShared.filter((y) => y !== year);
    await fetch(`/api/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ risk_shared_years: next }),
    });
    loadRiskHistory(reportId);
  }

  function updateIndicator(id: number, patch: Partial<IndicatorState>) {
    pushMapEdit(setIndicatorStates, indicatorStates, id, patch, { dirty: true });
  }

  // A single-field edit on a keyed-state map. Captures the before/after values so
  // undo restores the previous value (re-flagged dirty so autosave persists it)
  // and redo re-applies. `dirty` is the section's dirty flag(s).
  function pushMapEdit<T extends object>(
    setMap: Dispatch<SetStateAction<Record<number, T>>>,
    current: Record<number, T>,
    id: number,
    patch: Partial<T>,
    dirty: Partial<T>,
  ) {
    const before = current[id];
    const after = { ...before, ...patch, ...dirty } as T;
    setMap({ ...current, [id]: after });
    pushCommand({
      undo: () => setMap((m) => ({ ...m, [id]: { ...before, ...dirty } as T })),
      redo: () => setMap((m) => ({ ...m, [id]: after })),
    });
    parentAutosave.schedule();
  }

  const selectedReport = reports.find(
    (r) => toSlug(r) === params.project && String(r.year) === params.year
  );
  // Status → who can edit:
  //   Open          → admin + partner
  //   Under Review  → admin only (partner is read-only)
  //   Closed        → no one
  // (forceReadOnly still wins as an explicit override.)
  const statusReadOnly =
    forceReadOnly ||
    (!!selectedReport &&
      (selectedReport.status === "Closed" ||
        (selectedReport.status === "Under Review" && mode !== "admin")));

  const { phase, holder, noteEdit, startEditing, isReadOnlyByLock } = useReportLock({
    reportId,
    enabled: !statusReadOnly && reportId != null,
  });

  const readOnly = statusReadOnly || isReadOnlyByLock;
  const sectionLoading =
    params.section === "surveys" ? loadingSurveys :
    params.section === "overview" ? loadingOverview :
    params.section === "risk" ? loadingRisk :
    params.section === "indicators" ? loadingIndicators : false;
  const notFound = !loadingReports && !selectedReport;

  const incompleteSections =
    sectionCompletion !== null
      ? REPORT_SECTIONS.filter(
          (s) => s.value !== "overview" && sectionCompletion[s.value] === false
        )
      : [];

  const submitBlockers: string[] = [];
  const authorizedComplete =
    sectionCompletion !== null ? sectionCompletion["overview"] : overview.authorized;
  if (!authorizedComplete)
    submitBlockers.push("Tick the authorization checkbox in the Overview tab before submitting.");
  if (incompleteSections.length > 0)
    submitBlockers.push(
      `Complete ${incompleteSections.length === 1 ? "this section" : "these sections"} first: ${incompleteSections.map((s) => s.label).join(", ")}.`
    );

  // The parent-managed sections drive `parentAutosave`; the rest report up via
  // `childSaveState`. The top-bar indicator shows whichever owns the active tab.
  const parentManaged = ["surveys", "overview", "risk", "indicators"].includes(params.section);
  const displaySaveState = parentManaged ? parentAutosave.state : childSaveState;

  const prevSaveStateRef = useRef<SaveState | null>(null);
  useEffect(() => {
    if (displaySaveState === "saved" && prevSaveStateRef.current !== "saved" && reportId)
      fetchCompletion(reportId);
    prevSaveStateRef.current = displaySaveState;
  }, [displaySaveState, reportId, fetchCompletion]);

  // Wire noteEdit so the inactivity clock resets whenever a save begins.
  useEffect(() => {
    if (parentAutosave.state === "saving") noteEdit();
  }, [parentAutosave.state, noteEdit]);

  useEffect(() => {
    if (phase === "lock-error") setError("The editing lock could not be checked. Please reload the page.");
  }, [phase]);

  function handleChildSaveStateChange(state: SaveState) {
    setChildSaveState(state);
    if (state === "saving") noteEdit();
  }

  // Sections whose table freezes its column header inside a bounded scroll box.
  const fillHeight = FILL_HEIGHT_SECTIONS.has(params.section);

  const nextSection = (() => {
    const i = REPORT_SECTIONS.findIndex((s) => s.value === params.section);
    return i >= 0 && i < REPORT_SECTIONS.length - 1 ? REPORT_SECTIONS[i + 1] : null;
  })();

  const prevSection = (() => {
    const i = REPORT_SECTIONS.findIndex((s) => s.value === params.section);
    return i > 0 ? REPORT_SECTIONS[i - 1] : null;
  })();

  const canSubmit =
    mode !== "admin" &&
    selectedReport?.status === "Open" &&
    user?.organization?.toLowerCase() === selectedReport?.partner_short_name?.toLowerCase();

  return (
    <CommentsProvider reportId={reportId} enabled={reportId != null} readOnly={mode !== "admin"} role={mode === "admin" ? "admin" : "partner"}>
    <div className="flex flex-col h-full bg-background">

      {/* Top bar */}
      <div className="bg-neutral-950 text-white px-8 h-32 flex items-center justify-between gap-4 shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-neutral-400 text-sm mb-1">
            {labels.partnerEditor.title}
            {(() => {
              const section = REPORT_SECTIONS.find((s) => s.value === params.section);
              return section ? (
                <><span className="mx-1">›</span><span className="text-neutral-200">{section.label}</span></>
              ) : null;
            })()}
          </p>
          {selectedReport ? (
            <>
              <div className="flex items-center gap-3">
                <h1 className="t-title-page capitalize">
                  {selectedReport.report_type ?? "annual"} Report {selectedReport.year}
                </h1>
                {mode === "admin" ? (
                  <Select value={selectedReport.status} onValueChange={(v) => handleReportStatusChange(v as Report["status"])}>
                    <SelectTrigger className={cn(
                      "h-7 w-auto gap-1 rounded-full border-0 px-2.5 text-xs font-semibold [&>svg]:size-3 [&>svg]:opacity-70",
                      reportStatusStyle(selectedReport.status, "dark")
                    )}>
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        {readOnly && <Lock className="size-3" />}
                        {selectedReport.status}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {optionValues("reportStatus").map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    reportStatusStyle(selectedReport.status, "dark")
                  )}>
                    {readOnly && <Lock className="size-3" />}
                    {selectedReport.status}
                  </span>
                )}
              </div>
              <p className="text-neutral-400 text-sm mt-0.5 truncate" title={selectedReport.project_title}>{selectedReport.project_title}</p>
            </>
          ) : (
            <h1 className="t-title-page">{labels.partnerEditor.title}</h1>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {reportId && !sectionLoading && !notFound && (
            <AutosaveIndicator tone="dark" idleAsSaved state={displaySaveState} />
          )}
          {reportId && mode === "admin" && (
            <Button variant="outline" size="sm" className="h-9 shrink-0 bg-neutral-900 border-neutral-700 text-white hover:bg-neutral-800 hover:text-white"
              onClick={() => window.open(`/report-print/${reportId}?auto=1`, "_blank")}>
              <Printer className="size-4 mr-1.5" />
              Print
            </Button>
          )}

          <Select
            value={selectedReport ? String(selectedReport.id) : ""}
            onValueChange={handleReportChange}
            disabled={loadingReports}
          >
            <SelectTrigger className="w-[300px] max-w-[45vw] h-9 bg-neutral-900 border-neutral-700 text-white">
              {loadingReports ? (
                <span className="flex items-center gap-2 text-neutral-400">
                  <Loader2 className="size-3 animate-spin" /> {labels.common.loading}
                </span>
              ) : selectedReport ? (
                <span className="truncate capitalize">
                  {selectedReport.report_type ?? "annual"} Report {selectedReport.year} · {selectedReport.project_short_name || selectedReport.project_title}
                </span>
              ) : (
                <span className="text-neutral-400">{labels.partnerEditor.selectReport}</span>
              )}
            </SelectTrigger>
            <SelectContent>
              {mode === "admin" ? (
                // Reports classified underneath the partner & project (same grouping
                // logic as the prodoc editor's project dropdown).
                Object.entries(
                  reports.reduce((acc, r) => {
                    const key = `${shortName(r.partner_short_name)} · ${r.project_short_name || r.project_title}`;
                    (acc[key] ??= []).push(r);
                    return acc;
                  }, {} as Record<string, Report[]>)
                ).map(([group, grouped]) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {grouped
                      .slice()
                      .sort((a, b) => b.year - a.year)
                      .map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          <span className="capitalize">{r.report_type ?? "annual"} Report {r.year}</span>
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))
              ) : (
                reports.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    <div className="flex flex-col">
                      <span className="capitalize">{r.report_type ?? "annual"} Report {r.year}</span>
                      <span className="text-xs text-muted-foreground">{r.project_short_name || r.project_title}</span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

        </div>
      </div>

      {/* Section tabs — shown in the admin mirror (the partner nav uses the sidebar).
          Kept to a single line: only the group containing the current section is
          expanded into its tabs; the other group collapses to a clickable label
          (click jumps to its first section, expanding it). */}
      {showSectionTabs && selectedReport && (() => {
        const activeGroup =
          REPORT_SECTION_GROUPS.find((g) => g.sections.some((s) => s.value === params.section))?.label
          ?? REPORT_SECTION_GROUPS[0].label;
        return (
          <div className="border-b px-8 flex items-center gap-1 shrink-0">
            {REPORT_SECTION_GROUPS.map((grp, i) => {
              const expanded = grp.label === activeGroup;
              return (
                <div key={grp.label} className="flex items-center gap-1">
                  {/* Divider so the two groups read as distinct. */}
                  {i > 0 && <span className="mx-2 h-5 w-px bg-border" aria-hidden />}
                  {expanded ? (
                    <>
                      <span className={cn(
                        "px-1 text-[10px] font-semibold uppercase tracking-wider",
                        GROUP_STYLES[grp.label].header
                      )}>
                        {grp.label}
                      </span>
                      {grp.sections.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => handleSectionChange(s.value)}
                          className={cn(
                            "px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                            params.section === s.value
                              ? GROUP_STYLES[grp.label].tabActive
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {s.label}
                        </button>
                      ))}
                    </>
                  ) : (
                    // Collapsed group: jump to its first section to open it.
                    <button
                      onClick={() => handleSectionChange(grp.sections[0].value)}
                      title={`Go to ${grp.label}`}
                      className={cn(
                        "px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-70",
                        GROUP_STYLES[grp.label].header
                      )}
                    >
                      {grp.label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Content — the workplan fills the leftover height and scrolls inside its
          own box (single scroller, frozen header); every other tab scrolls here. */}
      <div className={cn("flex-1 px-8 py-6", fillHeight ? "flex flex-col min-h-0 overflow-hidden" : "overflow-auto")}>
        {/* Tab instructions — only while the report is editable */}
        {params.section !== "overview" && params.section !== "testimonials" && !notFound && !readOnly && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {labels.tabInstructions[params.section as keyof typeof labels.tabInstructions] || ""}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {statusReadOnly && !sectionLoading && !notFound && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Lock className="size-4 shrink-0" />
            <span>
              This report is <b>{selectedReport?.status}</b> and is view-only. Contact the CRAF'd Secretariat if changes are needed.
            </span>
          </div>
        )}

        {/* Lock acquisition in progress */}
        {!statusReadOnly && reportId && phase === "acquiring" && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-600">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            <span>Checking editor availability…</span>
          </div>
        )}

        {/* Editing session ended due to inactivity */}
        {!statusReadOnly && reportId && phase === "timed-out" && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <div className="flex items-center gap-2">
              <Lock className="size-3.5 shrink-0" />
              <span>Your editing session ended due to inactivity.</span>
            </div>
            <button
              className="shrink-0 h-7 px-2.5 text-xs rounded-md border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900"
              onClick={startEditing}
            >
              Start editing
            </button>
          </div>
        )}

        {/* Another session holds the lock */}
        {!statusReadOnly && reportId && phase === "blocked" && holder && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <Lock className="size-3.5 shrink-0" />
            <span><b>{holder.name}</b> currently has this report open.</span>
          </div>
        )}

        {/* Lock just freed — user must click to claim it */}
        {!statusReadOnly && reportId && phase === "available" && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-900">
            <span>This report is now available.</span>
            <button
              className="shrink-0 h-7 px-2.5 text-xs rounded-md border border-green-300 bg-green-50 hover:bg-green-100 text-green-900"
              onClick={startEditing}
            >
              Start editing
            </button>
          </div>
        )}

        {/* Inactivity warning — lock will expire in ~1 minute */}
        {!statusReadOnly && reportId && phase === "warning" && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>Your editing session will expire in 1 minute due to inactivity.</span>
            </div>
            <button
              className="shrink-0 h-7 px-2.5 text-xs rounded-md border border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-900"
              onClick={noteEdit}
            >
              Keep editing
            </button>
          </div>
        )}

        {/* Section-level comment thread — mirrors the prodoc editor. Placed outside
            the read-only fieldset so admins can comment on Under Review reports and
            partners can still confirm on a locked one. ItemComments self-hides when
            there are no comments and the user cannot create them. */}
        {reportId && !sectionLoading && !notFound && (
          <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
            {mode === "admin" && <span>Comment on this section:</span>}
            <ItemComments section={params.section} itemId={null} />
          </div>
        )}

        {/* Two complementary read-only mechanisms cover the whole section view:
            (1) the disabled <fieldset> natively locks every native control inside
            (input, textarea, button) while keeping scrolling and text selection;
            (2) <ReadOnlyProvider> locks every Radix Select AND DropdownMenu in the
            subtree — those portalled triggers are NOT reliably disabled by
            fieldset[disabled] (a Chromium/WebKit quirk, worse still if the fieldset
            is display:flex), so without it dropdowns like the workplan status,
            survey assessment, indicator status or the complementary linked-activities
            menu would stay live on a closed report. Together they mean no per-control
            readOnly threading is needed for the standard controls. The fieldset also
            stays at its default (block) display for the same cascade reason — the
            workplan's flex layout lives on the inner wrapper. */}
        <ReadOnlyProvider readOnly={readOnly}>
        <fieldset disabled={readOnly} className={cn("min-w-0 border-0 p-0 m-0", fillHeight && "flex-1 min-h-0")}>
        <div className={cn("min-w-0", fillHeight && "flex flex-col h-full min-h-0")}>
        {notFound ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <FileQuestion className="size-10 opacity-30" />
            <p className="text-sm">{params.project ? labels.partnerEditor.notFound : "Select a report above to view it."}</p>
          </div>
        ) : loadingReports ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
          </div>

        ) : (
          <>
            {/* Parent-managed: surveys, overview, risk, indicators */}
            {visitedRef.current.has("surveys") && (
              <div hidden={params.section !== "surveys"}>
                {loadingSurveys && surveys.length === 0 ? (
                  <LoadingState />
                ) : (
                  <SurveysSection surveys={surveys} rowStates={rowStates} updateRow={updateRow} />
                )}
              </div>
            )}

            {visitedRef.current.has("overview") && (
              <div hidden={params.section !== "overview"}>
                {loadingOverview ? (
                  <LoadingState />
                ) : (
                  <OverviewSection overview={overview} updateOverview={updateOverview} />
                )}
              </div>
            )}

            {visitedRef.current.has("risk") && (
              <div hidden={params.section !== "risk"}>
                {loadingRisk && risks.length === 0 ? (
                  <LoadingState />
                ) : (
                  <RiskSection
                    risks={risks}
                    riskStates={riskStates}
                    reportYear={selectedReport?.year ?? 0}
                    riskHistory={riskHistory}
                    isAdmin={mode === "admin"}
                    onShareYear={handleShareYear}
                    newRiskName={newRiskName}
                    setNewRiskName={setNewRiskName}
                    newRiskDescription={newRiskDescription}
                    setNewRiskDescription={setNewRiskDescription}
                    newRiskCategory={newRiskCategory}
                    setNewRiskCategory={setNewRiskCategory}
                    addingRisk={addingRisk}
                    handleRiskAdd={handleRiskAdd}
                    updateRisk={updateRisk}
                    handleRiskDelete={handleRiskDelete}
                  />
                )}
              </div>
            )}

            {visitedRef.current.has("indicators") && (
              <div hidden={params.section !== "indicators"} className={cn(fillHeight && "flex flex-col flex-1 min-h-0")}>
                {loadingIndicators && indicatorRows.length === 0 ? (
                  <LoadingState />
                ) : (
                  <IndicatorsSection
                    indicatorRows={indicatorRows}
                    indicatorYears={indicatorYears}
                    indicatorCurrentYear={indicatorCurrentYear}
                    indicatorStates={indicatorStates}
                    updateIndicator={updateIndicator}
                    isAdmin={mode === "admin"}
                    fillHeight={fillHeight}
                    activities={activities}
                  />
                )}
              </div>
            )}

            {/* Child-managed: transfers, complementary, testimonials, sectionSpecs, workplan, expenditure */}
            {visitedRef.current.has("transfers") && reportId && (
              <div hidden={params.section !== "transfers"} className={cn(fillHeight && "flex flex-col flex-1 min-h-0")}>
                <ContributorMatrix
                  reportId={reportId}
                  projectId={reports.find((r) => r.id === reportId)?.project_id ?? null}
                  config={TRANSFERS_MATRIX_CONFIG}
                  pushCommand={pushCommand}
                  onSaveStateChange={handleChildSaveStateChange}
                  onError={setError}
                  fillHeight={fillHeight}
                />
              </div>
            )}

            {visitedRef.current.has("complementary") && reportId && (
              <div hidden={params.section !== "complementary"} className={cn(fillHeight && "flex flex-col flex-1 min-h-0")}>
                <ContributorMatrix
                  reportId={reportId}
                  projectId={reports.find((r) => r.id === reportId)?.project_id ?? null}
                  config={COMPLEMENTARY_MATRIX_CONFIG}
                  pushCommand={pushCommand}
                  onSaveStateChange={handleChildSaveStateChange}
                  onError={setError}
                  fillHeight={fillHeight}
                />
              </div>
            )}

            {visitedRef.current.has("testimonials") && reportId && (
              <div hidden={params.section !== "testimonials"}>
                <TestimonialsSection reportId={reportId} readOnly={readOnly} onSaveStateChange={handleChildSaveStateChange} pushCommand={pushCommand} />
              </div>
            )}

            {Object.keys(sectionSpecs).map((sectionKey) =>
              visitedRef.current.has(sectionKey) && reportId ? (
                <div key={sectionKey} hidden={params.section !== sectionKey}>
                  <SectionTableEditor
                    reportId={reportId}
                    spec={sectionSpecs[sectionKey]}
                    onSaveStateChange={handleChildSaveStateChange}
                    commentSection={sectionKey}
                    pushCommand={pushCommand}
                  />
                </div>
              ) : null
            )}

            {visitedRef.current.has("workplan") && reportId && selectedReport && (
              <div hidden={params.section !== "workplan"} className={cn(fillHeight && "flex flex-col flex-1 min-h-0")}>
                <WorkplanPartnerEditor
                  reportId={reportId}
                  onSaveStateChange={handleChildSaveStateChange}
                  fillHeight
                  readOnly={readOnly}
                  pushCommand={pushCommand}
                />
              </div>
            )}

            {visitedRef.current.has("expenditure") && reportId && (
              <div hidden={params.section !== "expenditure"} className={cn(fillHeight && "flex flex-col flex-1 min-h-0")}>
                <ExpenditurePartnerEditor
                  reportId={reportId}
                  onSaveStateChange={handleChildSaveStateChange}
                  fillHeight={fillHeight}
                />
              </div>
            )}

            {/* Fallback for unknown sections */}
            {params.section && !REPORT_SECTIONS.find((s) => s.value === params.section) && !(params.section in sectionSpecs) && (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                <FileQuestion className="size-8 opacity-30" />
                <p className="text-sm">Section not found.</p>
              </div>
            )}
          </>
        )}
        </div>
        </fieldset>
        </ReadOnlyProvider>

        {reportId && !notFound && !loadingReports && (
          <div className={cn("flex justify-between", fillHeight ? "pt-4 shrink-0" : "mt-8")}>
            {prevSection ? (
              <Button variant="outline" onClick={() => handleSectionChange(prevSection.value)}>
                <ChevronLeft className="size-4" /> Back: {prevSection.label}
              </Button>
            ) : <div />}
            {nextSection ? (
              <Button variant="outline" onClick={() => handleSectionChange(nextSection.value)}>
                Next: {nextSection.label}
                <ChevronRight className="size-4" />
              </Button>
            ) : canSubmit ? (
              <div className="flex flex-col items-end gap-2">
                <Button onClick={handleSubmit} disabled={submitLoading || submitBlockers.length > 0}>
                  {submitLoading && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                  Submit
                </Button>
                {(submitBlockers.length > 0 || submitError) && (
                  <p className="text-xs text-amber-700 max-w-[420px] text-right leading-snug">
                    {submitError ?? submitBlockers.join(" ")}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>

    <StatusChangeDialog
      open={pendingStatus !== null}
      fromStatus={selectedReport?.status ?? ""}
      toStatus={pendingStatus ?? ""}
      onCancel={() => setPendingStatus(null)}
      onConfirm={applyStatusChange}
    />
    </CommentsProvider>
  );
}
