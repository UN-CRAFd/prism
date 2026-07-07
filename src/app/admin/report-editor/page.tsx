"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, FileQuestion, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

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

const SECTIONS = [{ value: "surveys", label: "Surveys" }];

export default function ReportEditorPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("surveys");

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [loadingReports, setLoadingReports] = useState(true);

  const [newQuestion, setNewQuestion] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports?data_type=report")
      .then((r) => r.json())
      .then((data: Report[]) => setReports(Array.isArray(data) ? data : []))
      .catch(() => setError("Failed to load reports"))
      .finally(() => setLoadingReports(false));
  }, []);

  const loadSurveys = useCallback(async (reportId: string) => {
    setLoadingSurveys(true);
    setError(null);
    try {
      const res = await fetch(`/api/surveys?reportId=${reportId}`);
      if (!res.ok) throw new Error("Failed to load surveys");
      setSurveys(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingSurveys(false);
    }
  }, []);

  function handleReportChange(val: string) {
    setSelectedReportId(val);
    setSurveys([]);
    if (val) loadSurveys(val);
  }

  function handleSectionChange(val: string) {
    setSelectedSection(val);
    setSurveys([]);
    if (selectedReportId) loadSurveys(selectedReportId);
  }

  async function handleAdd() {
    if (!newQuestion.trim() || !selectedReportId) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: Number(selectedReportId), question: newQuestion }),
      });
      if (!res.ok) throw new Error("Failed to add question");
      const created: Survey = await res.json();
      setSurveys((prev) => [...prev, created]);
      setNewQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/surveys?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setSurveys((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDeletingId(null);
    }
  }

  const selectedReport = reports.find((r) => String(r.id) === selectedReportId);
  const showContent = !!selectedReportId;

  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className="border-b px-8 h-32 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-qanelas">Report Editor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Edit survey questions for a selected report
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Report selector */}
          <Select
            value={selectedReportId}
            onValueChange={handleReportChange}
            disabled={loadingReports}
          >
            <SelectTrigger className="w-[320px] h-9">
              {loadingReports ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Loading reports…
                </span>
              ) : selectedReport ? (
                <span className="truncate capitalize">
                  {selectedReport.report_type ?? "annual"} Report {selectedReport.year} · {selectedReport.project_short_name || selectedReport.project_title}
                </span>
              ) : (
                <span className="text-muted-foreground">Select a report</span>
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

        </div>
      </div>

      {/* Section tabs */}
      <div className="border-b px-8 flex gap-1 shrink-0">
        {SECTIONS.map((sec) => (
          <button
            key={sec.value}
            onClick={() => handleSectionChange(sec.value)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              selectedSection === sec.value
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

        {!showContent ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <FileQuestion className="size-10 opacity-30" />
            <p className="text-sm">Select a report to start editing.</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-4">

            {/* Context */}
            {selectedReport && (
              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                Editing <span className="font-medium text-foreground capitalize">{selectedReport.report_type ?? "annual"} Report {selectedReport.year}</span> &mdash; {selectedReport.project_short_name || selectedReport.project_title} &mdash; Surveys
              </div>
            )}

            {/* Existing questions */}
            {loadingSurveys ? (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : surveys.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                No survey questions yet. Add one below.
              </div>
            ) : (
              <div className="rounded-xl border bg-card divide-y overflow-hidden">
                {surveys.map((s, i) => {
                  const isAnswered = s.assessment !== null && s.context;
                  return (
                    <div key={s.id} className="flex items-start gap-3 px-4 py-3.5">
                      <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">
                        {i + 1}.
                      </span>
                      <p className="flex-1 text-sm">{s.question}</p>
                      {isAnswered ? (
                        <CheckCircle2 className="size-4 text-green-600 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                      )}
                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId === s.id}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                      >
                        {deletingId === s.id
                          ? <Loader2 className="size-3.5 animate-spin" />
                          : <Trash2 className="size-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new question */}
            <div className="flex gap-2 pt-2">
              <Input
                placeholder="New survey question…"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                className="flex-1"
              />
              <Button
                onClick={handleAdd}
                disabled={adding || !newQuestion.trim()}
                size="sm"
                className="shrink-0"
              >
                {adding
                  ? <Loader2 className="size-4 animate-spin" />
                  : <><Plus className="size-4 mr-1" /> Add</>}
              </Button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
