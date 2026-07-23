"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Loader2, FileQuestion, Undo2, Redo2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";
import { WorkplanPartnerEditor } from "@/components/workplan-grid";
import { SectionTableEditor, SECTION_SPECS } from "@/components/section-table-editor";
import { ExpenditurePartnerEditor } from "@/components/expenditure-grid";
import { useAutosave, AutosaveIndicator, type SaveState } from "@/components/autosave";
import { REPORT_SECTION_GROUPS } from "@/lib/report-sections";
import { CommentsProvider } from "@/components/report-editor/comments-context";
import { reportStatusStyle } from "@/lib/reports";
import type { Report } from "@/lib/types";
import { ContributorMatrix, TRANSFERS_MATRIX_CONFIG, COMPLEMENTARY_MATRIX_CONFIG } from "@/components/report-editor/contributor-matrix";
import {
  EMPTY_OVERVIEW,
  type Survey,
  type RowState,
  type OverviewData,
  type Risk,
  type RiskState,
  type IndicatorMatrixRow,
  type IndicatorState,
  type HistoryCommand,
} from "@/components/report-editor/types";
import { OverviewSection } from "@/components/report-editor/sections/overview-section";
import { SurveysSection } from "@/components/report-editor/sections/surveys-section";
import { RiskSection } from "@/components/report-editor/sections/risk-section";
import { IndicatorsSection } from "@/components/report-editor/sections/indicators-section";
import { TestimonialsSection } from "@/components/report-editor/sections/testimonials-section";

function toSlug(r: Report): string {
  return (r.project_short_name ?? r.project_title).toLowerCase().replace(/\s+/g, "-");
}

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
  const [collapsedRows, setCollapsedRows] = useState<Record<number, boolean>>({});
  const [loadingRisk, setLoadingRisk] = useState(false);

  // Risk CRUD (admin-parity): add / edit core fields / delete, all report-scoped.
  const [newRiskName, setNewRiskName] = useState("");
  const [newRiskCategory, setNewRiskCategory] = useState("");
  const [newRiskApprovedMitigation, setNewRiskApprovedMitigation] = useState("");
  const [addingRisk, setAddingRisk] = useState(false);
  const [deletingRiskId, setDeletingRiskId] = useState<number | null>(null);
  const [editingRiskId, setEditingRiskId] = useState<number | null>(null);
  const [editingRiskName, setEditingRiskName] = useState("");
  const [editingRiskCategory, setEditingRiskCategory] = useState("");
  const [editingRiskApprovedMitigation, setEditingRiskApprovedMitigation] = useState("");

  const [indicatorRows, setIndicatorRows] = useState<IndicatorMatrixRow[]>([]);
  const [indicatorYears, setIndicatorYears] = useState<number[]>([]);
  const [indicatorCurrentYear, setIndicatorCurrentYear] = useState<number | null>(null);
  const [indicatorStates, setIndicatorStates] = useState<Record<number, IndicatorState>>({});
  const [loadingIndicators, setLoadingIndicators] = useState(false);

  // Custom indicators: partners may define their own (project-scoped) indicators.
  const [newIndicatorName, setNewIndicatorName] = useState("");
  const [newIndicatorBaselineValue, setNewIndicatorBaselineValue] = useState("");
  const [newIndicatorBaselineYear, setNewIndicatorBaselineYear] = useState("");
  const [newIndicatorTargetValue, setNewIndicatorTargetValue] = useState("");
  const [newIndicatorTargetYear, setNewIndicatorTargetYear] = useState("");
  const [addingIndicator, setAddingIndicator] = useState(false);

  // Undo / redo over the parent-managed section edits. History is per section
  // visit (reset below when the section or report changes).
  const [undoStack, setUndoStack] = useState<HistoryCommand[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryCommand[]>([]);

  // Every section autosaves. The child editors (list sections, expenditure,
  // workplan) report their save state up via onSaveStateChange; the parent-managed
  // sections (surveys, overview, risk, indicators) drive the autosave hook below.
  const [childSaveState, setChildSaveState] = useState<SaveState>("idle");

  const [error, setError] = useState<string | null>(null);

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
          implementing_partners: data.implementing_partners ?? "",
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
          likelihood: r.likelihood,
          impact: r.impact,
          approved_mitigation: r.approved_mitigation ?? "",
          updated_mitigation: r.updated_mitigation ?? "",
          project_revision: r.project_revision,
          dirty: false,
        };
      }
      setRiskStates(states);
      const collapsed: Record<number, boolean> = {};
      for (const r of data) collapsed[r.id] = true;
      setCollapsedRows(collapsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingRisk(false);
    }
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

  // Load reports once per project/year
  useEffect(() => {
    if (!user) return;
    setLoadingReports(true);
    setReportId(null);
    fetch("/api/reports?data_type=report")
      .then((r) => r.json())
      .then((all: Report[]) => {
        const list = Array.isArray(all) ? all : [];
        // Admins see every report; partners only their own organization's.
        const filtered = mode === "admin"
          ? list
          : list.filter(
              (r) =>
                r.partner_short_name.toLowerCase() === user.id.toLowerCase() ||
                r.partner_short_name === user.organization
            );
        setReports(filtered);
        const match = filtered.find(
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
            implementing_partners: "",
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

  // Load section data when reportId or section changes
  useEffect(() => {
    if (!reportId) return;
    setChildSaveState("idle");
    if (params.section === "surveys") loadSurveys(reportId);
    else if (params.section === "overview") loadOverview(reportId);
    else if (params.section === "risk") loadRisk(reportId);
    else if (params.section === "indicators") loadIndicators(reportId);
    // Config-driven list sections + the transfer/complementary matrices load their
    // own data inside <SectionTableEditor> / <ContributorMatrix>.
  }, [reportId, params.section, loadSurveys, loadOverview, loadRisk, loadIndicators]);

  function handleReportChange(val: string) {
    const report = reports.find((r) => String(r.id) === val);
    if (!report) return;
    // Preserve the current section when switching reports, but default to
    // overview when there is no section yet (e.g. opening from the landing page).
    router.push(`${basePath}/${toSlug(report)}/${report.year}/${params.section ?? "overview"}`);
  }

  function handleSectionChange(section: string) {
    if (!selectedReport) return;
    router.push(`${basePath}/${toSlug(selectedReport)}/${selectedReport.year}/${section}`);
  }

  // Change the report's status from the top bar (admin only). Optimistic; the
  // readOnly gate recomputes from the updated local state immediately.
  async function handleReportStatusChange(newStatus: Report["status"]) {
    if (!selectedReport) return;
    const id = selectedReport.id;
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
    await fetch(`/api/reports/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
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
    const riskSnap = new Map(dirtyRisks.map((r) => [r.id, JSON.stringify({ l: riskStates[r.id].likelihood, i: riskStates[r.id].impact, m: riskStates[r.id].updated_mitigation, p: riskStates[r.id].project_revision })]));
    const dirtyInd = indicatorRows.filter((r) => indicatorStates[r.currentLineId]?.dirty);
    const indSnap = new Map(dirtyInd.map((r) => [r.currentLineId, JSON.stringify({ v: indicatorStates[r.currentLineId].achieved_value, s: indicatorStates[r.currentLineId].status, c: indicatorStates[r.currentLineId].comment })]));
    const saveOverview = overviewDirty;
    const overviewSnap = JSON.stringify(overview);

    const ok = (r: Response) => { if (!r.ok) throw new Error(labels.common.saveFailed); };
    try {
      await Promise.all([
        ...dirtySurveys.map((s) => {
          const st = rowStates[s.id];
          return fetch("/api/surveys", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, assessment: st.assessment, context: st.context || null }) }).then(ok);
        }),
        ...dirtyRisks.map((r) => {
          const st = riskStates[r.id];
          return fetch("/api/risk", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, likelihood: st.likelihood, impact: st.impact, updated_mitigation: st.updated_mitigation || null, project_revision: st.project_revision }) }).then(ok);
        }),
        ...dirtyInd.map((r) => {
          const st = indicatorStates[r.currentLineId];
          return fetch("/api/indicator-data", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.currentLineId, achieved_value: st.achieved_value || null, status: st.status, comment: st.comment || null }) }).then(ok);
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
      for (const r of dirtyRisks) { const cur = prev[r.id]; if (cur && JSON.stringify({ l: cur.likelihood, i: cur.impact, m: cur.updated_mitigation, p: cur.project_revision }) === riskSnap.get(r.id)) n[r.id] = { ...cur, dirty: false }; }
      return n;
    });
    if (dirtyInd.length) setIndicatorStates((prev) => {
      const n = { ...prev };
      for (const r of dirtyInd) { const cur = prev[r.currentLineId]; if (cur && JSON.stringify({ v: cur.achieved_value, s: cur.status, c: cur.comment }) === indSnap.get(r.currentLineId)) n[r.currentLineId] = { ...cur, dirty: false }; }
      return n;
    });
    if (saveOverview && JSON.stringify(overviewRef.current) === overviewSnap) setOverviewDirty(false);
  };

  const parentAutosave = useAutosave(flushParent);

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

  function toggleCollapse(id: number) {
    setCollapsedRows((prev) => ({ ...prev, [id]: !prev[id] }));
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
          risk_category: newRiskCategory,
          approved_mitigation: newRiskApprovedMitigation || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to add risk");
      const created: Risk = await res.json();
      setRisks((prev) => [...prev, created]);
      setRiskStates((prev) => ({
        ...prev,
        [created.id]: {
          likelihood: created.likelihood,
          impact: created.impact,
          approved_mitigation: created.approved_mitigation ?? "",
          updated_mitigation: created.updated_mitigation ?? "",
          project_revision: created.project_revision,
          dirty: false,
        },
      }));
      setCollapsedRows((prev) => ({ ...prev, [created.id]: true }));
      setNewRiskName("");
      setNewRiskCategory("");
      setNewRiskApprovedMitigation("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAddingRisk(false);
    }
  }

  function startRiskEdit(risk: Risk) {
    setEditingRiskId(risk.id);
    setEditingRiskName(risk.risk_name);
    setEditingRiskCategory(risk.risk_category?.join(", ") ?? "");
    setEditingRiskApprovedMitigation(risk.approved_mitigation ?? "");
  }

  function cancelRiskEdit() {
    setEditingRiskId(null);
    setEditingRiskName("");
    setEditingRiskCategory("");
    setEditingRiskApprovedMitigation("");
  }

  async function handleRiskEditSave(id: number) {
    if (!editingRiskName.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/risk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          risk_name: editingRiskName,
          risk_category: editingRiskCategory,
          approved_mitigation: editingRiskApprovedMitigation || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update risk");
      const updated: Risk = await res.json();
      setRisks((prev) => prev.map((r) => (r.id === id ? updated : r)));
      cancelRiskEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleRiskDelete(id: number) {
    const risk = risks.find((r) => r.id === id);
    const state = riskStates[id];
    if (!risk) return;
    const hasContent = risk.risk_name?.trim() || state?.likelihood != null || state?.impact != null || state?.updated_mitigation?.trim();
    if (hasContent && !await confirm({ message: `Delete risk "${risk.risk_name}"? You can undo this with the Undo button.`, confirmLabel: "Delete" })) return;
    setDeletingRiskId(id);
    setError(null);
    try {
      const res = await fetch(`/api/risk?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete risk");
      setRisks((prev) => prev.filter((r) => r.id !== id));
      setRiskStates((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      // Undoable: recreate the risk (with a fresh id) on undo, delete again on redo.
      let currentId = id;
      pushCommand({
        undo: async () => {
          try {
            const cRes = await fetch("/api/risk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reportId,
                risk_name: risk.risk_name,
                risk_category: (risk.risk_category ?? []).join(", "),
                approved_mitigation: risk.approved_mitigation ?? null,
              }),
            });
            if (!cRes.ok) throw new Error("Failed to restore risk");
            const created: Risk = await cRes.json();
            currentId = created.id;
            await fetch("/api/risk", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: created.id,
                likelihood: state?.likelihood ?? null,
                impact: state?.impact ?? null,
                updated_mitigation: state?.updated_mitigation || null,
                project_revision: state?.project_revision ?? false,
              }),
            });
            setRisks((prev) => [...prev, {
              ...risk,
              id: created.id,
              likelihood: state?.likelihood ?? null,
              impact: state?.impact ?? null,
              updated_mitigation: state?.updated_mitigation ?? null,
              project_revision: state?.project_revision ?? false,
            }]);
            setRiskStates((prev) => ({
              ...prev,
              [created.id]: {
                likelihood: state?.likelihood ?? null,
                impact: state?.impact ?? null,
                approved_mitigation: risk.approved_mitigation ?? "",
                updated_mitigation: state?.updated_mitigation ?? "",
                project_revision: state?.project_revision ?? false,
                dirty: false,
              },
            }));
            setCollapsedRows((prev) => ({ ...prev, [created.id]: true }));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to restore risk");
          }
        },
        redo: async () => {
          const delId = currentId;
          try {
            const r = await fetch(`/api/risk?id=${delId}`, { method: "DELETE" });
            if (!r.ok) throw new Error("Failed to delete risk");
            setRisks((prev) => prev.filter((x) => x.id !== delId));
            setRiskStates((prev) => {
              const next = { ...prev };
              delete next[delId];
              return next;
            });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete risk");
          }
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDeletingRiskId(null);
    }
  }

  function updateIndicator(id: number, patch: Partial<IndicatorState>) {
    pushMapEdit(setIndicatorStates, indicatorStates, id, patch, { dirty: true });
  }

  // Create a partner-defined custom indicator (project-scoped) and attach it to
  // this report. Partners cannot pick from the standard library — only add their own.
  async function handleIndicatorAdd() {
    const projectId = reports.find((r) => r.id === reportId)?.project_id;
    if (!newIndicatorName.trim() || !reportId || !projectId) return;
    setAddingIndicator(true);
    setError(null);
    try {
      // 1. Create the custom indicator scoped to this project.
      const indRes = await fetch("/api/indicators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newIndicatorName.trim(), is_standard: false, project_id: projectId }),
      });
      if (!indRes.ok) throw new Error("Failed to create indicator");
      const indicator = await indRes.json();

      // 2. Add it as a line on this report (partner supplies baseline/target).
      const lineRes = await fetch("/api/indicator-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          indicator_id: indicator.id,
          baseline_value: newIndicatorBaselineValue || null,
          baseline_year: newIndicatorBaselineYear || null,
          target_value: newIndicatorTargetValue || null,
          target_year: newIndicatorTargetYear || null,
        }),
      });
      if (!lineRes.ok) throw new Error("Failed to add indicator to report");

      setNewIndicatorName("");
      setNewIndicatorBaselineValue("");
      setNewIndicatorBaselineYear("");
      setNewIndicatorTargetValue("");
      setNewIndicatorTargetYear("");
      await loadIndicators(reportId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAddingIndicator(false);
    }
  }

  // ── Undo / redo (command stack) ────────────────────────────────────────────
  function pushCommand(cmd: HistoryCommand) {
    setUndoStack((s) => [...s, cmd].slice(-100));
    setRedoStack([]);
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

  function undo() {
    if (!undoStack.length) return;
    const cmd = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r, cmd]);
    cmd.undo();
    parentAutosave.schedule();
  }

  function redo() {
    if (!redoStack.length) return;
    const cmd = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((s) => [...s, cmd]);
    cmd.redo();
    parentAutosave.schedule();
  }

  // History is scoped to the current section visit — reset it when the section
  // or report changes.
  useEffect(() => { setUndoStack([]); setRedoStack([]); }, [reportId, params.section]);

  // Keyboard shortcuts: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo.
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  useEffect(() => { undoRef.current = undo; redoRef.current = redo; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); if (e.shiftKey) redoRef.current(); else undoRef.current(); }
      else if (k === "y") { e.preventDefault(); redoRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectedReport = reports.find(
    (r) => toSlug(r) === params.project && String(r.year) === params.year
  );
  // Status → who can edit:
  //   Open          → admin + partner
  //   Under Review  → admin only (partner is read-only)
  //   Closed        → no one
  // (forceReadOnly still wins as an explicit override.)
  const readOnly =
    forceReadOnly ||
    (!!selectedReport &&
      (selectedReport.status === "Closed" ||
        (selectedReport.status === "Under Review" && mode !== "admin")));
  const sectionLoading =
    params.section === "surveys" ? loadingSurveys :
    params.section === "overview" ? loadingOverview :
    params.section === "risk" ? loadingRisk :
    params.section === "indicators" ? loadingIndicators : false;
  const notFound = !loadingReports && !selectedReport;

  // The parent-managed sections drive `parentAutosave`; the rest report up via
  // `childSaveState`. The top-bar indicator shows whichever owns the active tab.
  const parentManaged = ["surveys", "overview", "risk", "indicators"].includes(params.section);
  const displaySaveState = parentManaged ? parentAutosave.state : childSaveState;

  return (
    <CommentsProvider reportId={reportId} enabled={reportId != null} readOnly={mode !== "admin"}>
    <div className="flex flex-col h-full bg-background">

      {/* Top bar */}
      <div className="bg-neutral-950 text-white px-8 h-32 flex items-center justify-between shrink-0">
        <div>
          <p className="text-neutral-400 text-sm mb-1">{labels.partnerEditor.title}</p>
          {selectedReport ? (
            <>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold font-qanelas capitalize">
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
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="Under Review">Under Review</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
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
              <p className="text-neutral-400 text-sm mt-0.5">{selectedReport.project_title}</p>
            </>
          ) : (
            <h1 className="text-2xl font-bold font-qanelas">{labels.partnerEditor.title}</h1>
          )}
        </div>

        <div className="flex items-center gap-3">
          {reportId && !sectionLoading && !notFound && (
            <AutosaveIndicator tone="dark" idleAsSaved state={displaySaveState} />
          )}

          <Select
            value={selectedReport ? String(selectedReport.id) : ""}
            onValueChange={handleReportChange}
            disabled={loadingReports}
          >
            <SelectTrigger className="w-[300px] h-9 bg-neutral-900 border-neutral-700 text-white">
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
                    const key = `${r.partner_short_name} · ${r.project_short_name || r.project_title}`;
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

          {reportId && !sectionLoading && !notFound && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={undo}
                disabled={undoStack.length === 0}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                className="p-1.5 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Undo2 className="size-4" />
              </button>
              <button
                onClick={redo}
                disabled={redoStack.length === 0}
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
                className="p-1.5 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Redo2 className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section tabs — shown in the admin mirror (the partner nav uses the sidebar). */}
      {showSectionTabs && selectedReport && (
        <div className="border-b px-8 flex flex-wrap gap-1 shrink-0">
          {REPORT_SECTION_GROUPS.flatMap((g) => g.sections).map((s) => (
            <button
              key={s.value}
              onClick={() => handleSectionChange(s.value)}
              className={cn(
                "px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                params.section === s.value
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Content — the workplan fills the leftover height and scrolls inside its
          own box (single scroller, frozen header); every other tab scrolls here. */}
      <div className={cn("flex-1 px-8 py-6", params.section === "workplan" ? "flex flex-col min-h-0 overflow-hidden" : "overflow-auto")}>
        {/* Tab instructions — only while the report is editable */}
        {params.section !== "overview" && params.section !== "testimonials" && !sectionLoading && !notFound && !readOnly && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {labels.tabInstructions[params.section as keyof typeof labels.tabInstructions] || ""}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {readOnly && !sectionLoading && !notFound && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Lock className="size-4 shrink-0" />
            <span>
              This report is <b>{selectedReport?.status}</b> and is view-only. Contact the CRAF'd Secretariat if changes are needed.
            </span>
          </div>
        )}

        {/* Disabled fieldset makes the entire section view-only when the report
            is not Open — natively disables every input, select and button inside,
            including the child editors, while keeping scrolling and text selection. */}
        <fieldset disabled={readOnly} className={cn("min-w-0 border-0 p-0 m-0", params.section === "workplan" && "flex-1 min-h-0 flex flex-col")}>
        {notFound ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <FileQuestion className="size-10 opacity-30" />
            <p className="text-sm">{params.project ? labels.partnerEditor.notFound : "Select a report above to view it."}</p>
          </div>
        ) : loadingReports || sectionLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
          </div>

        ) : params.section === "surveys" ? (
          <SurveysSection surveys={surveys} rowStates={rowStates} updateRow={updateRow} />

        ) : params.section === "overview" ? (
          <OverviewSection overview={overview} updateOverview={updateOverview} />

        ) : params.section === "risk" ? (
          <RiskSection
            risks={risks}
            riskStates={riskStates}
            collapsedRows={collapsedRows}
            newRiskName={newRiskName}
            setNewRiskName={setNewRiskName}
            newRiskCategory={newRiskCategory}
            setNewRiskCategory={setNewRiskCategory}
            newRiskApprovedMitigation={newRiskApprovedMitigation}
            setNewRiskApprovedMitigation={setNewRiskApprovedMitigation}
            addingRisk={addingRisk}
            handleRiskAdd={handleRiskAdd}
            editingRiskId={editingRiskId}
            editingRiskName={editingRiskName}
            setEditingRiskName={setEditingRiskName}
            editingRiskCategory={editingRiskCategory}
            setEditingRiskCategory={setEditingRiskCategory}
            editingRiskApprovedMitigation={editingRiskApprovedMitigation}
            setEditingRiskApprovedMitigation={setEditingRiskApprovedMitigation}
            startRiskEdit={startRiskEdit}
            cancelRiskEdit={cancelRiskEdit}
            handleRiskEditSave={handleRiskEditSave}
            deletingRiskId={deletingRiskId}
            handleRiskDelete={handleRiskDelete}
            updateRisk={updateRisk}
            toggleCollapse={toggleCollapse}
          />

        ) : params.section === "indicators" ? (
          <IndicatorsSection
            indicatorRows={indicatorRows}
            indicatorYears={indicatorYears}
            indicatorCurrentYear={indicatorCurrentYear}
            indicatorStates={indicatorStates}
            newIndicatorName={newIndicatorName}
            setNewIndicatorName={setNewIndicatorName}
            newIndicatorBaselineValue={newIndicatorBaselineValue}
            setNewIndicatorBaselineValue={setNewIndicatorBaselineValue}
            newIndicatorBaselineYear={newIndicatorBaselineYear}
            setNewIndicatorBaselineYear={setNewIndicatorBaselineYear}
            newIndicatorTargetValue={newIndicatorTargetValue}
            setNewIndicatorTargetValue={setNewIndicatorTargetValue}
            newIndicatorTargetYear={newIndicatorTargetYear}
            setNewIndicatorTargetYear={setNewIndicatorTargetYear}
            addingIndicator={addingIndicator}
            handleIndicatorAdd={handleIndicatorAdd}
            updateIndicator={updateIndicator}
          />

        ) : params.section === "transfers" ? (
          reportId ? (
            <ContributorMatrix
              key="transfers"
              reportId={reportId}
              projectId={reports.find((r) => r.id === reportId)?.project_id ?? null}
              config={TRANSFERS_MATRIX_CONFIG}
              pushCommand={pushCommand}
              onSaveStateChange={setChildSaveState}
              onError={setError}
            />
          ) : null

        ) : params.section === "complementary" ? (
          reportId ? (
            <ContributorMatrix
              key="complementary"
              reportId={reportId}
              projectId={reports.find((r) => r.id === reportId)?.project_id ?? null}
              config={COMPLEMENTARY_MATRIX_CONFIG}
              pushCommand={pushCommand}
              onSaveStateChange={setChildSaveState}
              onError={setError}
            />
          ) : null

        ) : params.section === "testimonials" ? (
          reportId ? (
            <TestimonialsSection reportId={reportId} readOnly={readOnly} onSaveStateChange={setChildSaveState} />
          ) : null

        ) : params.section in SECTION_SPECS ? (
          reportId ? (
            <SectionTableEditor
              key={params.section}
              reportId={reportId}
              spec={SECTION_SPECS[params.section]}
              onSaveStateChange={setChildSaveState}
              commentSection={params.section}
            />
          ) : null

        ) : params.section === "workplan" ? (
          reportId && selectedReport ? (
            <WorkplanPartnerEditor
              reportId={reportId}
              onSaveStateChange={setChildSaveState}
              fillHeight
            />
          ) : null

        ) : params.section === "expenditure" ? (
          reportId ? (
            <ExpenditurePartnerEditor
              reportId={reportId}
              onSaveStateChange={setChildSaveState}
            />
          ) : null

        ) : (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <FileQuestion className="size-8 opacity-30" />
            <p className="text-sm">Section not found.</p>
          </div>
        )}
        </fieldset>
      </div>
    </div>
    </CommentsProvider>
  );
}
