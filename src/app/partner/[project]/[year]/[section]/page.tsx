"use client";

export const dynamic = "force-dynamic";

import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, FileQuestion, ShieldCheck, ChevronRight, ChevronDown, Plus, Trash2, Pencil, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";
import { WorkplanAdminEditor } from "@/components/workplan-grid";
import { SectionTableEditor, SECTION_SPECS } from "@/components/section-table-editor";
import { ExpenditurePartnerEditor } from "@/components/expenditure-grid";
import { useAutosave, AutosaveIndicator, type SaveState } from "@/components/autosave";
import {
  likelihoodLabel,
  impactLabel,
  riskLevelLabel,
  computeRiskLevelKey,
  SCALE_COLORS,
  RISK_LEVEL_COLORS,
  FALLBACK_COLORS,
} from "@/lib/risk";
import { STATUS_KEYS, statusLabel, cycleLabel, STATUS_COLORS, type IndicatorStatus } from "@/lib/indicators";
import { PARTNER_TYPES, activityLabel, formatAmount } from "@/lib/transfers";
import { FUNDING_TYPES, FUNDING_TYPE_COLORS } from "@/lib/complementary";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";


const ASSESSMENT_CONFIG: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300"    },
  2: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-300" },
  3: { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-300"  },
  4: { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-300"   },
  5: { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-300"  },
};

const AUTHORIZATION_MESSAGES = labels.authorization.messages;

// Shared coloured word-badge used by the assessment + risk cells.
function Badge({ colors, children }: { colors: { bg: string; text: string; border: string }; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", colors.bg, colors.text, colors.border)}>
      {children}
    </span>
  );
}

function AssessmentBadge({ value }: { value: number }) {
  return <Badge colors={ASSESSMENT_CONFIG[value] ?? FALLBACK_COLORS}>{value}</Badge>;
}

function LikelihoodBadge({ value }: { value: number }) {
  return <Badge colors={SCALE_COLORS[value] ?? FALLBACK_COLORS}>{likelihoodLabel(value)}</Badge>;
}

function ImpactBadge({ value }: { value: number }) {
  return <Badge colors={SCALE_COLORS[value] ?? FALLBACK_COLORS}>{impactLabel(value)}</Badge>;
}

function RiskLevelBadge({ likelihood, impact }: { likelihood: number | null; impact: number | null }) {
  const key = computeRiskLevelKey(likelihood, impact);
  if (!key) return <span className="text-muted-foreground text-sm">—</span>;
  return <Badge colors={RISK_LEVEL_COLORS[key]}>{riskLevelLabel(key)}</Badge>;
}

function StatusBadge({ value }: { value: IndicatorStatus }) {
  return <Badge colors={STATUS_COLORS[value] ?? FALLBACK_COLORS}>{statusLabel(value)}</Badge>;
}

function Label({ children }: { children: string }) {
  return <p className="text-xs text-muted-foreground mb-1.5">{children}</p>;
}

// Frozen left columns for the indicator matrix (name + baseline + target stay put
// while the per-year columns scroll horizontally — mirrors the expenditure grid).
const ICOL = {
  ind:      { left: 0,   w: 300 },
  baseline: { left: 300, w: 120 },
  target:   { left: 420, w: 120 },
} as const;
const IND_FROZEN_WIDTH = 540;

function ifz(key: keyof typeof ICOL, z = 20): CSSProperties {
  const c = ICOL[key];
  return { position: "sticky", left: c.left, width: c.w, minWidth: c.w, maxWidth: c.w, zIndex: z };
}

// Frozen left columns for the transfers matrix (org identity stays put while the
// per-year amount/linked-activity columns scroll horizontally).
const TCOL = {
  org:     { left: 0,   w: 220 },
  website: { left: 220, w: 170 },
  type:    { left: 390, w: 170 },
} as const;
const TRANSFER_FROZEN_WIDTH = 560;

function tfz(key: keyof typeof TCOL, z = 20): CSSProperties {
  const c = TCOL[key];
  return { position: "sticky", left: c.left, width: c.w, minWidth: c.w, maxWidth: c.w, zIndex: z };
}

// "value (year)" for the baseline / target reference cells.
function ValueYear({ value, year }: { value: string | null; year: number | null }) {
  if (!value) return <span className="text-muted-foreground/40">—</span>;
  return <>{value}{year ? <span className="text-muted-foreground"> ({year})</span> : null}</>;
}

interface Report {
  id: number;
  project_id: number;
  year: number;
  report_type: "annual" | "final" | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
  report_submission_date: string | null;
  mptfo_project_number: string | null;
  grant_size_usd: string | null;
  geographic_scope: string | null;
  project_start_date: string | null;
  project_end_date: string | null;
  organization_website: string | null;
}

interface Survey {
  id: number;
  reportid: number;
  question: string;
  assessment: number | null;
  context: string | null;
}

interface RowState {
  assessment: number | null;
  context: string;
  dirty: boolean;
}

interface OverviewData {
  project_title: string;
  mptfo_project_number: string;
  organization_name: string;
  organization_website: string;
  grant_size_usd: string;
  implementing_partners: string;
  geographic_scope: string;
  report_submission_date: string;
  project_start_date: string;
  project_end_date: string;
  project_lead: string;
  authorized: boolean;
}

interface Risk {
  id: number;
  report_id: number;
  risk_name: string;
  risk_category: string[] | null;
  likelihood: number | null;
  impact: number | null;
  approved_mitigation: string | null;
  updated_mitigation: string | null;
  project_revision: boolean;
}

interface RiskState {
  likelihood: number | null;
  impact: number | null;
  approved_mitigation: string;
  updated_mitigation: string;
  project_revision: boolean;
  dirty: boolean;
}

interface IndicatorYearCell {
  id: number;
  report_id: number;
  achieved_value: string | null;
  status: string | null;
  comment: string | null;
}

interface IndicatorMatrixRow {
  indicator_id: number;
  indicator_name: string;
  indicator_description: string | null;
  means_of_verification: string | null;
  category: string | null;
  cycle: string | null;
  baseline_value: string | null;
  baseline_year: number | null;
  target_value: string | null;
  target_year: number | null;
  currentLineId: number;
  byYear: Record<number, IndicatorYearCell | undefined>;
}

interface IndicatorState {
  achieved_value: string;
  status: string | null;
  comment: string;
  dirty: boolean;
}

interface TransferActivity {
  id: number;
  activity_num: string | null;
  activity_text: string | null;
  objective_num: string | null;
  objective_text: string | null;
  sort_order: number;
}

interface TransferYearCell {
  id: number;
  report_id: number;
  amount_transferred: string | null;
  linked_activity_id: number | null;
}

interface TransferMatrixRow {
  transfer_partner_id: number;
  organization_name: string | null;
  website: string | null;
  partner_type: string | null;
  currentLineId: number;
  byYear: Record<number, TransferYearCell | undefined>;
}

// Org identity (name/website/type) is master-level and editable anytime; the
// amount + linked activity are per-year and only editable for the current report.
interface TransferState {
  organization_name: string;
  website: string;
  partner_type: string | null;
  amount_transferred: string;
  linked_activity_id: number | null;
  masterDirty: boolean;
  cellDirty: boolean;
}

interface ComplementaryYearCell {
  id: number;
  report_id: number;
  contribution_amount: string | null;
  linked_activity_ids: number[];
}

interface ComplementaryMatrixRow {
  contributor_id: number;
  contributor_name: string | null;
  website: string | null;
  funding_type: string | null;
  currentLineId: number;
  byYear: Record<number, ComplementaryYearCell | undefined>;
}

// Same split as transfers: identity (name/website/funding type) is master-level;
// the amount + linked activities are per-year, only editable for the current report.
interface ComplementaryState {
  contributor_name: string;
  website: string;
  funding_type: string | null;
  contribution_amount: string;
  linked_activity_ids: number[];
  masterDirty: boolean;
  cellDirty: boolean;
}


const EMPTY_OVERVIEW: OverviewData = {
  project_title: "",
  mptfo_project_number: "",
  organization_name: "",
  organization_website: "",
  grant_size_usd: "",
  implementing_partners: "",
  geographic_scope: "",
  report_submission_date: "",
  project_start_date: "",
  project_end_date: "",
  project_lead: "",
  authorized: false,
};

function toSlug(r: Report): string {
  return (r.project_short_name ?? r.project_title).toLowerCase();
}

// Undo/redo is command-based: each edit (and each row delete) pushes a command
// that knows how to reverse and replay itself. Delete commands re-create the row
// on the server, so an undone deletion is fully restored (not just re-typed).
interface HistoryCommand {
  undo: () => void;
  redo: () => void;
}

// Duration is derived (in whole months) from the project start/end dates.
function durationMonthsLabel(start: string, end: string): string {
  if (!start || !end) return "—";
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "—";
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return months > 0 ? `${months} months` : "—";
}

export default function PartnerReportEditorPage() {
  const { user } = useAuth();
  const params = useParams<{ project: string; year: string; section: string }>();
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

  const [transferRows, setTransferRows] = useState<TransferMatrixRow[]>([]);
  const [transferYears, setTransferYears] = useState<number[]>([]);
  const [transferCurrentYear, setTransferCurrentYear] = useState<number | null>(null);
  const [transferActivities, setTransferActivities] = useState<TransferActivity[]>([]);
  const [transferStates, setTransferStates] = useState<Record<number, TransferState>>({});
  const [loadingTransfers, setLoadingTransfers] = useState(false);

  // Add a transfer: partners create the receiving organisation (project-scoped)
  // and it is attached to the current report as a line.
  const [newTransferName, setNewTransferName] = useState("");
  const [newTransferWebsite, setNewTransferWebsite] = useState("");
  const [newTransferType, setNewTransferType] = useState("");
  const [addingTransfer, setAddingTransfer] = useState(false);
  const [deletingTransferId, setDeletingTransferId] = useState<number | null>(null);

  const [complementaryRows, setComplementaryRows] = useState<ComplementaryMatrixRow[]>([]);
  const [complementaryYears, setComplementaryYears] = useState<number[]>([]);
  const [complementaryCurrentYear, setComplementaryCurrentYear] = useState<number | null>(null);
  const [complementaryActivities, setComplementaryActivities] = useState<TransferActivity[]>([]);
  const [complementaryStates, setComplementaryStates] = useState<Record<number, ComplementaryState>>({});
  const [loadingComplementary, setLoadingComplementary] = useState(false);

  const [newComplementaryName, setNewComplementaryName] = useState("");
  const [newComplementaryWebsite, setNewComplementaryWebsite] = useState("");
  const [newComplementaryType, setNewComplementaryType] = useState("");
  const [addingComplementary, setAddingComplementary] = useState(false);
  const [deletingComplementaryId, setDeletingComplementaryId] = useState<number | null>(null);

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
          project_end_date: data.project_end_date?.slice(0, 10) ?? "",
          project_lead: data.project_lead ?? "",
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

  const loadTransfers = useCallback(async (id: number) => {
    setLoadingTransfers(true);
    setError(null);
    try {
      const res = await fetch(`/api/transfer-data?reportId=${id}&matrix=1`);
      if (!res.ok) throw new Error("Failed to load transfers");
      const data: { years: number[]; currentYear: number | null; rows: TransferMatrixRow[]; activities: TransferActivity[] } = await res.json();
      setTransferRows(data.rows);
      setTransferYears(data.years);
      setTransferCurrentYear(data.currentYear);
      setTransferActivities(data.activities);
      const states: Record<number, TransferState> = {};
      for (const row of data.rows) {
        const cell = data.currentYear != null ? row.byYear[data.currentYear] : undefined;
        states[row.transfer_partner_id] = {
          organization_name: row.organization_name ?? "",
          website: row.website ?? "",
          partner_type: row.partner_type ?? null,
          amount_transferred: cell?.amount_transferred != null ? String(cell.amount_transferred) : "",
          linked_activity_id: cell?.linked_activity_id ?? null,
          masterDirty: false,
          cellDirty: false,
        };
      }
      setTransferStates(states);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingTransfers(false);
    }
  }, []);

  const loadComplementary = useCallback(async (id: number) => {
    setLoadingComplementary(true);
    setError(null);
    try {
      const res = await fetch(`/api/complementary-data?reportId=${id}&matrix=1`);
      if (!res.ok) throw new Error("Failed to load complementary funding");
      const data: { years: number[]; currentYear: number | null; rows: ComplementaryMatrixRow[]; activities: TransferActivity[] } = await res.json();
      setComplementaryRows(data.rows);
      setComplementaryYears(data.years);
      setComplementaryCurrentYear(data.currentYear);
      setComplementaryActivities(data.activities);
      const states: Record<number, ComplementaryState> = {};
      for (const row of data.rows) {
        const cell = data.currentYear != null ? row.byYear[data.currentYear] : undefined;
        states[row.contributor_id] = {
          contributor_name: row.contributor_name ?? "",
          website: row.website ?? "",
          funding_type: row.funding_type ?? null,
          contribution_amount: cell?.contribution_amount != null ? String(cell.contribution_amount) : "",
          linked_activity_ids: cell?.linked_activity_ids ?? [],
          masterDirty: false,
          cellDirty: false,
        };
      }
      setComplementaryStates(states);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingComplementary(false);
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
        const filtered = Array.isArray(all)
          ? all.filter(
              (r) =>
                r.partner_short_name.toLowerCase() === user.id.toLowerCase() ||
                r.partner_short_name === user.organization
            )
          : [];
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
            project_end_date: match.project_end_date?.slice(0, 10) || "",
            project_lead: "",
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
    else if (params.section === "transfers") loadTransfers(reportId);
    else if (params.section === "complementary") loadComplementary(reportId);
    // Config-driven list sections load their own data inside <SectionTableEditor>.
  }, [reportId, params.section, loadSurveys, loadOverview, loadRisk, loadIndicators, loadTransfers, loadComplementary]);

  function handleReportChange(val: string) {
    const report = reports.find((r) => String(r.id) === val);
    if (!report) return;
    router.push(`/partner/${toSlug(report)}/${report.year}/${params.section}`);
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
    const dirtyTransferMasters = transferRows.filter((r) => transferStates[r.transfer_partner_id]?.masterDirty);
    const transferMasterSnap = new Map(dirtyTransferMasters.map((r) => [r.transfer_partner_id, JSON.stringify({ n: transferStates[r.transfer_partner_id].organization_name, w: transferStates[r.transfer_partner_id].website, t: transferStates[r.transfer_partner_id].partner_type })]));
    const dirtyTransferCells = transferRows.filter((r) => transferStates[r.transfer_partner_id]?.cellDirty);
    const transferCellSnap = new Map(dirtyTransferCells.map((r) => [r.transfer_partner_id, JSON.stringify({ a: transferStates[r.transfer_partner_id].amount_transferred, l: transferStates[r.transfer_partner_id].linked_activity_id })]));
    const dirtyCompMasters = complementaryRows.filter((r) => complementaryStates[r.contributor_id]?.masterDirty);
    const compMasterSnap = new Map(dirtyCompMasters.map((r) => [r.contributor_id, JSON.stringify({ n: complementaryStates[r.contributor_id].contributor_name, w: complementaryStates[r.contributor_id].website, t: complementaryStates[r.contributor_id].funding_type })]));
    const dirtyCompCells = complementaryRows.filter((r) => complementaryStates[r.contributor_id]?.cellDirty);
    const compCellSnap = new Map(dirtyCompCells.map((r) => [r.contributor_id, JSON.stringify({ a: complementaryStates[r.contributor_id].contribution_amount, l: complementaryStates[r.contributor_id].linked_activity_ids })]));
    const saveOverview = overviewDirty;
    const overviewSnap = JSON.stringify(overview);

    const ok = (r: Response) => { if (!r.ok) throw new Error("Save failed"); };
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
        ...dirtyTransferMasters.map((r) => {
          const st = transferStates[r.transfer_partner_id];
          return fetch("/api/transfer-partners", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.transfer_partner_id, organization_name: st.organization_name || null, website: st.website || null, partner_type: st.partner_type || null }) }).then(ok);
        }),
        ...dirtyTransferCells.map((r) => {
          const st = transferStates[r.transfer_partner_id];
          return fetch("/api/transfer-data", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.currentLineId, amount_transferred: st.amount_transferred || null, linked_activity_id: st.linked_activity_id }) }).then(ok);
        }),
        ...dirtyCompMasters.map((r) => {
          const st = complementaryStates[r.contributor_id];
          return fetch("/api/complementary-contributors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.contributor_id, contributor_name: st.contributor_name || null, website: st.website || null, funding_type: st.funding_type || null }) }).then(ok);
        }),
        ...dirtyCompCells.map((r) => {
          const st = complementaryStates[r.contributor_id];
          return fetch("/api/complementary-data", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.currentLineId, contribution_amount: st.contribution_amount || null, linked_activity_ids: st.linked_activity_ids }) }).then(ok);
        }),
        ...(saveOverview ? [fetch("/api/overview", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId, ...overview }) }).then(ok)] : []),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
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
    if (dirtyTransferMasters.length || dirtyTransferCells.length) setTransferStates((prev) => {
      const n = { ...prev };
      for (const r of dirtyTransferMasters) { const cur = prev[r.transfer_partner_id]; if (cur && JSON.stringify({ n: cur.organization_name, w: cur.website, t: cur.partner_type }) === transferMasterSnap.get(r.transfer_partner_id)) n[r.transfer_partner_id] = { ...n[r.transfer_partner_id], masterDirty: false }; }
      for (const r of dirtyTransferCells) { const cur = prev[r.transfer_partner_id]; if (cur && JSON.stringify({ a: cur.amount_transferred, l: cur.linked_activity_id }) === transferCellSnap.get(r.transfer_partner_id)) n[r.transfer_partner_id] = { ...n[r.transfer_partner_id], cellDirty: false }; }
      return n;
    });
    if (dirtyCompMasters.length || dirtyCompCells.length) setComplementaryStates((prev) => {
      const n = { ...prev };
      for (const r of dirtyCompMasters) { const cur = prev[r.contributor_id]; if (cur && JSON.stringify({ n: cur.contributor_name, w: cur.website, t: cur.funding_type }) === compMasterSnap.get(r.contributor_id)) n[r.contributor_id] = { ...n[r.contributor_id], masterDirty: false }; }
      for (const r of dirtyCompCells) { const cur = prev[r.contributor_id]; if (cur && JSON.stringify({ a: cur.contribution_amount, l: cur.linked_activity_ids }) === compCellSnap.get(r.contributor_id)) n[r.contributor_id] = { ...n[r.contributor_id], cellDirty: false }; }
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

  function updateTransferMaster(partnerId: number, patch: Partial<Pick<TransferState, "organization_name" | "website" | "partner_type">>) {
    pushMapEdit(setTransferStates, transferStates, partnerId, patch, { masterDirty: true });
  }

  function updateTransferCell(partnerId: number, patch: Partial<Pick<TransferState, "amount_transferred" | "linked_activity_id">>) {
    pushMapEdit(setTransferStates, transferStates, partnerId, patch, { cellDirty: true });
  }

  // Create a partner-defined receiving organisation (project-scoped) and attach
  // it to this report as a transfer line. Mirrors handleIndicatorAdd.
  async function handleTransferAdd() {
    const projectId = reports.find((r) => r.id === reportId)?.project_id;
    if (!newTransferName.trim() || !reportId || !projectId) return;
    setAddingTransfer(true);
    setError(null);
    try {
      const pRes = await fetch("/api/transfer-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          organization_name: newTransferName.trim(),
          website: newTransferWebsite.trim() || null,
          partner_type: newTransferType || null,
        }),
      });
      if (!pRes.ok) throw new Error("Failed to create transfer partner");
      const partner = await pRes.json();

      const lRes = await fetch("/api/transfer-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, transfer_partner_id: partner.id }),
      });
      if (!lRes.ok) throw new Error("Failed to add transfer to report");

      setNewTransferName("");
      setNewTransferWebsite("");
      setNewTransferType("");
      await loadTransfers(reportId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAddingTransfer(false);
    }
  }

  // Remove a transfer from this report (the receiving organisation's records for
  // other years are left intact — only this report's line is deleted).
  async function handleTransferDelete(row: TransferMatrixRow) {
    if (!reportId) return;
    const rid = reportId;
    const partnerId = row.transfer_partner_id;
    const st = transferStates[partnerId];
    const amount = st?.amount_transferred ?? "";
    const activity = st?.linked_activity_id ?? null;
    setDeletingTransferId(partnerId);
    setError(null);
    try {
      const res = await fetch(`/api/transfer-data?id=${row.currentLineId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete transfer");
      await loadTransfers(rid);

      // Undoable: re-create this report's line for the (still-existing) partner.
      let lineId = row.currentLineId;
      pushCommand({
        undo: async () => {
          try {
            const cRes = await fetch("/api/transfer-data", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reportId: rid, transfer_partner_id: partnerId }),
            });
            if (!cRes.ok) throw new Error("Failed to restore transfer");
            const created = await cRes.json();
            lineId = created.id;
            if (amount || activity != null) {
              await fetch("/api/transfer-data", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: created.id, amount_transferred: amount || null, linked_activity_id: activity }),
              });
            }
            await loadTransfers(rid);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to restore transfer");
          }
        },
        redo: async () => {
          try {
            const r = await fetch(`/api/transfer-data?id=${lineId}`, { method: "DELETE" });
            if (!r.ok) throw new Error("Failed to delete transfer");
            await loadTransfers(rid);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete transfer");
          }
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDeletingTransferId(null);
    }
  }

  function updateComplementaryMaster(contributorId: number, patch: Partial<Pick<ComplementaryState, "contributor_name" | "website" | "funding_type">>) {
    pushMapEdit(setComplementaryStates, complementaryStates, contributorId, patch, { masterDirty: true });
  }

  function updateComplementaryCell(contributorId: number, patch: Partial<Pick<ComplementaryState, "contribution_amount" | "linked_activity_ids">>) {
    pushMapEdit(setComplementaryStates, complementaryStates, contributorId, patch, { cellDirty: true });
  }

  // Toggle a workplan activity in a contribution's multi-select set.
  function toggleComplementaryActivity(contributorId: number, activityId: number) {
    const cur = complementaryStates[contributorId];
    if (!cur) return;
    const has = cur.linked_activity_ids.includes(activityId);
    const linked_activity_ids = has
      ? cur.linked_activity_ids.filter((x) => x !== activityId)
      : [...cur.linked_activity_ids, activityId];
    pushMapEdit(setComplementaryStates, complementaryStates, contributorId, { linked_activity_ids }, { cellDirty: true });
  }

  async function handleComplementaryAdd() {
    const projectId = reports.find((r) => r.id === reportId)?.project_id;
    if (!newComplementaryName.trim() || !reportId || !projectId) return;
    setAddingComplementary(true);
    setError(null);
    try {
      const cRes = await fetch("/api/complementary-contributors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          contributor_name: newComplementaryName.trim(),
          website: newComplementaryWebsite.trim() || null,
          funding_type: newComplementaryType || null,
        }),
      });
      if (!cRes.ok) throw new Error("Failed to create contributor");
      const contributor = await cRes.json();

      const lRes = await fetch("/api/complementary-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, contributor_id: contributor.id }),
      });
      if (!lRes.ok) throw new Error("Failed to add contribution to report");

      setNewComplementaryName("");
      setNewComplementaryWebsite("");
      setNewComplementaryType("");
      await loadComplementary(reportId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAddingComplementary(false);
    }
  }

  async function handleComplementaryDelete(row: ComplementaryMatrixRow) {
    if (!reportId) return;
    const rid = reportId;
    const contributorId = row.contributor_id;
    const st = complementaryStates[contributorId];
    const amount = st?.contribution_amount ?? "";
    const activityIds = st?.linked_activity_ids ?? [];
    setDeletingComplementaryId(contributorId);
    setError(null);
    try {
      const res = await fetch(`/api/complementary-data?id=${row.currentLineId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete contribution");
      await loadComplementary(rid);

      // Undoable: re-create this report's line for the (still-existing) contributor.
      let lineId = row.currentLineId;
      pushCommand({
        undo: async () => {
          try {
            const cRes = await fetch("/api/complementary-data", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reportId: rid, contributor_id: contributorId }),
            });
            if (!cRes.ok) throw new Error("Failed to restore contribution");
            const created = await cRes.json();
            lineId = created.id;
            if (amount || activityIds.length) {
              await fetch("/api/complementary-data", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: created.id, contribution_amount: amount || null, linked_activity_ids: activityIds }),
              });
            }
            await loadComplementary(rid);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to restore contribution");
          }
        },
        redo: async () => {
          try {
            const r = await fetch(`/api/complementary-data?id=${lineId}`, { method: "DELETE" });
            if (!r.ok) throw new Error("Failed to delete contribution");
            await loadComplementary(rid);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete contribution");
          }
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDeletingComplementaryId(null);
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
  const sectionLoading =
    params.section === "surveys" ? loadingSurveys :
    params.section === "overview" ? loadingOverview :
    params.section === "risk" ? loadingRisk :
    params.section === "indicators" ? loadingIndicators :
    params.section === "transfers" ? loadingTransfers :
    params.section === "complementary" ? loadingComplementary : false;
  const notFound = !loadingReports && !selectedReport;

  // The parent-managed sections drive `parentAutosave`; the rest report up via
  // `childSaveState`. The top-bar indicator shows whichever owns the active tab.
  const parentManaged = ["surveys", "overview", "risk", "indicators", "transfers", "complementary"].includes(params.section);
  const displaySaveState = parentManaged ? parentAutosave.state : childSaveState;

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Top bar */}
      <div className="bg-neutral-950 text-white px-8 h-32 flex items-center justify-between shrink-0">
        <div>
          <p className="text-neutral-400 text-sm mb-1">{labels.partnerEditor.title}</p>
          {selectedReport ? (
            <>
              <h1 className="text-2xl font-bold font-qanelas capitalize">
                {selectedReport.report_type ?? "annual"} Report {selectedReport.year}
              </h1>
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
                  <Loader2 className="size-3 animate-spin" /> {labels.partnerEditor.loading}
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
              {reports.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  <div className="flex flex-col">
                    <span className="capitalize">{r.report_type ?? "annual"} Report {r.year}</span>
                    <span className="text-xs text-muted-foreground">{r.project_short_name || r.project_title}</span>
                  </div>
                </SelectItem>
              ))}
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

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {/* Tab instructions */}
        {params.section !== "overview" && !sectionLoading && !notFound && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {labels.tabInstructions[params.section as keyof typeof labels.tabInstructions] || ""}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {notFound ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <FileQuestion className="size-10 opacity-30" />
            <p className="text-sm">{labels.partnerEditor.notFound}</p>
          </div>
        ) : loadingReports || sectionLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {labels.partnerEditor.loading}
          </div>

        ) : params.section === "surveys" ? (
          surveys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <FileQuestion className="size-8 opacity-30" />
              <p className="text-sm">{labels.partnerEditor.emptySurveys}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {surveys.map((survey, i) => {
                const state = rowStates[survey.id];
                if (!state) return null;
                return (
                  <div
                    key={survey.id}
                    className={cn("rounded-xl border bg-card p-5 space-y-4 transition-colors", state.dirty && "border-amber-200")}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">{i + 1}.</span>
                      <p className="text-sm font-medium leading-snug">{survey.question}</p>
                    </div>
                    <div className="flex gap-6 items-start pl-8">
                      <div className="shrink-0 space-y-1.5">
                        <p className="text-xs text-muted-foreground">{labels.partnerEditor.assessmentLabel}</p>
                        <Select
                          value={state.assessment != null ? String(state.assessment) : "none"}
                          onValueChange={(v) => updateRow(survey.id, { assessment: v === "none" ? null : Number(v) })}
                        >
                          <SelectTrigger className="w-fit h-8 px-2 gap-1.5">
                            {state.assessment != null
                              ? <AssessmentBadge value={state.assessment} />
                              : <span className="text-muted-foreground text-sm px-1">—</span>}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                            <SelectItem value="1"><div className="flex items-center gap-2"><AssessmentBadge value={1} /> <span className="text-sm">{labels.assessment.min}</span></div></SelectItem>
                            <SelectItem value="2"><AssessmentBadge value={2} /></SelectItem>
                            <SelectItem value="3"><AssessmentBadge value={3} /></SelectItem>
                            <SelectItem value="4"><AssessmentBadge value={4} /></SelectItem>
                            <SelectItem value="5"><div className="flex items-center gap-2"><AssessmentBadge value={5} /> <span className="text-sm">{labels.assessment.max}</span></div></SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <p className="text-xs text-muted-foreground">{labels.partnerEditor.contextLabel}</p>
                        <Textarea
                          value={state.context}
                          onChange={(e) => updateRow(survey.id, { context: e.target.value })}
                          placeholder={labels.placeholders.assessmentContext}
                          className="text-sm min-h-[80px] resize-y"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )

        ) : params.section === "overview" ? (
          <div className="space-y-5">
            <div className="rounded-xl border bg-card p-6 space-y-5">

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{labels.overviewFields.projectTitle}</Label>
                  <Input value={overview.project_title} onChange={(e) => updateOverview({ project_title: e.target.value })} placeholder={labels.placeholders.projectTitle} className="text-sm" />
                </div>
                <div>
                  <Label>{labels.overviewFields.mptfoProjectNumber}</Label>
                  <Input value={overview.mptfo_project_number} onChange={(e) => updateOverview({ mptfo_project_number: e.target.value })} placeholder={labels.placeholders.mptfoProjectNumber} className="text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{labels.overviewFields.organizationName}</Label>
                  <Input value={overview.organization_name} onChange={(e) => updateOverview({ organization_name: e.target.value })} placeholder={labels.placeholders.organizationName} className="text-sm" />
                </div>
                <div>
                  <Label>{labels.overviewFields.organizationWebsite}</Label>
                  <Input value={overview.organization_website} onChange={(e) => updateOverview({ organization_website: e.target.value })} placeholder={labels.placeholders.organizationWebsite} className="text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>{labels.overviewFields.projectLead}</Label>
                  <Input value={overview.project_lead} onChange={(e) => updateOverview({ project_lead: e.target.value })} placeholder={labels.placeholders.projectLead} className="text-sm" />
                </div>
                <div>
                  <Label>{labels.overviewFields.grantSizeUsd}</Label>
                  <Input type="number" min={0} value={overview.grant_size_usd} onChange={(e) => updateOverview({ grant_size_usd: e.target.value })} placeholder={labels.placeholders.grantSizeUsd} className="text-sm" />
                </div>
                <div>
                  <Label>{labels.overviewFields.durationMonths}</Label>
                  <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                    {durationMonthsLabel(overview.project_start_date, overview.project_end_date)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>{labels.overviewFields.startDate}</Label>
                  <Input type="date" value={overview.project_start_date} onChange={(e) => updateOverview({ project_start_date: e.target.value })} className="text-sm" />
                </div>
                <div>
                  <Label>{labels.overviewFields.endDate}</Label>
                  <Input type="date" value={overview.project_end_date} onChange={(e) => updateOverview({ project_end_date: e.target.value })} className="text-sm" />
                </div>
                <div>
                  <Label>{labels.overviewFields.reportSubmissionDate}</Label>
                  <Input type="date" value={overview.report_submission_date} onChange={(e) => updateOverview({ report_submission_date: e.target.value })} className="text-sm" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Start and end dates are project-level — they set the project timeline and drive the workplan quarters.
              </p>

              <div>
                <Label>{labels.overviewFields.implementingPartners}</Label>
                <Textarea value={overview.implementing_partners} onChange={(e) => updateOverview({ implementing_partners: e.target.value })} placeholder={labels.placeholders.implementingPartners} className="text-sm min-h-[72px] resize-y" />
              </div>

              <div>
                <Label>{labels.overviewFields.geographicScope}</Label>
                <Textarea value={overview.geographic_scope} onChange={(e) => updateOverview({ geographic_scope: e.target.value })} placeholder={labels.placeholders.geographicScope} className="text-sm min-h-[72px] resize-y" />
              </div>
            </div>

            {/* Authorization */}
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{labels.authorization.heading}</h3>
              </div>

              <div className="space-y-2">
                {AUTHORIZATION_MESSAGES.map((msg, i) => (
                  <p key={i} className="text-sm text-muted-foreground leading-relaxed">{msg}</p>
                ))}
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overview.authorized}
                  onChange={(e) => updateOverview({ authorized: e.target.checked })}
                  className="size-4 rounded"
                />
                <span className="text-sm font-medium">{labels.authorization.checkbox}</span>
              </label>
            </div>
          </div>

        ) : params.section === "risk" ? (
          <div className="space-y-4">
            {/* Add a new risk (report-scoped, same as the admin editor) */}
            <div className="flex flex-wrap gap-2">
              <Input placeholder={labels.placeholders.riskName} value={newRiskName} onChange={(e) => setNewRiskName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newRiskName.trim()) handleRiskAdd(); }} className="flex-1 min-w-[200px]" />
              <Input placeholder={labels.placeholders.riskCategories} value={newRiskCategory} onChange={(e) => setNewRiskCategory(e.target.value)} className="flex-1 min-w-[160px]" />
              <Input placeholder={labels.placeholders.approvedMitigation} value={newRiskApprovedMitigation} onChange={(e) => setNewRiskApprovedMitigation(e.target.value)} className="flex-1 min-w-[200px]" />
              <Button onClick={handleRiskAdd} disabled={addingRisk || !newRiskName.trim()} size="sm" className="shrink-0">
                {addingRisk ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{labels.adminEditor.add}</>}
              </Button>
            </div>

            {risks.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                {labels.partnerEditor.emptyRisks}
              </div>
            ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-12">{labels.risk.columns.number}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{labels.risk.columns.risk}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-32">{labels.risk.columns.likelihood}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-32">{labels.risk.columns.impact}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-28">{labels.risk.columns.riskLevel}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-72">{labels.risk.columns.approvedMitigation}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-72">{labels.risk.columns.updatedMitigation}</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground w-24">{labels.risk.columns.revision}</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground w-24">{labels.risk.columns.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {risks.map((risk, i) => {
                    const state = riskStates[risk.id];
                    if (!state) return null;
                    const collapsed = collapsedRows[risk.id] ?? true;
                    if (editingRiskId === risk.id) {
                      return (
                        <tr key={risk.id} className="bg-amber-50/40">
                          <td className="px-4 py-3 align-top text-xs font-mono text-muted-foreground">{i + 1}.</td>
                          <td colSpan={6} className="px-4 py-3 align-top">
                            <div className="flex flex-col gap-2">
                              <Input value={editingRiskName} onChange={(e) => setEditingRiskName(e.target.value)} placeholder={labels.placeholders.riskName} className="text-sm" autoFocus />
                              <Input value={editingRiskCategory} onChange={(e) => setEditingRiskCategory(e.target.value)} placeholder={labels.placeholders.riskCategories} className="text-sm" />
                              <Textarea value={editingRiskApprovedMitigation} onChange={(e) => setEditingRiskApprovedMitigation(e.target.value)} placeholder={labels.placeholders.approvedMitigation} className="text-sm min-h-[80px] resize-y" />
                            </div>
                          </td>
                          <td colSpan={2} className="px-4 py-3 align-top">
                            <div className="flex items-center justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleRiskEditSave(risk.id)}>{labels.adminEditor.save}</Button>
                              <Button size="sm" variant="outline" onClick={cancelRiskEdit}>{labels.adminEditor.cancel}</Button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={risk.id} className={cn("transition-colors", state.dirty && "bg-amber-50/40")}>
                        {/* # + toggle */}
                        <td className="px-4 py-3 align-middle">
                          <button
                            onClick={() => toggleCollapse(risk.id)}
                            className="flex items-center gap-0.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {collapsed
                              ? <ChevronRight className="size-3 shrink-0" />
                              : <ChevronDown className="size-3 shrink-0" />}
                            {i + 1}.
                          </button>
                        </td>

                        {/* Risk name + categories */}
                        <td className="px-4 py-3 align-middle">
                          <p className="font-medium text-sm">{risk.risk_name}</p>
                          {risk.risk_category && risk.risk_category.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {risk.risk_category.map((cat, ci) => (
                                <span key={ci} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{cat}</span>
                              ))}
                            </div>
                          )}
                        </td>

                        {collapsed ? (
                          <>
                            <td className="px-4 py-3 align-middle">
                              <Select
                                value={state.likelihood !== null ? String(state.likelihood) : "none"}
                                onValueChange={(v) => updateRisk(risk.id, { likelihood: v === "none" ? null : Number(v) })}
                              >
                                <SelectTrigger className="w-fit h-8 px-2 gap-1.5">
                                  {state.likelihood != null
                                    ? <LikelihoodBadge value={state.likelihood} />
                                    : <span className="text-muted-foreground text-sm px-1">—</span>}
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <SelectItem key={n} value={String(n)}><LikelihoodBadge value={n} /></SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <Select
                                value={state.impact !== null ? String(state.impact) : "none"}
                                onValueChange={(v) => updateRisk(risk.id, { impact: v === "none" ? null : Number(v) })}
                              >
                                <SelectTrigger className="w-fit h-8 px-2 gap-1.5">
                                  {state.impact != null
                                    ? <ImpactBadge value={state.impact} />
                                    : <span className="text-muted-foreground text-sm px-1">—</span>}
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <SelectItem key={n} value={String(n)}><ImpactBadge value={n} /></SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <RiskLevelBadge likelihood={state.likelihood} impact={state.impact} />
                            </td>
                            <td className="px-4 py-3 align-middle max-w-[288px]">
                              {risk.approved_mitigation
                                ? <p className="text-sm text-muted-foreground truncate">{risk.approved_mitigation}</p>
                                : <span className="text-muted-foreground text-sm">—</span>}
                            </td>
                            <td className="px-4 py-3 align-middle max-w-[288px]">
                              <Textarea
                                value={state.updated_mitigation}
                                onChange={(e) => updateRisk(risk.id, { updated_mitigation: e.target.value })}
                                placeholder={labels.placeholders.updatedMitigation}
                                className="text-sm h-8 min-h-0 resize-none overflow-hidden py-1"
                              />
                            </td>
                            <td className="px-4 py-3 align-middle text-center">
                              <input
                                type="checkbox"
                                checked={state.project_revision}
                                onChange={(e) => updateRisk(risk.id, { project_revision: e.target.checked })}
                                className="size-4 rounded"
                              />
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => startRiskEdit(risk)} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit risk"><Pencil className="size-3.5" /></button>
                                <button onClick={() => handleRiskDelete(risk.id)} disabled={deletingRiskId === risk.id} className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40" aria-label="Delete risk">
                                  {deletingRiskId === risk.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 align-top">
                              <Select
                                value={state.likelihood !== null ? String(state.likelihood) : "none"}
                                onValueChange={(v) => updateRisk(risk.id, { likelihood: v === "none" ? null : Number(v) })}
                              >
                                <SelectTrigger className="w-fit h-8 px-2 gap-1.5">
                                  {state.likelihood != null
                                    ? <LikelihoodBadge value={state.likelihood} />
                                    : <span className="text-muted-foreground text-sm px-1">—</span>}
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <SelectItem key={n} value={String(n)}><LikelihoodBadge value={n} /></SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <Select
                                value={state.impact !== null ? String(state.impact) : "none"}
                                onValueChange={(v) => updateRisk(risk.id, { impact: v === "none" ? null : Number(v) })}
                              >
                                <SelectTrigger className="w-fit h-8 px-2 gap-1.5">
                                  {state.impact != null
                                    ? <ImpactBadge value={state.impact} />
                                    : <span className="text-muted-foreground text-sm px-1">—</span>}
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <SelectItem key={n} value={String(n)}><ImpactBadge value={n} /></SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <RiskLevelBadge likelihood={state.likelihood} impact={state.impact} />
                            </td>
                            <td className="px-4 py-3 align-top">
                              {risk.approved_mitigation
                                ? <p className="text-sm text-muted-foreground leading-relaxed">{risk.approved_mitigation}</p>
                                : <span className="text-sm text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <Textarea
                                value={state.updated_mitigation}
                                onChange={(e) => updateRisk(risk.id, { updated_mitigation: e.target.value })}
                                placeholder={labels.placeholders.updatedMitigation}
                                className="text-sm min-h-[80px] resize-y"
                              />
                            </td>
                            <td className="px-4 py-3 align-top text-center">
                              <input
                                type="checkbox"
                                checked={state.project_revision}
                                onChange={(e) => updateRisk(risk.id, { project_revision: e.target.checked })}
                                className="size-4 rounded mt-1"
                              />
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => startRiskEdit(risk)} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit risk"><Pencil className="size-3.5" /></button>
                                <button onClick={() => handleRiskDelete(risk.id)} disabled={deletingRiskId === risk.id} className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40" aria-label="Delete risk">
                                  {deletingRiskId === risk.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>

        ) : params.section === "indicators" ? (
          <div className="space-y-4">
            {/* Add a custom, partner-defined indicator (project-scoped) */}
            <div className="flex flex-wrap gap-2">
              <Input placeholder={labels.placeholders.indicatorName} value={newIndicatorName} onChange={(e) => setNewIndicatorName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newIndicatorName.trim()) handleIndicatorAdd(); }} className="flex-1 min-w-[220px]" />
              <Input placeholder={labels.indicators.columns.baselineValue} value={newIndicatorBaselineValue} onChange={(e) => setNewIndicatorBaselineValue(e.target.value)} className="w-32" />
              <Input placeholder={labels.indicators.columns.baselineYear} type="number" value={newIndicatorBaselineYear} onChange={(e) => setNewIndicatorBaselineYear(e.target.value)} className="w-28" />
              <Input placeholder={labels.indicators.columns.targetValue} value={newIndicatorTargetValue} onChange={(e) => setNewIndicatorTargetValue(e.target.value)} className="w-32" />
              <Input placeholder={labels.indicators.columns.targetYear} type="number" value={newIndicatorTargetYear} onChange={(e) => setNewIndicatorTargetYear(e.target.value)} className="w-28" />
              <Button onClick={handleIndicatorAdd} disabled={addingIndicator || !newIndicatorName.trim()} size="sm" className="shrink-0">
                {addingIndicator ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{labels.adminEditor.add}</>}
              </Button>
            </div>

            {indicatorRows.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                {labels.partnerEditor.emptyIndicators}
              </div>
            ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="text-sm border-separate border-spacing-0" style={{ minWidth: IND_FROZEN_WIDTH }}>
                <thead>
                  {/* Year-group header */}
                  <tr className="text-xs">
                    <th rowSpan={2} style={ifz("ind", 30)} className="text-left px-3 py-2 font-medium text-muted-foreground border-r border-b bg-neutral-100 align-bottom">
                      {labels.indicators.columns.indicator}
                    </th>
                    <th rowSpan={2} style={ifz("baseline", 30)} className="text-left px-3 py-2 font-medium text-muted-foreground border-r border-b bg-neutral-100 align-bottom">
                      {labels.indicators.columns.baseline}
                    </th>
                    <th rowSpan={2} style={ifz("target", 30)} className="text-left px-3 py-2 font-medium text-muted-foreground border-r border-b bg-neutral-100 align-bottom">
                      {labels.indicators.columns.target}
                    </th>
                    {indicatorYears.map((year) => (
                      <th
                        key={year}
                        colSpan={3}
                        className={cn(
                          "px-2 py-2 text-center font-semibold text-muted-foreground border-l border-b",
                          year === indicatorCurrentYear ? "bg-crafd-yellow/20" : "bg-neutral-100"
                        )}
                      >
                        {year}
                      </th>
                    ))}
                  </tr>
                  {/* Sub-column header */}
                  <tr className="text-[11px] text-muted-foreground">
                    {indicatorYears.map((year) => {
                      const current = year === indicatorCurrentYear;
                      const bg = current ? "bg-crafd-yellow/20" : "bg-neutral-50";
                      return (
                        <Fragment key={year}>
                          <th className={cn("px-2 py-1.5 text-left font-medium border-l border-b min-w-[130px]", bg)}>{labels.indicators.columns.achievedValue}</th>
                          <th className={cn("px-2 py-1.5 text-left font-medium border-b min-w-[140px]", bg)}>{labels.indicators.columns.status}</th>
                          <th className={cn("px-2 py-1.5 text-left font-medium border-b min-w-[200px]", bg)}>{labels.indicators.columns.comment}</th>
                        </Fragment>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {indicatorRows.map((row) => {
                    const state = indicatorStates[row.currentLineId];
                    if (!state) return null;
                    return (
                      <tr key={row.indicator_id} className="align-top">
                        {/* Frozen: indicator name + baseline + target */}
                        <td style={ifz("ind")} className={cn("px-3 py-2 border-r border-t bg-card", state.dirty && "bg-amber-50/60")}>
                          <p className="font-medium leading-snug">{row.indicator_name}</p>
                          {row.means_of_verification && (
                            <p className="text-xs text-muted-foreground mt-1">{row.means_of_verification}</p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {row.category && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{row.category}</span>}
                            {row.cycle && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{cycleLabel(row.cycle)}</span>}
                          </div>
                        </td>
                        <td style={ifz("baseline")} className={cn("px-3 py-2 border-r border-t bg-card tabular-nums", state.dirty && "bg-amber-50/60")}>
                          <ValueYear value={row.baseline_value} year={row.baseline_year} />
                        </td>
                        <td style={ifz("target")} className={cn("px-3 py-2 border-r border-t bg-card tabular-nums", state.dirty && "bg-amber-50/60")}>
                          <ValueYear value={row.target_value} year={row.target_year} />
                        </td>

                        {/* Scrollable per-year cells */}
                        {indicatorYears.map((year) => {
                          const current = year === indicatorCurrentYear;
                          if (current) {
                            return (
                              <Fragment key={year}>
                                <td className="px-1 py-1 border-l border-t bg-crafd-yellow/10">
                                  <Input
                                    value={state.achieved_value}
                                    onChange={(e) => updateIndicator(row.currentLineId, { achieved_value: e.target.value })}
                                    placeholder={labels.placeholders.achievedValue}
                                    className="text-sm h-8"
                                  />
                                </td>
                                <td className="px-1 py-1 border-t bg-crafd-yellow/10">
                                  <Select
                                    value={state.status ?? "none"}
                                    onValueChange={(v) => updateIndicator(row.currentLineId, { status: v === "none" ? null : v })}
                                  >
                                    <SelectTrigger className="w-fit h-8 px-2 gap-1.5">
                                      {state.status
                                        ? <StatusBadge value={state.status as IndicatorStatus} />
                                        : <span className="text-muted-foreground text-sm px-1">—</span>}
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                                      {STATUS_KEYS.map((k) => (
                                        <SelectItem key={k} value={k}><StatusBadge value={k} /></SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-1 py-1 border-t bg-crafd-yellow/10">
                                  <Textarea
                                    value={state.comment}
                                    onChange={(e) => updateIndicator(row.currentLineId, { comment: e.target.value })}
                                    placeholder={labels.placeholders.indicatorComment}
                                    className="text-sm min-h-[36px] resize-y"
                                  />
                                </td>
                              </Fragment>
                            );
                          }
                          const cell = row.byYear[year];
                          return (
                            <Fragment key={year}>
                              <td className="px-2 py-2 border-l border-t text-muted-foreground tabular-nums">
                                {cell?.achieved_value || <span className="text-muted-foreground/40">—</span>}
                              </td>
                              <td className="px-2 py-2 border-t">
                                {cell?.status ? <StatusBadge value={cell.status as IndicatorStatus} /> : <span className="text-muted-foreground/40">—</span>}
                              </td>
                              <td className="px-2 py-2 border-t text-muted-foreground">
                                {cell?.comment
                                  ? <p className="line-clamp-3 text-xs">{cell.comment}</p>
                                  : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>

        ) : params.section === "transfers" ? (
          (() => {
            const activityById = new Map(transferActivities.map((a) => [a.id, a]));
            const cellAmount = (row: TransferMatrixRow, year: number) => {
              const raw = year === transferCurrentYear
                ? transferStates[row.transfer_partner_id]?.amount_transferred
                : row.byYear[year]?.amount_transferred;
              const v = Number(raw);
              return raw == null || raw === "" || Number.isNaN(v) ? 0 : v;
            };
            const rowSubtotal = (row: TransferMatrixRow) => transferYears.reduce((s, y) => s + cellAmount(row, y), 0);
            const yearTotal = (year: number) => transferRows.reduce((s, r) => s + cellAmount(r, year), 0);
            const grandTotal = transferRows.reduce((s, r) => s + rowSubtotal(r), 0);

            return (
              <div className="space-y-4">
                {/* Add a receiving organisation (project-scoped, created by the partner) */}
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder={labels.placeholders.transferOrganizationName}
                    value={newTransferName}
                    onChange={(e) => setNewTransferName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newTransferName.trim()) handleTransferAdd(); }}
                    className="flex-1 min-w-[220px]"
                  />
                  <Input
                    placeholder={labels.placeholders.transferWebsite}
                    value={newTransferWebsite}
                    onChange={(e) => setNewTransferWebsite(e.target.value)}
                    className="flex-1 min-w-[180px]"
                  />
                  <Select value={newTransferType || "none"} onValueChange={(v) => setNewTransferType(v === "none" ? "" : v)}>
                    <SelectTrigger className="w-[220px] h-9">
                      {newTransferType
                        ? <span className="truncate">{newTransferType}</span>
                        : <span className="text-muted-foreground">{labels.transfers.selectPartnerType}</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none"><span className="text-muted-foreground">{labels.transfers.selectPartnerType}</span></SelectItem>
                      {PARTNER_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleTransferAdd} disabled={addingTransfer || !newTransferName.trim()} size="sm" className="shrink-0">
                    {addingTransfer ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{labels.adminEditor.add}</>}
                  </Button>
                </div>

                {transferRows.length === 0 ? (
                  <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                    {labels.transfers.empty}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border bg-card">
                    <table className="text-sm border-separate border-spacing-0" style={{ minWidth: TRANSFER_FROZEN_WIDTH }}>
                      <thead>
                        {/* Year-group header */}
                        <tr className="text-xs">
                          <th rowSpan={2} style={tfz("org", 30)} className="text-left px-3 py-2 font-medium text-muted-foreground border-r border-b bg-neutral-100 align-bottom">
                            {labels.transfers.columns.organizationName}
                          </th>
                          <th rowSpan={2} style={tfz("website", 30)} className="text-left px-3 py-2 font-medium text-muted-foreground border-r border-b bg-neutral-100 align-bottom">
                            {labels.transfers.columns.website}
                          </th>
                          <th rowSpan={2} style={tfz("type", 30)} className="text-left px-3 py-2 font-medium text-muted-foreground border-r border-b bg-neutral-100 align-bottom">
                            {labels.transfers.columns.partnerType}
                          </th>
                          {transferYears.map((year) => (
                            <th
                              key={year}
                              colSpan={2}
                              className={cn(
                                "px-2 py-2 text-center font-semibold text-muted-foreground border-l border-b",
                                year === transferCurrentYear ? "bg-crafd-yellow/20" : "bg-neutral-100"
                              )}
                            >
                              {year}
                            </th>
                          ))}
                          <th rowSpan={2} className="px-3 py-2 text-right font-medium text-muted-foreground border-l border-b bg-neutral-100 align-bottom min-w-[150px]">
                            {labels.transfers.columns.subTotal}
                          </th>
                          <th rowSpan={2} className="px-2 py-2 border-l border-b bg-neutral-100 w-12" />
                        </tr>
                        {/* Sub-column header */}
                        <tr className="text-[11px] text-muted-foreground">
                          {transferYears.map((year) => {
                            const current = year === transferCurrentYear;
                            const bg = current ? "bg-crafd-yellow/20" : "bg-neutral-50";
                            return (
                              <Fragment key={year}>
                                <th className={cn("px-2 py-1.5 text-left font-medium border-l border-b min-w-[140px]", bg)}>{labels.transfers.columns.amountTransferred}</th>
                                <th className={cn("px-2 py-1.5 text-left font-medium border-b min-w-[220px]", bg)}>{labels.transfers.columns.linkedActivity}</th>
                              </Fragment>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {transferRows.map((row) => {
                          const state = transferStates[row.transfer_partner_id];
                          if (!state) return null;
                          const dirty = state.masterDirty || state.cellDirty;
                          return (
                            <tr key={row.transfer_partner_id} className="align-top">
                              {/* Frozen: organisation identity (master, editable anytime) */}
                              <td style={tfz("org")} className={cn("px-2 py-1 border-r border-t bg-card", dirty && "bg-amber-50/60")}>
                                <Input value={state.organization_name} onChange={(e) => updateTransferMaster(row.transfer_partner_id, { organization_name: e.target.value })} placeholder={labels.placeholders.transferOrganizationName} className="text-sm h-8" />
                              </td>
                              <td style={tfz("website")} className={cn("px-2 py-1 border-r border-t bg-card", dirty && "bg-amber-50/60")}>
                                <Input value={state.website} onChange={(e) => updateTransferMaster(row.transfer_partner_id, { website: e.target.value })} placeholder={labels.placeholders.transferWebsite} className="text-sm h-8" />
                              </td>
                              <td style={tfz("type")} className={cn("px-2 py-1 border-r border-t bg-card", dirty && "bg-amber-50/60")}>
                                <Select value={state.partner_type || "none"} onValueChange={(v) => updateTransferMaster(row.transfer_partner_id, { partner_type: v === "none" ? null : v })}>
                                  <SelectTrigger className="w-full h-8 px-2">
                                    {state.partner_type
                                      ? <span className="truncate text-left">{state.partner_type}</span>
                                      : <span className="text-muted-foreground">{labels.transfers.selectPartnerType}</span>}
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none"><span className="text-muted-foreground">{labels.transfers.selectPartnerType}</span></SelectItem>
                                    {PARTNER_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                                  </SelectContent>
                                </Select>
                              </td>

                              {/* Scrollable per-year cells */}
                              {transferYears.map((year) => {
                                const current = year === transferCurrentYear;
                                if (current) {
                                  return (
                                    <Fragment key={year}>
                                      <td className="px-1 py-1 border-l border-t bg-crafd-yellow/10">
                                        <Input type="number" min={0} value={state.amount_transferred} onChange={(e) => updateTransferCell(row.transfer_partner_id, { amount_transferred: e.target.value })} placeholder={labels.placeholders.transferAmount} className="text-sm h-8 text-right tabular-nums" />
                                      </td>
                                      <td className="px-1 py-1 border-t bg-crafd-yellow/10">
                                        <Select value={state.linked_activity_id != null ? String(state.linked_activity_id) : "none"} onValueChange={(v) => updateTransferCell(row.transfer_partner_id, { linked_activity_id: v === "none" ? null : Number(v) })}>
                                          <SelectTrigger className="w-full h-8 px-2">
                                            {state.linked_activity_id != null
                                              ? <span className="truncate text-left text-xs">{activityLabel(activityById.get(state.linked_activity_id))}</span>
                                              : <span className="text-muted-foreground">{labels.transfers.selectActivity}</span>}
                                          </SelectTrigger>
                                          <SelectContent className="max-w-[440px]">
                                            <SelectItem value="none"><span className="text-muted-foreground">{labels.transfers.selectActivity}</span></SelectItem>
                                            {transferActivities.length === 0 && (
                                              <div className="px-2 py-1.5 text-xs text-muted-foreground">No workplan activities yet.</div>
                                            )}
                                            {transferActivities.map((a) => (<SelectItem key={a.id} value={String(a.id)}>{activityLabel(a)}</SelectItem>))}
                                          </SelectContent>
                                        </Select>
                                      </td>
                                    </Fragment>
                                  );
                                }
                                const cell = row.byYear[year];
                                return (
                                  <Fragment key={year}>
                                    <td className="px-2 py-2 border-l border-t text-muted-foreground text-right tabular-nums">
                                      {cell?.amount_transferred != null ? formatAmount(cell.amount_transferred) : <span className="text-muted-foreground/40">—</span>}
                                    </td>
                                    <td className="px-2 py-2 border-t text-muted-foreground">
                                      {cell?.linked_activity_id != null
                                        ? <p className="line-clamp-2 text-xs">{activityLabel(activityById.get(cell.linked_activity_id))}</p>
                                        : <span className="text-muted-foreground/40">—</span>}
                                    </td>
                                  </Fragment>
                                );
                              })}

                              {/* Sub-total across all years */}
                              <td className="px-3 py-2 border-l border-t text-right font-medium tabular-nums bg-muted/20">
                                {formatAmount(rowSubtotal(row))}
                              </td>
                              <td className="px-2 py-2 border-l border-t text-center">
                                <button onClick={() => handleTransferDelete(row)} disabled={deletingTransferId === row.transfer_partner_id} className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40" aria-label="Delete transfer">
                                  {deletingTransferId === row.transfer_partner_id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="text-sm font-semibold">
                          <td style={tfz("org", 30)} className="px-3 py-3 border-r border-t bg-neutral-100 whitespace-nowrap">{labels.transfers.columns.total}</td>
                          <td style={tfz("website", 30)} className="border-r border-t bg-neutral-100" />
                          <td style={tfz("type", 30)} className="border-r border-t bg-neutral-100" />
                          {transferYears.map((year) => (
                            <Fragment key={year}>
                              <td className={cn("px-2 py-3 border-l border-t text-right tabular-nums", year === transferCurrentYear ? "bg-crafd-yellow/20" : "bg-neutral-100")}>{formatAmount(yearTotal(year))}</td>
                              <td className={cn("border-t", year === transferCurrentYear ? "bg-crafd-yellow/20" : "bg-neutral-100")} />
                            </Fragment>
                          ))}
                          <td className="px-3 py-3 border-l border-t text-right tabular-nums bg-neutral-100">{formatAmount(grandTotal)}</td>
                          <td className="border-l border-t bg-neutral-100" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })()

        ) : params.section === "complementary" ? (
          (() => {
            const activityById = new Map(complementaryActivities.map((a) => [a.id, a]));
            const cellAmount = (row: ComplementaryMatrixRow, year: number) => {
              const raw = year === complementaryCurrentYear
                ? complementaryStates[row.contributor_id]?.contribution_amount
                : row.byYear[year]?.contribution_amount;
              const v = Number(raw);
              return raw == null || raw === "" || Number.isNaN(v) ? 0 : v;
            };
            const rowSubtotal = (row: ComplementaryMatrixRow) => complementaryYears.reduce((s, y) => s + cellAmount(row, y), 0);
            const yearTotal = (year: number) => complementaryRows.reduce((s, r) => s + cellAmount(r, year), 0);
            const grandTotal = complementaryRows.reduce((s, r) => s + rowSubtotal(r), 0);

            return (
              <div className="space-y-4">
                {/* Add a contributor (project-scoped, created by the partner) */}
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder={labels.placeholders.complementaryContributorName}
                    value={newComplementaryName}
                    onChange={(e) => setNewComplementaryName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newComplementaryName.trim()) handleComplementaryAdd(); }}
                    className="flex-1 min-w-[220px]"
                  />
                  <Input
                    placeholder={labels.placeholders.complementaryWebsite}
                    value={newComplementaryWebsite}
                    onChange={(e) => setNewComplementaryWebsite(e.target.value)}
                    className="flex-1 min-w-[180px]"
                  />
                  <Select value={newComplementaryType || "none"} onValueChange={(v) => setNewComplementaryType(v === "none" ? "" : v)}>
                    <SelectTrigger className="w-[200px] h-9">
                      {newComplementaryType
                        ? <Badge colors={FUNDING_TYPE_COLORS[newComplementaryType] ?? FALLBACK_COLORS}>{newComplementaryType}</Badge>
                        : <span className="text-muted-foreground">{labels.complementary.selectFundingType}</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none"><span className="text-muted-foreground">{labels.complementary.selectFundingType}</span></SelectItem>
                      {FUNDING_TYPES.map((t) => (<SelectItem key={t} value={t}><Badge colors={FUNDING_TYPE_COLORS[t] ?? FALLBACK_COLORS}>{t}</Badge></SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleComplementaryAdd} disabled={addingComplementary || !newComplementaryName.trim()} size="sm" className="shrink-0">
                    {addingComplementary ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{labels.adminEditor.add}</>}
                  </Button>
                </div>

                {complementaryRows.length === 0 ? (
                  <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                    {labels.complementary.empty}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border bg-card">
                    <table className="text-sm border-separate border-spacing-0" style={{ minWidth: TRANSFER_FROZEN_WIDTH }}>
                      <thead>
                        {/* Year-group header */}
                        <tr className="text-xs">
                          <th rowSpan={2} style={tfz("org", 30)} className="text-left px-3 py-2 font-medium text-muted-foreground border-r border-b bg-neutral-100 align-bottom">
                            {labels.complementary.columns.contributorName}
                          </th>
                          <th rowSpan={2} style={tfz("website", 30)} className="text-left px-3 py-2 font-medium text-muted-foreground border-r border-b bg-neutral-100 align-bottom">
                            {labels.complementary.columns.website}
                          </th>
                          <th rowSpan={2} style={tfz("type", 30)} className="text-left px-3 py-2 font-medium text-muted-foreground border-r border-b bg-neutral-100 align-bottom">
                            {labels.complementary.columns.fundingType}
                          </th>
                          {complementaryYears.map((year) => (
                            <th
                              key={year}
                              colSpan={2}
                              className={cn(
                                "px-2 py-2 text-center font-semibold text-muted-foreground border-l border-b",
                                year === complementaryCurrentYear ? "bg-crafd-yellow/20" : "bg-neutral-100"
                              )}
                            >
                              {year}
                            </th>
                          ))}
                          <th rowSpan={2} className="px-3 py-2 text-right font-medium text-muted-foreground border-l border-b bg-neutral-100 align-bottom min-w-[150px]">
                            {labels.complementary.columns.subTotal}
                          </th>
                          <th rowSpan={2} className="px-2 py-2 border-l border-b bg-neutral-100 w-12" />
                        </tr>
                        {/* Sub-column header */}
                        <tr className="text-[11px] text-muted-foreground">
                          {complementaryYears.map((year) => {
                            const current = year === complementaryCurrentYear;
                            const bg = current ? "bg-crafd-yellow/20" : "bg-neutral-50";
                            return (
                              <Fragment key={year}>
                                <th className={cn("px-2 py-1.5 text-left font-medium border-l border-b min-w-[150px]", bg)}>{labels.complementary.columns.contributionAmount}</th>
                                <th className={cn("px-2 py-1.5 text-left font-medium border-b min-w-[240px]", bg)}>{labels.complementary.columns.linkedActivities}</th>
                              </Fragment>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {complementaryRows.map((row) => {
                          const state = complementaryStates[row.contributor_id];
                          if (!state) return null;
                          const dirty = state.masterDirty || state.cellDirty;
                          return (
                            <tr key={row.contributor_id} className="align-top">
                              {/* Frozen: contributor identity (master, editable anytime) */}
                              <td style={tfz("org")} className={cn("px-2 py-1 border-r border-t bg-card", dirty && "bg-amber-50/60")}>
                                <Input value={state.contributor_name} onChange={(e) => updateComplementaryMaster(row.contributor_id, { contributor_name: e.target.value })} placeholder={labels.placeholders.complementaryContributorName} className="text-sm h-8" />
                              </td>
                              <td style={tfz("website")} className={cn("px-2 py-1 border-r border-t bg-card", dirty && "bg-amber-50/60")}>
                                <Input value={state.website} onChange={(e) => updateComplementaryMaster(row.contributor_id, { website: e.target.value })} placeholder={labels.placeholders.complementaryWebsite} className="text-sm h-8" />
                              </td>
                              <td style={tfz("type")} className={cn("px-2 py-1 border-r border-t bg-card", dirty && "bg-amber-50/60")}>
                                <Select value={state.funding_type || "none"} onValueChange={(v) => updateComplementaryMaster(row.contributor_id, { funding_type: v === "none" ? null : v })}>
                                  <SelectTrigger className="w-full h-8 px-2">
                                    {state.funding_type
                                      ? <Badge colors={FUNDING_TYPE_COLORS[state.funding_type] ?? FALLBACK_COLORS}>{state.funding_type}</Badge>
                                      : <span className="text-muted-foreground">{labels.complementary.selectFundingType}</span>}
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none"><span className="text-muted-foreground">{labels.complementary.selectFundingType}</span></SelectItem>
                                    {FUNDING_TYPES.map((t) => (<SelectItem key={t} value={t}><Badge colors={FUNDING_TYPE_COLORS[t] ?? FALLBACK_COLORS}>{t}</Badge></SelectItem>))}
                                  </SelectContent>
                                </Select>
                              </td>

                              {/* Scrollable per-year cells */}
                              {complementaryYears.map((year) => {
                                const current = year === complementaryCurrentYear;
                                if (current) {
                                  return (
                                    <Fragment key={year}>
                                      <td className="px-1 py-1 border-l border-t bg-crafd-yellow/10">
                                        <Input type="number" min={0} value={state.contribution_amount} onChange={(e) => updateComplementaryCell(row.contributor_id, { contribution_amount: e.target.value })} placeholder={labels.placeholders.complementaryAmount} className="text-sm h-8 text-right tabular-nums" />
                                      </td>
                                      <td className="px-1 py-1 border-t bg-crafd-yellow/10">
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <button className="w-full min-h-8 rounded-md border bg-background px-2 py-1 text-left text-xs hover:bg-accent/40 flex flex-col gap-0.5">
                                              {state.linked_activity_ids.length === 0
                                                ? <span className="text-muted-foreground py-0.5">{labels.complementary.selectActivities}</span>
                                                : state.linked_activity_ids.map((aid) => (
                                                    <span key={aid} className="line-clamp-1 font-medium">{activityLabel(activityById.get(aid))}</span>
                                                  ))}
                                            </button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="start" className="max-h-72 w-[380px] overflow-auto">
                                            {complementaryActivities.length === 0 && (
                                              <div className="px-2 py-1.5 text-xs text-muted-foreground">No workplan activities yet.</div>
                                            )}
                                            {complementaryActivities.map((a) => (
                                              <DropdownMenuCheckboxItem
                                                key={a.id}
                                                checked={state.linked_activity_ids.includes(a.id)}
                                                onCheckedChange={() => toggleComplementaryActivity(row.contributor_id, a.id)}
                                                onSelect={(e) => e.preventDefault()}
                                                className="text-xs"
                                              >
                                                <span className="line-clamp-2">{activityLabel(a)}</span>
                                              </DropdownMenuCheckboxItem>
                                            ))}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </td>
                                    </Fragment>
                                  );
                                }
                                const cell = row.byYear[year];
                                return (
                                  <Fragment key={year}>
                                    <td className="px-2 py-2 border-l border-t text-muted-foreground text-right tabular-nums">
                                      {cell?.contribution_amount != null ? formatAmount(cell.contribution_amount) : <span className="text-muted-foreground/40">—</span>}
                                    </td>
                                    <td className="px-2 py-2 border-t text-muted-foreground">
                                      {cell && cell.linked_activity_ids.length > 0
                                        ? (
                                          <div className="flex flex-col gap-0.5">
                                            {cell.linked_activity_ids.map((aid) => (
                                              <span key={aid} className="line-clamp-1 text-xs font-medium">{activityLabel(activityById.get(aid))}</span>
                                            ))}
                                          </div>
                                        )
                                        : <span className="text-muted-foreground/40">—</span>}
                                    </td>
                                  </Fragment>
                                );
                              })}

                              {/* Sub-total across all years */}
                              <td className="px-3 py-2 border-l border-t text-right font-medium tabular-nums bg-muted/20">
                                {formatAmount(rowSubtotal(row))}
                              </td>
                              <td className="px-2 py-2 border-l border-t text-center">
                                <button onClick={() => handleComplementaryDelete(row)} disabled={deletingComplementaryId === row.contributor_id} className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40" aria-label="Delete contribution">
                                  {deletingComplementaryId === row.contributor_id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="text-sm font-semibold">
                          <td style={tfz("org", 30)} className="px-3 py-3 border-r border-t bg-neutral-100 whitespace-nowrap">{labels.complementary.columns.total}</td>
                          <td style={tfz("website", 30)} className="border-r border-t bg-neutral-100" />
                          <td style={tfz("type", 30)} className="border-r border-t bg-neutral-100" />
                          {complementaryYears.map((year) => (
                            <Fragment key={year}>
                              <td className={cn("px-2 py-3 border-l border-t text-right tabular-nums", year === complementaryCurrentYear ? "bg-crafd-yellow/20" : "bg-neutral-100")}>{formatAmount(yearTotal(year))}</td>
                              <td className={cn("border-t", year === complementaryCurrentYear ? "bg-crafd-yellow/20" : "bg-neutral-100")} />
                            </Fragment>
                          ))}
                          <td className="px-3 py-3 border-l border-t text-right tabular-nums bg-neutral-100">{formatAmount(grandTotal)}</td>
                          <td className="border-l border-t bg-neutral-100" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })()

        ) : params.section in SECTION_SPECS ? (
          reportId ? (
            <SectionTableEditor
              key={params.section}
              reportId={reportId}
              spec={SECTION_SPECS[params.section]}
              onSaveStateChange={setChildSaveState}
            />
          ) : null

        ) : params.section === "workplan" ? (
          reportId && selectedReport ? (
            <WorkplanAdminEditor
              projectId={selectedReport.project_id}
              reportId={reportId}
              defaultAgent={selectedReport.partner_short_name}
              onSaveStateChange={setChildSaveState}
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
      </div>
    </div>
  );
}
