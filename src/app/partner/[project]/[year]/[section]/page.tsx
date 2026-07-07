"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, FileQuestion, CheckCircle2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [{ value: "surveys", label: "Surveys" }];

const ASSESSMENT_CONFIG: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300"    },
  2: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-300" },
  3: { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-300"  },
  4: { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-300"   },
  5: { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-300"  },
};

function AssessmentBadge({ value }: { value: number }) {
  const c = ASSESSMENT_CONFIG[value] ?? { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-xs font-semibold", c.bg, c.text, c.border)}>
      {value}
    </span>
  );
}

interface Report {
  id: number;
  year: number;
  report_type: "annual" | "final" | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
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

function toSlug(r: Report): string {
  return (r.project_short_name ?? r.project_title).toLowerCase();
}

export default function PartnerReportEditorPage() {
  const { user } = useAuth();
  const params = useParams<{ project: string; year: string; section: string }>();
  const router = useRouter();

  const [reports, setReports] = useState<Report[]>([]);
  const [reportId, setReportId] = useState<number | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [rowStates, setRowStates] = useState<Record<number, RowState>>({});
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSurveys = useCallback(async (id: number) => {
    setLoadingSurveys(true);
    setError(null);
    setSaveSuccess(false);
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

  useEffect(() => {
    if (!user) return;
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
          loadSurveys(match.id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingReports(false));
  }, [user, params.project, params.year, loadSurveys]);

  function handleReportChange(val: string) {
    const report = reports.find((r) => String(r.id) === val);
    if (!report) return;
    router.push(`/partner/${toSlug(report)}/${report.year}/${params.section}`);
  }

  function updateRow(id: number, patch: Partial<RowState>) {
    setSaveSuccess(false);
    setRowStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch, dirty: true } }));
  }

  async function saveAll() {
    const dirtyIds = surveys.filter((s) => rowStates[s.id]?.dirty).map((s) => s.id);
    if (dirtyIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
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
  const anyDirty = surveys.some((s) => rowStates[s.id]?.dirty);
  const notFound = !loadingReports && !loadingSurveys && !selectedReport;

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

          {reportId && surveys.length > 0 && (
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
        {SECTIONS.map((sec) => (
          <button
            key={sec.value}
            onClick={() => router.push(`/partner/${params.project}/${params.year}/${sec.value}`)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              params.section === sec.value
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {sec.label}
          </button>
        ))}
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
        ) : loadingSurveys || loadingReports ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : surveys.length === 0 ? (
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
                  className={cn(
                    "rounded-xl border bg-card p-5 space-y-4 transition-colors",
                    state.dirty && "border-amber-200"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">
                      {i + 1}.
                    </span>
                    <p className="text-sm font-medium leading-snug">{survey.question}</p>
                  </div>

                  <div className="flex gap-6 items-start pl-8">
                    <div className="shrink-0 space-y-1.5">
                      <p className="text-xs text-muted-foreground">Assessment</p>
                      <Select
                        value={state.assessment != null ? String(state.assessment) : "none"}
                        onValueChange={(v) =>
                          updateRow(survey.id, { assessment: v === "none" ? null : Number(v) })
                        }
                      >
                        <SelectTrigger className="w-fit h-8 px-2 gap-1.5">
                          {state.assessment != null
                            ? <AssessmentBadge value={state.assessment} />
                            : <span className="text-muted-foreground text-sm px-1">—</span>}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted-foreground">—</span>
                          </SelectItem>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              <AssessmentBadge value={n} />
                            </SelectItem>
                          ))}
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
        )}
      </div>
    </div>
  );
}
