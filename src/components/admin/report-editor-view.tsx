"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, FileQuestion, CheckCircle2, Circle, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";
import { WorkplanAdminEditor } from "@/components/workplan-grid";
import { ExpenditureAdminEditor } from "@/components/expenditure-grid";

// ── Types ──────────────────────────────────────────────────────────────────

interface Report {
  id: number;
  project_id: number;
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
  { value: "surveys", label: labels.sections.surveys },
  { value: "risk", label: labels.sections.risk },
  { value: "workplan", label: labels.sections.workplan },
  { value: "expenditure", label: labels.sections.expenditure },
];

function toSlug(r: Report) {
  return (r.project_short_name ?? r.project_title).toLowerCase().replace(/\s+/g, "-");
}

// ── Shared editor view (rendered by both the base page and the dynamic route) ──

export function ReportEditorView() {
  const router = useRouter();
  const params = useParams<{ project?: string; year?: string; section?: string }>();

  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>(params.section ?? "surveys");
  const [error, setError] = useState<string | null>(null);

  // Surveys
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  // Risk
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [newRiskName, setNewRiskName] = useState("");
  const [newRiskCategory, setNewRiskCategory] = useState("");
  const [newRiskApprovedMitigation, setNewRiskApprovedMitigation] = useState("");
  const [addingRisk, setAddingRisk] = useState(false);
  const [deletingRiskId, setDeletingRiskId] = useState<number | null>(null);
  const [editingRiskId, setEditingRiskId] = useState<number | null>(null);
  const [editingRiskName, setEditingRiskName] = useState("");
  const [editingRiskCategory, setEditingRiskCategory] = useState("");
  const [editingRiskApprovedMitigation, setEditingRiskApprovedMitigation] = useState("");

  // ── Load reports list & pre-select from URL params ──────────────────────

  useEffect(() => {
    fetch("/api/reports?data_type=report")
      .then((r) => r.json())
      .then((data: Report[]) => {
        const list = Array.isArray(data) ? data : [];
        setReports(list);

        if (params.project && params.year) {
          const match = list.find(
            (r) => toSlug(r) === params.project && String(r.year) === params.year
          );
          if (match) setSelectedReportId(String(match.id));
        }
      })
      .catch(() => setError("Failed to load reports"))
      .finally(() => setLoadingReports(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keep section state in sync with URL ─────────────────────────────────

  useEffect(() => {
    if (params.section) setSelectedSection(params.section);
  }, [params.section]);

  // ── Load section data when report or section changes ────────────────────

  const loadSurveys = useCallback(async (reportId: string) => {
    setLoadingSurveys(true); setError(null);
    try {
      const res = await fetch(`/api/surveys?reportId=${reportId}`);
      if (!res.ok) throw new Error("Failed to load surveys");
      setSurveys(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoadingSurveys(false); }
  }, []);

  const loadRisks = useCallback(async (reportId: string) => {
    setLoadingRisk(true); setError(null);
    try {
      const res = await fetch(`/api/risk?reportId=${reportId}`);
      if (!res.ok) throw new Error("Failed to load risks");
      setRisks(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoadingRisk(false); }
  }, []);

  useEffect(() => {
    if (!selectedReportId) return;
    setSurveys([]); setRisks([]);
    if (selectedSection === "surveys") loadSurveys(selectedReportId);
    else if (selectedSection === "risk") loadRisks(selectedReportId);
  }, [selectedReportId, selectedSection, loadSurveys, loadRisks]);

  // ── Navigation helpers ──────────────────────────────────────────────────

  function pushUrl(report: Report, section: string) {
    router.push(`/admin/report-editor/${toSlug(report)}/${report.year}/${section}`);
  }

  function handleReportChange(val: string) {
    setSelectedReportId(val);
    setSurveys([]); setRisks([]);
    const report = reports.find((r) => String(r.id) === val);
    if (report) pushUrl(report, selectedSection);
  }

  function handleSectionChange(val: string) {
    setSelectedSection(val);
    setSurveys([]); setRisks([]);
    const report = reports.find((r) => String(r.id) === selectedReportId);
    if (report) pushUrl(report, val);
  }

  // ── Surveys CRUD ────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!newQuestion.trim() || !selectedReportId) return;
    setAdding(true); setError(null);
    try {
      const res = await fetch("/api/surveys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: Number(selectedReportId), question: newQuestion }),
      });
      if (!res.ok) throw new Error("Failed to add question");
      const created: Survey = await res.json();
      setSurveys((prev) => [...prev, created]);
      setNewQuestion("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setAdding(false); }
  }

  async function handleEditSave(id: number) {
    if (!editingText.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/surveys", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, question: editingText }),
      });
      if (!res.ok) throw new Error("Failed to update question");
      setSurveys((prev) => prev.map((s) => s.id === id ? { ...s, question: editingText } : s));
      setEditingId(null); setEditingText("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
  }

  async function handleDelete(id: number) {
    setDeletingId(id); setError(null);
    try {
      const res = await fetch(`/api/surveys?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setSurveys((prev) => prev.filter((s) => s.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setDeletingId(null); }
  }

  // ── Risk CRUD ───────────────────────────────────────────────────────────

  async function handleRiskAdd() {
    if (!newRiskName.trim() || !selectedReportId) return;
    setAddingRisk(true); setError(null);
    try {
      const res = await fetch("/api/risk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: Number(selectedReportId), risk_name: newRiskName, risk_category: newRiskCategory, approved_mitigation: newRiskApprovedMitigation || null }),
      });
      if (!res.ok) throw new Error("Failed to add risk");
      const created: Risk = await res.json();
      setRisks((prev) => [...prev, created]);
      setNewRiskName(""); setNewRiskCategory(""); setNewRiskApprovedMitigation("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setAddingRisk(false); }
  }

  async function handleRiskEditSave(id: number) {
    if (!editingRiskName.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/risk", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, risk_name: editingRiskName, risk_category: editingRiskCategory, approved_mitigation: editingRiskApprovedMitigation || null }),
      });
      if (!res.ok) throw new Error("Failed to update risk");
      const updated: Risk = await res.json();
      setRisks((prev) => prev.map((r) => r.id === id ? updated : r));
      setEditingRiskId(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
  }

  async function handleRiskDelete(id: number) {
    setDeletingRiskId(id); setError(null);
    try {
      const res = await fetch(`/api/risk?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete risk");
      setRisks((prev) => prev.filter((r) => r.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setDeletingRiskId(null); }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const selectedReport = reports.find((r) => String(r.id) === selectedReportId);
  const sectionLoading =
    selectedSection === "surveys" ? loadingSurveys :
    selectedSection === "risk" ? loadingRisk : false;

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="border-b px-8 h-32 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-qanelas">{labels.adminEditor.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{labels.adminEditor.subtitle}</p>
        </div>

        <Select value={selectedReportId} onValueChange={handleReportChange} disabled={loadingReports}>
          <SelectTrigger className="w-[320px] h-9">
            {loadingReports ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> {labels.adminEditor.loadingReports}
              </span>
            ) : selectedReport ? (
              <span className="truncate capitalize">
                {selectedReport.report_type ?? "annual"} Report {selectedReport.year} · {selectedReport.project_short_name || selectedReport.project_title}
              </span>
            ) : (
              <span className="text-muted-foreground">{labels.adminEditor.selectReport}</span>
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

        {!selectedReportId ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <FileQuestion className="size-10 opacity-30" />
            <p className="text-sm">{labels.adminEditor.selectToStart}</p>
          </div>

        ) : sectionLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {labels.partnerEditor.loading}
          </div>

        ) : selectedSection === "surveys" ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder={labels.placeholders.newSurveyQuestion}
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                className="flex-1"
              />
              <Button onClick={handleAdd} disabled={adding || !newQuestion.trim()} size="sm" className="shrink-0">
                {adding ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{labels.adminEditor.add}</>}
              </Button>
            </div>
            {surveys.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                {labels.adminEditor.emptySurveys}
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
                          <Textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} className="flex-1 text-sm min-h-[60px] resize-none" autoFocus />
                          <div className="flex gap-2 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => handleEditSave(s.id)}>{labels.adminEditor.save}</Button>
                            <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditingText(""); }}>{labels.adminEditor.cancel}</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="flex-1 text-sm">{s.question}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            {isAnswered ? <CheckCircle2 className="size-4 text-green-600" /> : <Circle className="size-4 text-muted-foreground/40" />}
                            <button onClick={() => { setEditingId(s.id); setEditingText(s.question); }} className="text-muted-foreground hover:text-foreground transition-colors">
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
          </div>

        ) : selectedSection === "risk" ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder={labels.placeholders.riskName} value={newRiskName} onChange={(e) => setNewRiskName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newRiskName.trim()) handleRiskAdd(); }} className="flex-1" />
              <Input placeholder={labels.placeholders.riskCategories} value={newRiskCategory} onChange={(e) => setNewRiskCategory(e.target.value)} className="flex-1" />
              <Input placeholder={labels.placeholders.approvedMitigation} value={newRiskApprovedMitigation} onChange={(e) => setNewRiskApprovedMitigation(e.target.value)} className="flex-1" />
              <Button onClick={handleRiskAdd} disabled={addingRisk || !newRiskName.trim()} size="sm" className="shrink-0">
                {addingRisk ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{labels.adminEditor.add}</>}
              </Button>
            </div>
            {risks.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                {labels.adminEditor.emptyRisks}
              </div>
            ) : (
              <div className="rounded-xl border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-8">{labels.risk.columns.number}</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-96">{labels.risk.columns.risk}</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{labels.risk.columns.approvedMitigation}</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground w-28">{labels.risk.columns.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {risks.map((risk, i) => {
                      const isEditing = editingRiskId === risk.id;
                      const isAnswered = risk.likelihood !== null && risk.impact !== null;
                      return (
                        <tr key={risk.id} className="transition-colors hover:bg-muted/20">
                          <td className="px-4 py-3 text-xs font-mono text-muted-foreground align-top">{i + 1}.</td>
                          {isEditing ? (
                            <>
                              <td colSpan={2} className="px-4 py-3 align-top">
                                <div className="flex flex-col gap-2">
                                  <Input value={editingRiskName} onChange={(e) => setEditingRiskName(e.target.value)} placeholder={labels.placeholders.riskName} className="text-sm" autoFocus />
                                  <Input value={editingRiskCategory} onChange={(e) => setEditingRiskCategory(e.target.value)} placeholder={labels.placeholders.riskCategories} className="text-sm" />
                                  <Textarea value={editingRiskApprovedMitigation} onChange={(e) => setEditingRiskApprovedMitigation(e.target.value)} placeholder={labels.placeholders.approvedMitigation} className="text-sm min-h-[80px] resize-y" />
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center justify-end gap-2">
                                  <Button size="sm" variant="outline" onClick={() => handleRiskEditSave(risk.id)}>{labels.adminEditor.save}</Button>
                                  <Button size="sm" variant="outline" onClick={() => { setEditingRiskId(null); setEditingRiskName(""); setEditingRiskCategory(""); setEditingRiskApprovedMitigation(""); }}>{labels.adminEditor.cancel}</Button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 align-top">
                                <p className="text-sm font-medium">{risk.risk_name}</p>
                                {risk.risk_category && risk.risk_category.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {risk.risk_category.map((cat, ci) => (
                                      <span key={ci} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{cat}</span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 align-top">
                                {risk.approved_mitigation
                                  ? <p className="text-sm text-muted-foreground">{risk.approved_mitigation}</p>
                                  : <span className="text-sm text-muted-foreground/40">—</span>}
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center justify-end gap-2">
                                  {isAnswered ? <CheckCircle2 className="size-4 text-green-600" /> : <Circle className="size-4 text-muted-foreground/40" />}
                                  <button onClick={() => { setEditingRiskId(risk.id); setEditingRiskName(risk.risk_name); setEditingRiskCategory(risk.risk_category?.join(", ") ?? ""); setEditingRiskApprovedMitigation(risk.approved_mitigation ?? ""); }} className="text-muted-foreground hover:text-foreground transition-colors">
                                    <Pencil className="size-3.5" />
                                  </button>
                                  <button onClick={() => handleRiskDelete(risk.id)} disabled={deletingRiskId === risk.id} className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40">
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

        ) : selectedSection === "workplan" ? (
          selectedReport ? <WorkplanAdminEditor projectId={selectedReport.project_id} defaultAgent={selectedReport.partner_short_name} /> : null
        ) : selectedSection === "expenditure" ? (
          selectedReport ? <ExpenditureAdminEditor projectId={selectedReport.project_id} /> : null
        ) : null}
      </div>
    </div>
  );
}
