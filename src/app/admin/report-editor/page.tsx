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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, FileQuestion, CheckCircle2, Circle, Pencil } from "lucide-react";
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

const SECTIONS = [
  { value: "surveys", label: "Surveys" },
  { value: "risk", label: "Risk Management" },
];

export default function ReportEditorPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>("surveys");

  // Surveys state
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  // Risk state
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [newRiskName, setNewRiskName] = useState("");
  const [newRiskCategory, setNewRiskCategory] = useState("");
  const [addingRisk, setAddingRisk] = useState(false);
  const [deletingRiskId, setDeletingRiskId] = useState<number | null>(null);
  const [editingRiskId, setEditingRiskId] = useState<number | null>(null);
  const [editingRiskName, setEditingRiskName] = useState("");
  const [editingRiskCategory, setEditingRiskCategory] = useState("");

  const [loadingReports, setLoadingReports] = useState(true);
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

  const loadRisks = useCallback(async (reportId: string) => {
    setLoadingRisk(true);
    setError(null);
    try {
      const res = await fetch(`/api/risk?reportId=${reportId}`);
      if (!res.ok) throw new Error("Failed to load risks");
      setRisks(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingRisk(false);
    }
  }, []);

  function handleReportChange(val: string) {
    setSelectedReportId(val);
    setSurveys([]);
    setRisks([]);
    if (val) {
      if (selectedSection === "surveys") loadSurveys(val);
      else if (selectedSection === "risk") loadRisks(val);
    }
  }

  function handleSectionChange(val: string) {
    setSelectedSection(val);
    setSurveys([]);
    setRisks([]);
    if (selectedReportId) {
      if (val === "surveys") loadSurveys(selectedReportId);
      else if (val === "risk") loadRisks(selectedReportId);
    }
  }

  // ── Surveys ──

  function handleEditStart(survey: Survey) {
    setEditingId(survey.id);
    setEditingText(survey.question);
  }

  async function handleEditSave(id: number) {
    if (!editingText.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/surveys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, question: editingText }),
      });
      if (!res.ok) throw new Error("Failed to update question");
      setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, question: editingText } : s)));
      setEditingId(null);
      setEditingText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function handleEditCancel() {
    setEditingId(null);
    setEditingText("");
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

  // ── Risk Management ──

  function handleRiskEditStart(risk: Risk) {
    setEditingRiskId(risk.id);
    setEditingRiskName(risk.risk_name);
    setEditingRiskCategory(risk.risk_category?.join(", ") ?? "");
  }

  async function handleRiskEditSave(id: number) {
    if (!editingRiskName.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/risk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, risk_name: editingRiskName, risk_category: editingRiskCategory }),
      });
      if (!res.ok) throw new Error("Failed to update risk");
      const updated: Risk = await res.json();
      setRisks((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setEditingRiskId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function handleRiskEditCancel() {
    setEditingRiskId(null);
    setEditingRiskName("");
    setEditingRiskCategory("");
  }

  async function handleRiskAdd() {
    if (!newRiskName.trim() || !selectedReportId) return;
    setAddingRisk(true);
    setError(null);
    try {
      const res = await fetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: Number(selectedReportId), risk_name: newRiskName, risk_category: newRiskCategory }),
      });
      if (!res.ok) throw new Error("Failed to add risk");
      const created: Risk = await res.json();
      setRisks((prev) => [...prev, created]);
      setNewRiskName("");
      setNewRiskCategory("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAddingRisk(false);
    }
  }

  async function handleRiskDelete(id: number) {
    setDeletingRiskId(id);
    setError(null);
    try {
      const res = await fetch(`/api/risk?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete risk");
      setRisks((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDeletingRiskId(null);
    }
  }

  const selectedReport = reports.find((r) => String(r.id) === selectedReportId);
  const showContent = !!selectedReportId;
  const sectionLoading = selectedSection === "surveys" ? loadingSurveys : selectedSection === "risk" ? loadingRisk : false;

  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className="border-b px-8 h-32 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-qanelas">Report Editor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Edit survey questions and risks for a selected report
          </p>
        </div>

        <Select value={selectedReportId} onValueChange={handleReportChange} disabled={loadingReports}>
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
        ) : sectionLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>

        ) : selectedSection === "surveys" ? (
          <div className="max-w-2xl space-y-4">
            {surveys.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                No survey questions yet. Add one below.
              </div>
            ) : (
              <div className="rounded-xl border bg-card divide-y overflow-hidden">
                {surveys.map((s, i) => {
                  const isAnswered = s.assessment !== null && s.context;
                  const isEditing = editingId === s.id;
                  return (
                    <div key={s.id} className="flex items-start gap-3 px-4 py-3.5">
                      <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">{i + 1}.</span>
                      {isEditing ? (
                        <div className="flex-1 flex gap-2 items-start">
                          <Textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="flex-1 text-sm min-h-[60px] resize-none"
                            autoFocus
                          />
                          <div className="flex gap-2 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => handleEditSave(s.id)}>Save</Button>
                            <Button size="sm" variant="outline" onClick={handleEditCancel}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="flex-1 text-sm">{s.question}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            {isAnswered
                              ? <CheckCircle2 className="size-4 text-green-600" />
                              : <Circle className="size-4 text-muted-foreground/40" />}
                            <button onClick={() => handleEditStart(s)} className="text-muted-foreground hover:text-foreground transition-colors">
                              <Pencil className="size-3.5" />
                            </button>
                            <button onClick={() => handleDelete(s.id)} disabled={deletingId === s.id} className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40">
                              {deletingId === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Input
                placeholder="New survey question…"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                className="flex-1"
              />
              <Button onClick={handleAdd} disabled={adding || !newQuestion.trim()} size="sm" className="shrink-0">
                {adding ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" /> Add</>}
              </Button>
            </div>
          </div>

        ) : selectedSection === "risk" ? (
          <div className="max-w-2xl space-y-4">
            {risks.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                No risks added yet. Add one below.
              </div>
            ) : (
              <div className="rounded-xl border bg-card divide-y overflow-hidden">
                {risks.map((risk, i) => {
                  const isAnswered = risk.likelihood !== null && risk.impact !== null;
                  const isEditing = editingRiskId === risk.id;
                  return (
                    <div key={risk.id} className="flex items-start gap-3 px-4 py-3.5">
                      <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">{i + 1}.</span>
                      {isEditing ? (
                        <div className="flex-1 flex flex-col gap-2">
                          <Input
                            value={editingRiskName}
                            onChange={(e) => setEditingRiskName(e.target.value)}
                            placeholder="Risk name…"
                            className="text-sm"
                            autoFocus
                          />
                          <Input
                            value={editingRiskCategory}
                            onChange={(e) => setEditingRiskCategory(e.target.value)}
                            placeholder="Categories (comma-separated)…"
                            className="text-sm"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleRiskEditSave(risk.id)}>Save</Button>
                            <Button size="sm" variant="outline" onClick={handleRiskEditCancel}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm">{risk.risk_name}</p>
                            {risk.risk_category && risk.risk_category.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {risk.risk_category.map((cat, ci) => (
                                  <span key={ci} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isAnswered
                              ? <CheckCircle2 className="size-4 text-green-600" />
                              : <Circle className="size-4 text-muted-foreground/40" />}
                            <button onClick={() => handleRiskEditStart(risk)} className="text-muted-foreground hover:text-foreground transition-colors">
                              <Pencil className="size-3.5" />
                            </button>
                            <button onClick={() => handleRiskDelete(risk.id)} disabled={deletingRiskId === risk.id} className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40">
                              {deletingRiskId === risk.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Input
                placeholder="Risk name…"
                value={newRiskName}
                onChange={(e) => setNewRiskName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !newRiskName.trim()) return; if (e.key === "Enter") handleRiskAdd(); }}
                className="flex-1"
              />
              <Input
                placeholder="Categories (comma-separated)…"
                value={newRiskCategory}
                onChange={(e) => setNewRiskCategory(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleRiskAdd} disabled={addingRisk || !newRiskName.trim()} size="sm" className="shrink-0">
                {addingRisk ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" /> Add</>}
              </Button>
            </div>
          </div>

        ) : null}
      </div>
    </div>
  );
}
