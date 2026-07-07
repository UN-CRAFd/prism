"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const SECTIONS = [
  { value: "overview", label: "Overview" },
  { value: "surveys", label: "Surveys" },
  { value: "risk", label: "Risk Management" },
];

const ASSESSMENT_CONFIG: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300"    },
  2: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-300" },
  3: { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-300"  },
  4: { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-300"   },
  5: { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-300"  },
};

const AUTHORIZATION_MESSAGES = [
  "We grant the Complex Risk Analytics Fund (CRAF'd) a non-exclusive, worldwide, royalty-free, perpetual license to use, reproduce, adapt, distribute, and publicly display the submitted quotes, photographs, videos, and other communication materials solely for communications, outreach, advocacy, and reporting purposes.",
  "We confirm that we hold all necessary rights and have obtained required consents from any individuals or third parties featured, in line with applicable laws and ethical standards. Ownership remains with the originating party. Where feasible, CRAF'd will provide attribution as specified, except where impracticable or inconsistent with the format or purpose of use. Materials shall not be used in a misleading or defamatory manner.",
];

const LIKELIHOOD_LABELS: Record<number, string> = {
  1: "Rare", 2: "Unlikely", 3: "Possible", 4: "Likely", 5: "Very Likely",
};

const IMPACT_LABELS: Record<number, string> = {
  1: "Insignificant", 2: "Minor", 3: "Moderate", 4: "Major", 5: "Extreme",
};

const RISK_CONFIG: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-300"  },
  2: { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-300"   },
  3: { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-300"  },
  4: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-300" },
  5: { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300"    },
};

function AssessmentBadge({ value }: { value: number }) {
  const c = ASSESSMENT_CONFIG[value] ?? { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-xs font-semibold", c.bg, c.text, c.border)}>
      {value}
    </span>
  );
}

function LikelihoodBadge({ value }: { value: number }) {
  const c = RISK_CONFIG[value] ?? { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", c.bg, c.text, c.border)}>
      {LIKELIHOOD_LABELS[value] ?? value}
    </span>
  );
}

function ImpactBadge({ value }: { value: number }) {
  const c = RISK_CONFIG[value] ?? { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", c.bg, c.text, c.border)}>
      {IMPACT_LABELS[value] ?? value}
    </span>
  );
}

const RISK_LEVEL_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  "Low":       { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-300"  },
  "Medium":    { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-300"  },
  "High":      { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-300" },
  "Very High": { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300"    },
};

function computeRiskLevel(likelihood: number | null, impact: number | null): string {
  if (likelihood === null || impact === null) return "";
  const l = LIKELIHOOD_LABELS[likelihood];
  const i = IMPACT_LABELS[impact];

  if (
    (["Rare", "Unlikely"].includes(l) && ["Insignificant", "Minor"].includes(i)) ||
    (l === "Possible" && i === "Insignificant")
  ) return "Low";

  if (
    (l === "Possible" && i === "Minor") ||
    (l === "Likely" && i === "Minor") ||
    (["Very Likely", "Likely"].includes(l) && i === "Insignificant") ||
    (["Rare", "Unlikely"].includes(l) && ["Moderate", "Major"].includes(i))
  ) return "Medium";

  if (
    (l === "Very Likely" && ["Minor", "Moderate"].includes(i)) ||
    (l === "Likely" && ["Moderate", "Major"].includes(i)) ||
    (l === "Possible" && ["Moderate", "Major", "Extreme"].includes(i)) ||
    (["Unlikely", "Rare"].includes(l) && i === "Extreme")
  ) return "High";

  if (
    (l === "Very Likely" && ["Major", "Extreme"].includes(i)) ||
    (l === "Likely" && i === "Extreme")
  ) return "Very High";

  return "";
}

function RiskLevelBadge({ likelihood, impact }: { likelihood: number | null; impact: number | null }) {
  const level = computeRiskLevel(likelihood, impact);
  if (!level) return <span className="text-muted-foreground text-sm">—</span>;
  const c = RISK_LEVEL_CONFIG[level];
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", c.bg, c.text, c.border)}>
      {level}
    </span>
  );
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
    params.section === "risk" ? risks.some((r) => riskStates[r.id]?.dirty) : false;
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
    return 0;
  }

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Top bar */}
      <div className="bg-neutral-950 text-white px-8 h-32 flex items-center justify-between shrink-0">
        <div>
          <p className="text-neutral-400 text-sm mb-1">PRISM V.0.1</p>
          <h1 className="text-2xl font-bold font-qanelas">Report Editor</h1>
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
                  <Loader2 className="size-3 animate-spin" /> Loading…
                </span>
              ) : selectedReport ? (
                <span className="truncate capitalize">
                  {selectedReport.report_type ?? "annual"} Report {selectedReport.year} · {selectedReport.project_short_name || selectedReport.project_title}
                </span>
              ) : (
                <span className="text-neutral-400">Select a report</span>
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
                <CheckCircle2 className="size-4" /> Saved
              </span>
            ) : (
              <Button
                onClick={saveAll}
                disabled={!anyDirty || saving}
                size="sm"
                className="bg-crafd-yellow text-black hover:bg-crafd-yellow/90 disabled:opacity-40"
              >
                {saving
                  ? <><Loader2 className="size-3.5 animate-spin mr-1.5" /> Saving…</>
                  : <><Save className="size-3.5 mr-1.5" /> Save changes</>}
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
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {notFound ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <FileQuestion className="size-10 opacity-30" />
            <p className="text-sm">Report not found.</p>
          </div>
        ) : loadingReports || sectionLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>

        ) : params.section === "surveys" ? (
          surveys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <FileQuestion className="size-8 opacity-30" />
              <p className="text-sm">No survey questions found for this report.</p>
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
                        <p className="text-xs text-muted-foreground">Assessment</p>
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
                            <SelectItem value="1"><div className="flex items-center gap-2"><AssessmentBadge value={1} /> <span className="text-sm">Not at all</span></div></SelectItem>
                            <SelectItem value="2"><AssessmentBadge value={2} /></SelectItem>
                            <SelectItem value="3"><AssessmentBadge value={3} /></SelectItem>
                            <SelectItem value="4"><AssessmentBadge value={4} /></SelectItem>
                            <SelectItem value="5"><div className="flex items-center gap-2"><AssessmentBadge value={5} /> <span className="text-sm">To a very great extent</span></div></SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <p className="text-xs text-muted-foreground">Context</p>
                        <Textarea
                          value={state.context}
                          onChange={(e) => updateRow(survey.id, { context: e.target.value })}
                          placeholder="Add context or explanation…"
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
                  <Label>Project Title</Label>
                  <Input value={overview.project_title} onChange={(e) => updateOverview({ project_title: e.target.value })} placeholder="Project title…" className="text-sm" />
                </div>
                <div>
                  <Label>MPTFO Project Number</Label>
                  <Input value={overview.mptfo_project_number} onChange={(e) => updateOverview({ mptfo_project_number: e.target.value })} placeholder="e.g. MPTFO-2025-001" className="text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Organization Name</Label>
                  <Input value={overview.organization_name} onChange={(e) => updateOverview({ organization_name: e.target.value })} placeholder="Organization name…" className="text-sm" />
                </div>
                <div>
                  <Label>Organization Website</Label>
                  <Input value={overview.organization_website} onChange={(e) => updateOverview({ organization_website: e.target.value })} placeholder="https://…" className="text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Project Lead</Label>
                  <Input value={overview.project_lead} onChange={(e) => updateOverview({ project_lead: e.target.value })} placeholder="Name…" className="text-sm" />
                </div>
                <div>
                  <Label>Duration (months)</Label>
                  <Input type="number" min={0} value={overview.project_duration_months} onChange={(e) => updateOverview({ project_duration_months: e.target.value })} placeholder="e.g. 24" className="text-sm" />
                </div>
                <div>
                  <Label>Grant Size (USD)</Label>
                  <Input type="number" min={0} value={overview.grant_size_usd} onChange={(e) => updateOverview({ grant_size_usd: e.target.value })} placeholder="e.g. 500000" className="text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={overview.starting_date} onChange={(e) => updateOverview({ starting_date: e.target.value })} className="text-sm" />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={overview.end_date} onChange={(e) => updateOverview({ end_date: e.target.value })} className="text-sm" />
                </div>
                <div>
                  <Label>Report Submission Date</Label>
                  <Input type="date" value={overview.report_submission_date} onChange={(e) => updateOverview({ report_submission_date: e.target.value })} className="text-sm" />
                </div>
              </div>

              <div>
                <Label>Implementing Partners</Label>
                <Textarea value={overview.implementing_partners} onChange={(e) => updateOverview({ implementing_partners: e.target.value })} placeholder="List implementing partners…" className="text-sm min-h-[72px] resize-y" />
              </div>

              <div>
                <Label>Geographic Scope</Label>
                <Textarea value={overview.geographic_scope} onChange={(e) => updateOverview({ geographic_scope: e.target.value })} placeholder="Describe the geographic scope…" className="text-sm min-h-[72px] resize-y" />
              </div>
            </div>

            {/* Authorization */}
            <div className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Authorization</h3>
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
                <span className="text-sm font-medium">I authorize this report</span>
              </label>
            </div>
          </div>

        ) : params.section === "risk" ? (
          risks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <FileQuestion className="size-8 opacity-30" />
              <p className="text-sm">No risks have been added to this report yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-12">#</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Risk</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-32">Likelihood</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-32">Impact</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-28">Risk Level</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-72">Approved Mitigation</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-72">Updated Mitigation</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground w-24">Revision</th>
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
                                placeholder="Updated mitigation…"
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
                                placeholder="Updated mitigation…"
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
