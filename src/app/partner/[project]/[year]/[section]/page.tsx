"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { Loader2, FileQuestion, CheckCircle2, Save, ShieldCheck, ChevronRight, ChevronDown, Trash2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";
import {
  likelihoodLabel,
  impactLabel,
  riskLevelLabel,
  computeRiskLevelKey,
  SCALE_COLORS,
  RISK_LEVEL_COLORS,
  FALLBACK_COLORS,
} from "@/lib/risk";

const SECTIONS = [
  { value: "overview", label: labels.sections.overview },
  { value: "surveys", label: labels.sections.surveys },
  { value: "achievements", label: labels.sections.keyAchievements },
  { value: "partnerships", label: labels.sections.partnerships },
  { value: "results", label: labels.sections.results },
  { value: "lessons", label: labels.sections.lessons },
  { value: "external-coverage", label: labels.sections.externalCoverage },
  { value: "risk", label: labels.sections.risk },
];

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

function Label({ children }: { children: string }) {
  return <p className="text-xs text-muted-foreground mb-1.5">{children}</p>;
}

function MultiLinkInput({ links, onAdd, onRemove, onUpdate, placeholder }: {
  links: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      {links.map((link, li) => (
        <div key={li} className="flex items-center gap-1.5">
          <Input
            value={link}
            onChange={(e) => onUpdate(li, e.target.value)}
            placeholder={placeholder}
            className="text-sm"
          />
          {links.length > 1 && (
            <button
              onClick={() => onRemove(li)}
              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
              aria-label="Remove link"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onAdd}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-0.5"
      >
        <Plus className="size-3" /> Add link
      </button>
    </div>
  );
}

interface Report {
  id: number;
  year: number;
  report_type: "annual" | "final" | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
  report_submission_date: string | null;
  mptfo_project_number: string | null;
  grant_size_usd: string | null;
  project_duration: number | null;
  geographic_scope: string | null;
  project_start_date: string | null;
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
  project_duration_months: string;
  grant_size_usd: string;
  implementing_partners: string;
  geographic_scope: string;
  report_submission_date: string;
  starting_date: string;
  end_date: string;
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

interface KeyAchievement {
  id: number;
  report_id: number;
  achievement: string | null;
  significance: string | null;
  links: string | null;
  sort_order: number;
}

interface KAState {
  id: number | null;
  achievement: string;
  significance: string;
  links: string[];
  dirty: boolean;
}

interface Partnership {
  id: number;
  report_id: number;
  partner_organization: string | null;
  result: string | null;
  links: string | null;
  sort_order: number;
}

interface PartnershipState {
  id: number | null;
  partner_organization: string;
  result: string;
  links: string[];
  dirty: boolean;
}

interface Result {
  id: number;
  report_id: number;
  context: string | null;
  data_driven_decision: string | null;
  resulting_impact: string | null;
  links: string | null;
  sort_order: number;
}

interface ResultState {
  id: number | null;
  context: string;
  data_driven_decision: string;
  resulting_impact: string;
  links: string[];
  dirty: boolean;
}

interface LessonLearned {
  id: number;
  report_id: number;
  category: string | null;
  lesson_learned: string | null;
  adjustment_informed: string | null;
  sort_order: number;
}

interface LessonState {
  id: number | null;
  category: string;
  lesson_learned: string;
  adjustment_informed: string;
  dirty: boolean;
}

interface ExternalCoverage {
  id: number;
  report_id: number;
  type: string | null;
  description: string | null;
  reach_indicator: string | null;
  links: string | null;
  sort_order: number;
}

interface CoverageState {
  id: number | null;
  type: string;
  description: string;
  reach_indicator: string;
  links: string[];
  dirty: boolean;
}

const EMPTY_OVERVIEW: OverviewData = {
  project_title: "",
  mptfo_project_number: "",
  organization_name: "",
  organization_website: "",
  project_duration_months: "",
  grant_size_usd: "",
  implementing_partners: "",
  geographic_scope: "",
  report_submission_date: "",
  starting_date: "",
  end_date: "",
  project_lead: "",
  authorized: false,
};

function toSlug(r: Report): string {
  return (r.project_short_name ?? r.project_title).toLowerCase();
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

  const [kaRows, setKARows] = useState<KAState[]>([]);
  const [loadingKA, setLoadingKA] = useState(false);

  const [partnerRows, setPartnerRows] = useState<PartnershipState[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);

  const [resultRows, setResultRows] = useState<ResultState[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  const [lessonRows, setLessonRows] = useState<LessonState[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);

  const [coverageRows, setCoverageRows] = useState<CoverageState[]>([]);
  const [loadingCoverage, setLoadingCoverage] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
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
          project_duration_months: data.project_duration_months != null ? String(data.project_duration_months) : "",
          grant_size_usd: data.grant_size_usd != null ? String(data.grant_size_usd) : "",
          implementing_partners: data.implementing_partners ?? "",
          geographic_scope: data.geographic_scope ?? "",
          report_submission_date: data.report_submission_date?.slice(0, 10) ?? "",
          starting_date: data.starting_date?.slice(0, 10) ?? "",
          end_date: data.end_date?.slice(0, 10) ?? "",
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

  const loadKeyAchievements = useCallback(async (id: number) => {
    setLoadingKA(true);
    setError(null);
    try {
      const res = await fetch(`/api/achievements?reportId=${id}`);
      if (!res.ok) throw new Error("Failed to load key achievements");
      const data: KeyAchievement[] = await res.json();
      setKARows(data.map((r) => ({
        id: r.id,
        achievement: r.achievement ?? "",
        significance: r.significance ?? "",
        links: r.links ? r.links.split(",").map((l) => l.trim()).filter(Boolean) : [""],
        dirty: false,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingKA(false);
    }
  }, []);

  const loadPartnerships = useCallback(async (id: number) => {
    setLoadingPartners(true);
    setError(null);
    try {
      const res = await fetch(`/api/partnerships?reportId=${id}`);
      if (!res.ok) throw new Error("Failed to load partnerships");
      const data: Partnership[] = await res.json();
      setPartnerRows(data.map((r) => ({
        id: r.id,
        partner_organization: r.partner_organization ?? "",
        result: r.result ?? "",
        links: r.links ? r.links.split(",").map((l) => l.trim()).filter(Boolean) : [""],
        dirty: false,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingPartners(false);
    }
  }, []);

  const emptyResultRow = (): ResultState => ({
    id: null, context: "", data_driven_decision: "", resulting_impact: "", links: [""], dirty: false,
  });

  const loadResults = useCallback(async (id: number) => {
    setLoadingResults(true);
    setError(null);
    try {
      const res = await fetch(`/api/results?reportId=${id}`);
      if (!res.ok) throw new Error("Failed to load results");
      const data: Result[] = await res.json();
      const loaded: ResultState[] = data.map((r) => ({
        id: r.id,
        context: r.context ?? "",
        data_driven_decision: r.data_driven_decision ?? "",
        resulting_impact: r.resulting_impact ?? "",
        links: r.links ? r.links.split(",").map((l) => l.trim()).filter(Boolean) : [""],
        dirty: false,
      }));
      while (loaded.length < 3) loaded.push(emptyResultRow());
      setResultRows(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingResults(false);
    }
  }, []);

  const loadLessons = useCallback(async (id: number) => {
    setLoadingLessons(true);
    setError(null);
    try {
      const res = await fetch(`/api/lessons-learned?reportId=${id}`);
      if (!res.ok) throw new Error("Failed to load lessons");
      const data: LessonLearned[] = await res.json();
      setLessonRows(data.map((r) => ({
        id: r.id,
        category: r.category ?? "",
        lesson_learned: r.lesson_learned ?? "",
        adjustment_informed: r.adjustment_informed ?? "",
        dirty: false,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingLessons(false);
    }
  }, []);

  const emptyCoverageRow = (): CoverageState => ({
    id: null, type: "", description: "", reach_indicator: "", links: [""], dirty: false,
  });

  const loadCoverage = useCallback(async (id: number) => {
    setLoadingCoverage(true);
    setError(null);
    try {
      const res = await fetch(`/api/external-coverage?reportId=${id}`);
      if (!res.ok) throw new Error("Failed to load external coverage");
      const data: ExternalCoverage[] = await res.json();
      const loaded: CoverageState[] = data.map((r) => ({
        id: r.id,
        type: r.type ?? "",
        description: r.description ?? "",
        reach_indicator: r.reach_indicator ?? "",
        links: r.links ? r.links.split(",").map((l) => l.trim()).filter(Boolean) : [""],
        dirty: false,
      }));
      while (loaded.length < 3) loaded.push(emptyCoverageRow());
      setCoverageRows(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingCoverage(false);
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
            project_duration_months: match.project_duration != null ? String(match.project_duration) : "",
            grant_size_usd: match.grant_size_usd != null ? String(match.grant_size_usd) : "",
            implementing_partners: "",
            geographic_scope: match.geographic_scope || "",
            report_submission_date: match.report_submission_date?.slice(0, 10) || "",
            starting_date: match.project_start_date?.slice(0, 10) || "",
            end_date: "",
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
    setSaveSuccess(false);
    if (params.section === "surveys") loadSurveys(reportId);
    else if (params.section === "overview") loadOverview(reportId);
    else if (params.section === "risk") loadRisk(reportId);
    else if (params.section === "achievements") loadKeyAchievements(reportId);
    else if (params.section === "partnerships") loadPartnerships(reportId);
    else if (params.section === "results") loadResults(reportId);
    else if (params.section === "lessons") loadLessons(reportId);
    else if (params.section === "external-coverage") loadCoverage(reportId);
  }, [reportId, params.section, loadSurveys, loadOverview, loadRisk, loadKeyAchievements, loadPartnerships, loadResults, loadLessons, loadCoverage]);

  function handleReportChange(val: string) {
    const report = reports.find((r) => String(r.id) === val);
    if (!report) return;
    router.push(`/partner/${toSlug(report)}/${report.year}/${params.section}`);
  }

  function updateRow(id: number, patch: Partial<RowState>) {
    setSaveSuccess(false);
    setRowStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch, dirty: true } }));
  }

  function updateOverview(patch: Partial<OverviewData>) {
    setSaveSuccess(false);
    setOverview((prev) => ({ ...prev, ...patch }));
    setOverviewDirty(true);
  }

  function updateRisk(id: number, patch: Partial<RiskState>) {
    setSaveSuccess(false);
    setRiskStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch, dirty: true } }));
  }

  function addKARow() {
    if (kaRows.length >= 3) return;
    setSaveSuccess(false);
    setKARows((prev) => [...prev, { id: null, achievement: "", significance: "", links: [""], dirty: true }]);
  }

  function updateKARow(index: number, patch: Partial<KAState>) {
    setSaveSuccess(false);
    setKARows((prev) => prev.map((r, i) => i === index ? { ...r, ...patch, dirty: true } : r));
  }

  function addKALink(rowIndex: number) {
    setSaveSuccess(false);
    setKARows((prev) => prev.map((r, i) =>
      i === rowIndex ? { ...r, links: [...r.links, ""], dirty: true } : r
    ));
  }

  function removeKALink(rowIndex: number, linkIndex: number) {
    setSaveSuccess(false);
    setKARows((prev) => prev.map((r, i) =>
      i === rowIndex ? { ...r, links: r.links.filter((_, li) => li !== linkIndex), dirty: true } : r
    ));
  }

  function updateKALink(rowIndex: number, linkIndex: number, value: string) {
    setSaveSuccess(false);
    setKARows((prev) => prev.map((r, i) =>
      i === rowIndex ? { ...r, links: r.links.map((l, li) => li === linkIndex ? value : l), dirty: true } : r
    ));
  }

  async function deleteKARow(index: number, id: number | null) {
    if (id !== null) {
      await fetch(`/api/achievements?id=${id}`, { method: "DELETE" });
    }
    setKARows((prev) => prev.filter((_, i) => i !== index));
  }

  function addPartnerRow() {
    setSaveSuccess(false);
    setPartnerRows((prev) => [...prev, { id: null, partner_organization: "", result: "", links: [""], dirty: true }]);
  }

  function updatePartnerRow(index: number, patch: Partial<PartnershipState>) {
    setSaveSuccess(false);
    setPartnerRows((prev) => prev.map((r, i) => i === index ? { ...r, ...patch, dirty: true } : r));
  }

  function addPartnerLink(rowIndex: number) {
    setSaveSuccess(false);
    setPartnerRows((prev) => prev.map((r, i) =>
      i === rowIndex ? { ...r, links: [...r.links, ""], dirty: true } : r
    ));
  }

  function removePartnerLink(rowIndex: number, linkIndex: number) {
    setSaveSuccess(false);
    setPartnerRows((prev) => prev.map((r, i) =>
      i === rowIndex ? { ...r, links: r.links.filter((_, li) => li !== linkIndex), dirty: true } : r
    ));
  }

  function updatePartnerLink(rowIndex: number, linkIndex: number, value: string) {
    setSaveSuccess(false);
    setPartnerRows((prev) => prev.map((r, i) =>
      i === rowIndex ? { ...r, links: r.links.map((l, li) => li === linkIndex ? value : l), dirty: true } : r
    ));
  }

  async function deletePartnerRow(index: number, id: number | null) {
    if (id !== null) {
      await fetch(`/api/partnerships?id=${id}`, { method: "DELETE" });
    }
    setPartnerRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addResultRow() {
    setSaveSuccess(false);
    setResultRows((prev) => [...prev, { id: null, context: "", data_driven_decision: "", resulting_impact: "", links: [""], dirty: true }]);
  }

  function updateResultRow(index: number, patch: Partial<ResultState>) {
    setSaveSuccess(false);
    setResultRows((prev) => prev.map((r, i) => i === index ? { ...r, ...patch, dirty: true } : r));
  }

  function addResultLink(rowIndex: number) {
    setSaveSuccess(false);
    setResultRows((prev) => prev.map((r, i) =>
      i === rowIndex ? { ...r, links: [...r.links, ""], dirty: true } : r
    ));
  }

  function removeResultLink(rowIndex: number, linkIndex: number) {
    setSaveSuccess(false);
    setResultRows((prev) => prev.map((r, i) =>
      i === rowIndex ? { ...r, links: r.links.filter((_, li) => li !== linkIndex), dirty: true } : r
    ));
  }

  function updateResultLink(rowIndex: number, linkIndex: number, value: string) {
    setSaveSuccess(false);
    setResultRows((prev) => prev.map((r, i) =>
      i === rowIndex ? { ...r, links: r.links.map((l, li) => li === linkIndex ? value : l), dirty: true } : r
    ));
  }

  async function deleteResultRow(index: number, id: number | null) {
    if (id !== null) {
      await fetch(`/api/results?id=${id}`, { method: "DELETE" });
    }
    setResultRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addLessonRow() {
    if (lessonRows.length >= 5) return;
    setSaveSuccess(false);
    setLessonRows((prev) => [...prev, { id: null, category: "", lesson_learned: "", adjustment_informed: "", dirty: true }]);
  }

  function updateLessonRow(index: number, patch: Partial<LessonState>) {
    setSaveSuccess(false);
    setLessonRows((prev) => prev.map((r, i) => i === index ? { ...r, ...patch, dirty: true } : r));
  }

  async function deleteLessonRow(index: number, id: number | null) {
    if (id !== null) {
      await fetch(`/api/lessons-learned?id=${id}`, { method: "DELETE" });
    }
    setLessonRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addCoverageRow() {
    setSaveSuccess(false);
    setCoverageRows((prev) => [...prev, { id: null, type: "", description: "", reach_indicator: "", links: [""], dirty: true }]);
  }

  function updateCoverageRow(index: number, patch: Partial<CoverageState>) {
    setSaveSuccess(false);
    setCoverageRows((prev) => prev.map((r, i) => i === index ? { ...r, ...patch, dirty: true } : r));
  }

  function addCoverageLink(rowIndex: number) {
    setSaveSuccess(false);
    setCoverageRows((prev) => prev.map((r, i) =>
      i === rowIndex ? { ...r, links: [...r.links, ""], dirty: true } : r
    ));
  }

  function removeCoverageLink(rowIndex: number, linkIndex: number) {
    setSaveSuccess(false);
    setCoverageRows((prev) => prev.map((r, i) =>
      i === rowIndex ? { ...r, links: r.links.filter((_, li) => li !== linkIndex), dirty: true } : r
    ));
  }

  function updateCoverageLink(rowIndex: number, linkIndex: number, value: string) {
    setSaveSuccess(false);
    setCoverageRows((prev) => prev.map((r, i) =>
      i === rowIndex ? { ...r, links: r.links.map((l, li) => li === linkIndex ? value : l), dirty: true } : r
    ));
  }

  async function deleteCoverageRow(index: number, id: number | null) {
    if (id !== null) {
      await fetch(`/api/external-coverage?id=${id}`, { method: "DELETE" });
    }
    setCoverageRows((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleCollapse(id: number) {
    setCollapsedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    try {
      if (params.section === "surveys") {
        const dirtyIds = surveys.filter((s) => rowStates[s.id]?.dirty).map((s) => s.id);
        await Promise.all(
          dirtyIds.map((id) => {
            const state = rowStates[id];
            return fetch("/api/surveys", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, assessment: state.assessment, context: state.context || null }),
            }).then((r) => { if (!r.ok) throw new Error(`Failed to save row ${id}`); });
          })
        );
        setRowStates((prev) => {
          const next = { ...prev };
          for (const id of dirtyIds) next[id] = { ...next[id], dirty: false };
          return next;
        });
      } else if (params.section === "overview" && reportId) {
        const res = await fetch("/api/overview", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId, ...overview }),
        });
        if (!res.ok) throw new Error("Failed to save overview");
        setOverviewDirty(false);
      } else if (params.section === "risk") {
        const dirtyIds = risks.filter((r) => riskStates[r.id]?.dirty).map((r) => r.id);
        await Promise.all(
          dirtyIds.map((id) => {
            const state = riskStates[id];
            return fetch("/api/risk", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id,
                likelihood: state.likelihood,
                impact: state.impact,
                updated_mitigation: state.updated_mitigation || null,
                project_revision: state.project_revision,
              }),
            }).then((r) => { if (!r.ok) throw new Error(`Failed to save risk ${id}`); });
          })
        );
        setRiskStates((prev) => {
          const next = { ...prev };
          for (const id of dirtyIds) next[id] = { ...next[id], dirty: false };
          return next;
        });
      } else if (params.section === "achievements" && reportId) {
        const updated: KAState[] = [];
        for (const row of kaRows) {
          if (row.id === null) {
            const res = await fetch("/api/achievements", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reportId,
                achievement: row.achievement || null,
                significance: row.significance || null,
                links: row.links.filter((l) => l.trim()).join(",") || null,
              }),
            });
            if (!res.ok) throw new Error("Failed to save achievement");
            const saved: KeyAchievement = await res.json();
            updated.push({ ...row, id: saved.id, dirty: false });
          } else if (row.dirty) {
            const res = await fetch("/api/achievements", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: row.id,
                achievement: row.achievement || null,
                significance: row.significance || null,
                links: row.links.filter((l) => l.trim()).join(",") || null,
              }),
            });
            if (!res.ok) throw new Error(`Failed to save achievement ${row.id}`);
            updated.push({ ...row, dirty: false });
          } else {
            updated.push(row);
          }
        }
        setKARows(updated);
      } else if (params.section === "partnerships" && reportId) {
        const updated: PartnershipState[] = [];
        for (const row of partnerRows) {
          const linksStr = row.links.filter((l) => l.trim()).join(",") || null;
          if (row.id === null) {
            const res = await fetch("/api/partnerships", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reportId,
                partner_organization: row.partner_organization || null,
                result: row.result || null,
                links: linksStr,
              }),
            });
            if (!res.ok) throw new Error("Failed to save partner");
            const saved: Partnership = await res.json();
            updated.push({ ...row, id: saved.id, dirty: false });
          } else if (row.dirty) {
            const res = await fetch("/api/partnerships", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: row.id,
                partner_organization: row.partner_organization || null,
                result: row.result || null,
                links: linksStr,
              }),
            });
            if (!res.ok) throw new Error(`Failed to save partner ${row.id}`);
            updated.push({ ...row, dirty: false });
          } else {
            updated.push(row);
          }
        }
        setPartnerRows(updated);
      } else if (params.section === "results" && reportId) {
        const updated: ResultState[] = [];
        for (const row of resultRows) {
          const linksStr = row.links.filter((l) => l.trim()).join(",") || null;
          if (row.id === null && row.dirty) {
            const res = await fetch("/api/results", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reportId,
                context: row.context || null,
                data_driven_decision: row.data_driven_decision || null,
                resulting_impact: row.resulting_impact || null,
                links: linksStr,
              }),
            });
            if (!res.ok) throw new Error("Failed to save result");
            const saved: Result = await res.json();
            updated.push({ ...row, id: saved.id, dirty: false });
          } else if (row.id !== null && row.dirty) {
            const res = await fetch("/api/results", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: row.id,
                context: row.context || null,
                data_driven_decision: row.data_driven_decision || null,
                resulting_impact: row.resulting_impact || null,
                links: linksStr,
              }),
            });
            if (!res.ok) throw new Error(`Failed to save result ${row.id}`);
            updated.push({ ...row, dirty: false });
          } else {
            updated.push(row);
          }
        }
        setResultRows(updated);
      } else if (params.section === "lessons" && reportId) {
        const updated: LessonState[] = [];
        for (const row of lessonRows) {
          if (row.id === null && row.dirty) {
            const res = await fetch("/api/lessons-learned", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reportId,
                category: row.category || null,
                lesson_learned: row.lesson_learned || null,
                adjustment_informed: row.adjustment_informed || null,
              }),
            });
            if (!res.ok) throw new Error("Failed to save lesson");
            const saved: LessonLearned = await res.json();
            updated.push({ ...row, id: saved.id, dirty: false });
          } else if (row.id !== null && row.dirty) {
            const res = await fetch("/api/lessons-learned", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: row.id,
                category: row.category || null,
                lesson_learned: row.lesson_learned || null,
                adjustment_informed: row.adjustment_informed || null,
              }),
            });
            if (!res.ok) throw new Error(`Failed to save lesson ${row.id}`);
            updated.push({ ...row, dirty: false });
          } else {
            updated.push(row);
          }
        }
        setLessonRows(updated);
      } else if (params.section === "external-coverage" && reportId) {
        const updated: CoverageState[] = [];
        for (const row of coverageRows) {
          const linksStr = row.links.filter((l) => l.trim()).join(",") || null;
          if (row.id === null && row.dirty) {
            const res = await fetch("/api/external-coverage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reportId,
                type: row.type || null,
                description: row.description || null,
                reach_indicator: row.reach_indicator || null,
                links: linksStr,
              }),
            });
            if (!res.ok) throw new Error("Failed to save coverage");
            const saved: ExternalCoverage = await res.json();
            updated.push({ ...row, id: saved.id, dirty: false });
          } else if (row.id !== null && row.dirty) {
            const res = await fetch("/api/external-coverage", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: row.id,
                type: row.type || null,
                description: row.description || null,
                reach_indicator: row.reach_indicator || null,
                links: linksStr,
              }),
            });
            if (!res.ok) throw new Error(`Failed to save coverage ${row.id}`);
            updated.push({ ...row, dirty: false });
          } else {
            updated.push(row);
          }
        }
        setCoverageRows(updated);
      }
      setSaveSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const selectedReport = reports.find(
    (r) => toSlug(r) === params.project && String(r.year) === params.year
  );
  const sectionLoading =
    params.section === "surveys" ? loadingSurveys :
    params.section === "overview" ? loadingOverview :
    params.section === "risk" ? loadingRisk :
    params.section === "achievements" ? loadingKA :
    params.section === "partnerships" ? loadingPartners :
    params.section === "results" ? loadingResults :
    params.section === "lessons" ? loadingLessons :
    params.section === "external-coverage" ? loadingCoverage : false;
  const anyDirty =
    params.section === "surveys" ? surveys.some((s) => rowStates[s.id]?.dirty) :
    params.section === "overview" ? overviewDirty :
    params.section === "risk" ? risks.some((r) => riskStates[r.id]?.dirty) :
    params.section === "achievements" ? kaRows.some((r) => r.dirty) :
    params.section === "partnerships" ? partnerRows.some((r) => r.dirty) :
    params.section === "results" ? resultRows.some((r) => r.dirty) :
    params.section === "lessons" ? lessonRows.some((r) => r.dirty) :
    params.section === "external-coverage" ? coverageRows.some((r) => r.dirty) : false;
  const notFound = !loadingReports && !selectedReport;

  const overviewEmptyCount = useMemo(() => {
    const requiredFields: (keyof OverviewData)[] = [
      "project_title", "mptfo_project_number", "organization_name", "organization_website",
      "project_duration_months", "grant_size_usd", "geographic_scope", "report_submission_date", "starting_date",
    ];
    return requiredFields.filter((field) => !overview[field]).length;
  }, [overview]);

  const surveysEmptyCount = useMemo(
    () => surveys.filter((s) => rowStates[s.id]?.assessment === null).length,
    [surveys, rowStates]
  );

  const riskEmptyCount = useMemo(
    () => risks.filter((r) => riskStates[r.id]?.likelihood === null || riskStates[r.id]?.impact === null).length,
    [risks, riskStates]
  );

  const kaEmptyCount = useMemo(
    () => kaRows.filter((r) => !r.achievement.trim()).length,
    [kaRows]
  );

  const partnersEmptyCount = useMemo(
    () => partnerRows.filter((r) => !r.partner_organization.trim()).length,
    [partnerRows]
  );

  const resultsEmptyCount = useMemo(
    () => resultRows.filter((r) => !r.context.trim()).length,
    [resultRows]
  );

  const lessonsEmptyCount = useMemo(
    () => lessonRows.filter((r) => !r.lesson_learned.trim()).length,
    [lessonRows]
  );

  const coverageEmptyCount = useMemo(
    () => coverageRows.filter((r) => !r.description.trim()).length,
    [coverageRows]
  );

  function getEmptyCount(sec: string) {
    if (sec === "overview") return overviewEmptyCount;
    if (sec === "surveys") return surveysEmptyCount;
    if (sec === "risk") return riskEmptyCount;
    if (sec === "achievements") return kaEmptyCount;
    if (sec === "partnerships") return partnersEmptyCount;
    if (sec === "results") return resultsEmptyCount;
    if (sec === "lessons") return lessonsEmptyCount;
    if (sec === "external-coverage") return coverageEmptyCount;
    return 0;
  }

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Top bar */}
      <div className="bg-neutral-950 text-white px-8 h-32 flex items-center justify-between shrink-0">
        <div>
          <p className="text-neutral-400 text-sm mb-1">{labels.partnerEditor.eyebrow}</p>
          <h1 className="text-2xl font-bold font-qanelas">{labels.partnerEditor.title}</h1>
        </div>

        <div className="flex items-center gap-3">
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

          {reportId && !sectionLoading && (
            saveSuccess ? (
              <span className="flex items-center gap-1.5 text-green-400 text-sm">
                <CheckCircle2 className="size-4" /> {labels.partnerEditor.saved}
              </span>
            ) : (
              <Button
                onClick={saveAll}
                disabled={!anyDirty || saving}
                size="sm"
                className="bg-crafd-yellow text-black hover:bg-crafd-yellow/90 disabled:opacity-40"
              >
                {saving
                  ? <><Loader2 className="size-3.5 animate-spin mr-1.5" /> {labels.partnerEditor.saving}</>
                  : <><Save className="size-3.5 mr-1.5" /> {labels.partnerEditor.saveChanges}</>}
              </Button>
            )
          )}
        </div>
      </div>

      {/* Section tabs */}
      <div className="border-b px-8 flex gap-1 shrink-0 bg-background">
        {SECTIONS.map((sec) => {
          const emptyCount = getEmptyCount(sec.value);
          return (
            <button
              key={sec.value}
              onClick={() => router.push(`/partner/${params.project}/${params.year}/${sec.value}`)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2",
                params.section === sec.value
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {sec.label}
              {emptyCount > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-neutral-400 text-white text-[10px] font-semibold">
                  {emptyCount}
                </span>
              )}
            </button>
          );
        })}
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
                  <Label>{labels.overviewFields.durationMonths}</Label>
                  <Input type="number" min={0} value={overview.project_duration_months} onChange={(e) => updateOverview({ project_duration_months: e.target.value })} placeholder={labels.placeholders.durationMonths} className="text-sm" />
                </div>
                <div>
                  <Label>{labels.overviewFields.grantSizeUsd}</Label>
                  <Input type="number" min={0} value={overview.grant_size_usd} onChange={(e) => updateOverview({ grant_size_usd: e.target.value })} placeholder={labels.placeholders.grantSizeUsd} className="text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>{labels.overviewFields.startDate}</Label>
                  <Input type="date" value={overview.starting_date} onChange={(e) => updateOverview({ starting_date: e.target.value })} className="text-sm" />
                </div>
                <div>
                  <Label>{labels.overviewFields.endDate}</Label>
                  <Input type="date" value={overview.end_date} onChange={(e) => updateOverview({ end_date: e.target.value })} className="text-sm" />
                </div>
                <div>
                  <Label>{labels.overviewFields.reportSubmissionDate}</Label>
                  <Input type="date" value={overview.report_submission_date} onChange={(e) => updateOverview({ report_submission_date: e.target.value })} className="text-sm" />
                </div>
              </div>

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
          risks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <FileQuestion className="size-8 opacity-30" />
              <p className="text-sm">{labels.partnerEditor.emptyRisks}</p>
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
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {risks.map((risk, i) => {
                    const state = riskStates[risk.id];
                    if (!state) return null;
                    const collapsed = collapsedRows[risk.id] ?? true;
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
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )

        ) : params.section === "achievements" ? (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-[35%]">{labels.keyAchievements.columns.achievement}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-[35%]">{labels.keyAchievements.columns.significance}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-64">{labels.keyAchievements.columns.links}</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
                <tr className="border-b bg-background">
                  <td />
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.keyAchievements.remarks.achievement}</td>
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.keyAchievements.remarks.significance}</td>
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.keyAchievements.remarks.links}</td>
                  <td />
                </tr>
              </thead>
              <tbody className="divide-y">
                {kaRows.map((row, i) => (
                  <tr key={i} className={cn("transition-colors", row.dirty && "bg-amber-50/40")}>
                    <td className="px-4 py-3 align-top text-xs font-mono text-muted-foreground">{i + 1}.</td>
                    <td className="px-4 py-3 align-top">
                      <Textarea
                        value={row.achievement}
                        onChange={(e) => updateKARow(i, { achievement: e.target.value })}
                        placeholder={labels.placeholders.achievement}
                        className="text-sm min-h-[80px] resize-y"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Textarea
                        value={row.significance}
                        onChange={(e) => updateKARow(i, { significance: e.target.value })}
                        placeholder={labels.placeholders.significance}
                        className="text-sm min-h-[80px] resize-y"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <MultiLinkInput
                        links={row.links}
                        onAdd={() => addKALink(i)}
                        onRemove={(li) => removeKALink(i, li)}
                        onUpdate={(li, val) => updateKALink(i, li, val)}
                        placeholder={labels.placeholders.achievementLinks}
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      <button
                        onClick={() => deleteKARow(i, row.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Delete achievement"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {kaRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      {labels.partnerEditor.emptyKeyAchievements}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {kaRows.length < 3 && (
              <div className="px-4 py-3 border-t">
                <Button onClick={addKARow} variant="outline" size="sm" className="gap-1.5">
                  <Plus className="size-3.5" /> {labels.partnerEditor.addAchievement}
                </Button>
              </div>
            )}
          </div>

        ) : params.section === "partnerships" ? (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-[28%]">{labels.partnerships.columns.partnerOrganization}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{labels.partnerships.columns.result}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-64">{labels.partnerships.columns.links}</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
                <tr className="border-b bg-background">
                  <td />
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.partnerships.remarks.partnerOrganization}</td>
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.partnerships.remarks.result}</td>
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.partnerships.remarks.links}</td>
                  <td />
                </tr>
              </thead>
              <tbody className="divide-y">
                {partnerRows.map((row, i) => (
                  <tr key={i} className={cn("transition-colors", row.dirty && "bg-amber-50/40")}>
                    <td className="px-4 py-3 align-top text-xs font-mono text-muted-foreground">{i + 1}.</td>
                    <td className="px-4 py-3 align-top">
                      <Input
                        value={row.partner_organization}
                        onChange={(e) => updatePartnerRow(i, { partner_organization: e.target.value })}
                        placeholder={labels.placeholders.partnerOrganization}
                        className="text-sm"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Textarea
                        value={row.result}
                        onChange={(e) => updatePartnerRow(i, { result: e.target.value })}
                        placeholder={labels.placeholders.partnershipResult}
                        className="text-sm min-h-[80px] resize-y"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <MultiLinkInput
                        links={row.links}
                        onAdd={() => addPartnerLink(i)}
                        onRemove={(li) => removePartnerLink(i, li)}
                        onUpdate={(li, val) => updatePartnerLink(i, li, val)}
                        placeholder={labels.placeholders.achievementLinks}
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      <button
                        onClick={() => deletePartnerRow(i, row.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Delete partner"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {partnerRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      {labels.partnerEditor.emptyPartnerships}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t">
              <Button onClick={addPartnerRow} variant="outline" size="sm" className="gap-1.5">
                <Plus className="size-3.5" /> {labels.partnerEditor.addPartner}
              </Button>
            </div>
          </div>

        ) : params.section === "results" ? (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-[25%]">{labels.results.columns.context}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-[25%]">{labels.results.columns.dataDrivenDecision}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-[25%]">{labels.results.columns.resultingImpact}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-48">{labels.results.columns.links}</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
                <tr className="border-b bg-background">
                  <td />
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.results.remarks.context}</td>
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.results.remarks.dataDrivenDecision}</td>
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.results.remarks.resultingImpact}</td>
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.results.remarks.links}</td>
                  <td />
                </tr>
              </thead>
              <tbody className="divide-y">
                {resultRows.map((row, i) => (
                  <tr key={i} className={cn("transition-colors", row.dirty && "bg-amber-50/40")}>
                    <td className="px-4 py-3 align-top text-xs font-mono text-muted-foreground">{i + 1}.</td>
                    <td className="px-4 py-3 align-top">
                      <Textarea
                        value={row.context}
                        onChange={(e) => updateResultRow(i, { context: e.target.value })}
                        placeholder={labels.placeholders.resultContext}
                        className="text-sm min-h-[80px] resize-y"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Textarea
                        value={row.data_driven_decision}
                        onChange={(e) => updateResultRow(i, { data_driven_decision: e.target.value })}
                        placeholder={labels.placeholders.dataDrivenDecision}
                        className="text-sm min-h-[80px] resize-y"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Textarea
                        value={row.resulting_impact}
                        onChange={(e) => updateResultRow(i, { resulting_impact: e.target.value })}
                        placeholder={labels.placeholders.resultingImpact}
                        className="text-sm min-h-[80px] resize-y"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <MultiLinkInput
                        links={row.links}
                        onAdd={() => addResultLink(i)}
                        onRemove={(li) => removeResultLink(i, li)}
                        onUpdate={(li, val) => updateResultLink(i, li, val)}
                        placeholder={labels.placeholders.achievementLinks}
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      {resultRows.length > 3 && (
                        <button
                          onClick={() => deleteResultRow(i, row.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Delete result"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t">
              <Button onClick={addResultRow} variant="outline" size="sm" className="gap-1.5">
                <Plus className="size-3.5" /> {labels.partnerEditor.addResult}
              </Button>
            </div>
          </div>

        ) : params.section === "lessons" ? (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-44">{labels.lessons.columns.category}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-[38%]">{labels.lessons.columns.lessonLearned}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{labels.lessons.columns.adjustmentInformed}</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
                <tr className="border-b bg-background">
                  <td />
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.lessons.remarks.category}</td>
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.lessons.remarks.lessonLearned}</td>
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.lessons.remarks.adjustmentInformed}</td>
                  <td />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lessonRows.map((row, i) => (
                  <tr key={i} className={cn("transition-colors", row.dirty && "bg-amber-50/40")}>
                    <td className="px-4 py-3 align-top text-xs font-mono text-muted-foreground">{i + 1}.</td>
                    <td className="px-4 py-3 align-top">
                      <Select
                        value={row.category || "none"}
                        onValueChange={(v) => updateLessonRow(i, { category: v === "none" ? "" : v })}
                      >
                        <SelectTrigger className="w-full h-9 text-sm">
                          {row.category
                            ? <span>{row.category}</span>
                            : <span className="text-muted-foreground">Select…</span>}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                          {labels.lessons.categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Textarea
                        value={row.lesson_learned}
                        onChange={(e) => updateLessonRow(i, { lesson_learned: e.target.value })}
                        placeholder="Briefly describe what your organization learned…"
                        className="text-sm min-h-[80px] resize-y"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Textarea
                        value={row.adjustment_informed}
                        onChange={(e) => updateLessonRow(i, { adjustment_informed: e.target.value })}
                        placeholder="Explain what you changed or will change as a result…"
                        className="text-sm min-h-[80px] resize-y"
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      <button
                        onClick={() => deleteLessonRow(i, row.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Delete lesson"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {lessonRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      {labels.partnerEditor.emptyLessons}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {lessonRows.length < 5 && (
              <div className="px-4 py-3 border-t">
                <Button onClick={addLessonRow} variant="outline" size="sm" className="gap-1.5">
                  <Plus className="size-3.5" /> {labels.partnerEditor.addLesson}
                </Button>
              </div>
            )}
          </div>

        ) : params.section === "external-coverage" ? (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-44">{labels.externalCoverage.columns.type}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-[28%]">{labels.externalCoverage.columns.description}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-[20%]">{labels.externalCoverage.columns.reachIndicator}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-52">{labels.externalCoverage.columns.links}</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
                <tr className="border-b bg-background">
                  <td />
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.externalCoverage.remarks.type}</td>
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.externalCoverage.remarks.description}</td>
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.externalCoverage.remarks.reachIndicator}</td>
                  <td className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">{labels.externalCoverage.remarks.links}</td>
                  <td />
                </tr>
              </thead>
              <tbody className="divide-y">
                {coverageRows.map((row, i) => (
                  <tr key={i} className={cn("transition-colors", row.dirty && "bg-amber-50/40")}>
                    <td className="px-4 py-3 align-top text-xs font-mono text-muted-foreground">{i + 1}.</td>
                    <td className="px-4 py-3 align-top">
                      <Select
                        value={row.type || "none"}
                        onValueChange={(v) => updateCoverageRow(i, { type: v === "none" ? "" : v })}
                      >
                        <SelectTrigger className="w-full h-9 text-sm">
                          {row.type
                            ? <span>{row.type}</span>
                            : <span className="text-muted-foreground">Select…</span>}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                          {labels.externalCoverage.types.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Textarea
                        value={row.description}
                        onChange={(e) => updateCoverageRow(i, { description: e.target.value })}
                        placeholder={labels.placeholders.coverageDescription}
                        className="text-sm min-h-[80px] resize-y"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Textarea
                        value={row.reach_indicator}
                        onChange={(e) => updateCoverageRow(i, { reach_indicator: e.target.value })}
                        placeholder={labels.placeholders.reachIndicator}
                        className="text-sm min-h-[80px] resize-y"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <MultiLinkInput
                        links={row.links}
                        onAdd={() => addCoverageLink(i)}
                        onRemove={(li) => removeCoverageLink(i, li)}
                        onUpdate={(li, val) => updateCoverageLink(i, li, val)}
                        placeholder={labels.placeholders.achievementLinks}
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      {coverageRows.length > 3 && (
                        <button
                          onClick={() => deleteCoverageRow(i, row.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Delete coverage"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t">
              <Button onClick={addCoverageRow} variant="outline" size="sm" className="gap-1.5">
                <Plus className="size-3.5" /> {labels.partnerEditor.addCoverage}
              </Button>
            </div>
          </div>

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
