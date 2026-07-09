"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { Loader2, FileQuestion, CheckCircle2, Save, ShieldCheck, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";
import { WorkplanPartnerEditor, type WorkplanHandle } from "@/components/workplan-grid";
import { SectionTableEditor, SECTION_SPECS, type SectionHandle } from "@/components/section-table-editor";
import { ExpenditurePartnerEditor, type ExpenditureHandle } from "@/components/expenditure-grid";
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
  { value: "workplan", label: labels.sections.workplan },
  { value: "expenditure", label: labels.sections.expenditure },
];

const FUTURE_SECTIONS = [
  { value: "indicators", label: "Indicators" },
  { value: "funding-transfers", label: "Transfers" },
  { value: "complementary-funding", label: "Complementary" },
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

  // Config-driven list sections (achievements, partnerships, results, lessons,
  // external-coverage) are handled by <SectionTableEditor>. Each active editor
  // registers its imperative save() handle and reports its dirty / incomplete
  // counts up so the shared top-bar Save button and tab badges keep working.
  const sectionRefs = useRef<Record<string, SectionHandle | null>>({});
  const [sectionDirty, setSectionDirty] = useState<Record<string, boolean>>({});
  const [sectionEmpty, setSectionEmpty] = useState<Record<string, number>>({});

  const workplanRef = useRef<WorkplanHandle>(null);
  const [workplanDirty, setWorkplanDirty] = useState(false);

  const expenditureRef = useRef<ExpenditureHandle>(null);
  const [expenditureDirty, setExpenditureDirty] = useState(false);

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
    // Config-driven list sections load their own data inside <SectionTableEditor>.
  }, [reportId, params.section, loadSurveys, loadOverview, loadRisk]);

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

  function toggleCollapse(id: number) {
    setCollapsedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Stable callbacks for <SectionTableEditor>. The equality guard is essential:
  // the map is an object, so an unconditional spread would re-render forever.
  const handleSectionDirty = useCallback((dirty: boolean) => {
    setSectionDirty((prev) => (prev[params.section] === dirty ? prev : { ...prev, [params.section]: dirty }));
    if (dirty) setSaveSuccess(false);
  }, [params.section]);

  const handleSectionEmpty = useCallback((count: number) => {
    setSectionEmpty((prev) => (prev[params.section] === count ? prev : { ...prev, [params.section]: count }));
  }, [params.section]);

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
      } else if (params.section in SECTION_SPECS) {
        await sectionRefs.current[params.section]?.save();
      } else if (params.section === "workplan") {
        await workplanRef.current?.save();
      } else if (params.section === "expenditure") {
        await expenditureRef.current?.save();
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
    params.section === "risk" ? loadingRisk : false;
  const anyDirty =
    params.section === "surveys" ? surveys.some((s) => rowStates[s.id]?.dirty) :
    params.section === "overview" ? overviewDirty :
    params.section === "risk" ? risks.some((r) => riskStates[r.id]?.dirty) :
    params.section === "workplan" ? workplanDirty :
    params.section === "expenditure" ? expenditureDirty :
    params.section in SECTION_SPECS ? (sectionDirty[params.section] ?? false) : false;
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

  function getEmptyCount(sec: string) {
    if (sec === "overview") return overviewEmptyCount;
    if (sec === "surveys") return surveysEmptyCount;
    if (sec === "risk") return riskEmptyCount;
    if (sec in SECTION_SPECS) return sectionEmpty[sec] ?? 0;
    return 0;
  }

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
      <div className="border-b px-8 flex gap-1 shrink-0 bg-background overflow-hidden">
        {SECTIONS.map((sec) => {
          const emptyCount = getEmptyCount(sec.value);
          return (
            <button
              key={sec.value}
              onClick={() => router.push(`/partner/${params.project}/${params.year}/${sec.value}`)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 shrink-0",
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
        {FUTURE_SECTIONS.map((sec) => (
          <button
            key={sec.value}
            disabled
            className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px text-muted-foreground/30 cursor-not-allowed shrink-0"
            title="Coming soon"
          >
            {sec.label}
          </button>
        ))}
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

        ) : params.section in SECTION_SPECS ? (
          reportId ? (
            <SectionTableEditor
              key={params.section}
              ref={(h) => { sectionRefs.current[params.section] = h; }}
              reportId={reportId}
              spec={SECTION_SPECS[params.section]}
              onDirtyChange={handleSectionDirty}
              onEmptyCountChange={handleSectionEmpty}
            />
          ) : null

        ) : params.section === "workplan" ? (
          reportId ? (
            <WorkplanPartnerEditor
              ref={workplanRef}
              reportId={reportId}
              onDirtyChange={(d) => { setWorkplanDirty(d); if (d) setSaveSuccess(false); }}
            />
          ) : null

        ) : params.section === "expenditure" ? (
          reportId ? (
            <ExpenditurePartnerEditor
              ref={expenditureRef}
              reportId={reportId}
              onDirtyChange={(d) => { setExpenditureDirty(d); if (d) setSaveSuccess(false); }}
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
