"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, FileQuestion, Pencil, Layers, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth-context";
import labels from "@/lib/labels.json";
import { WorkplanAdminEditor } from "@/components/workplan-grid";
import { ExpenditureAdminEditor } from "@/components/expenditure-grid";
import { NarrativesAdminEditor } from "@/components/admin/narratives-editor";
import { GeneralInfoAdminEditor } from "@/components/admin/general-info-editor";
import { AutosaveIndicator, type SaveState } from "@/components/autosave";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { cycleLabel } from "@/lib/indicators";
import { reportStatusStyle } from "@/lib/reports";

const PRODOC_STATUSES = ["Open", "Under Review", "Closed"] as const;

// ── Project Document Editor ──────────────────────────────────────────────────
// Defines the baseline/template for a project on its project document (prodoc —
// the single reports row with data_type='prodoc'). Surveys/risk/indicators are
// stored against the prodoc id (a prodoc is a reports row); workplan + expenditure
// plan are project-level. New reports snapshot these baselines at creation.

interface Prodoc {
  id: number;            // the prodoc's reports.id — used as the section reportId
  project_id: number;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  project_start_date: string | null;
  project_duration_months: number | null;
  status: string | null; // Open | Under Review | Closed — gates editability
}

interface Survey {
  id: number;
  report_id: number;
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

interface IndicatorLine {
  id: number;
  indicator_id: number;
  baseline_value: string | null;
  baseline_year: number | null;
  target_value: string | null;
  target_year: number | null;
  achieved_value: string | null;
  status: string | null;
  comment: string | null;
  indicator_name: string;
  indicator_description: string | null;
  means_of_verification: string | null;
  category: string | null;
  cycle: string | null;
  is_standard: boolean;
}

interface LibraryIndicator {
  id: number;
  name: string;
  is_standard: boolean;
}

// Surveys sits last and is muted — it's an admin-only baseline concern, so
// partners never see it (filtered out in partner mode).
const SECTIONS: { value: string; label: string; muted?: boolean; adminOnly?: boolean }[] = [
  { value: "general", label: labels.sections.general },
  { value: "narratives", label: labels.sections.narratives },
  { value: "risk", label: labels.sections.risk },
  { value: "indicators", label: labels.sections.indicators },
  { value: "workplan", label: labels.sections.workplan },
  { value: "expenditure", label: labels.sections.expenditure },
  { value: "surveys", label: labels.sections.surveys, muted: true, adminOnly: true },
];

function toSlug(d: Prodoc) {
  return (d.project_short_name ?? d.project_title).toLowerCase().replace(/\s+/g, "-");
}

export function ProdocEditorView({ mode = "admin" }: { mode?: "admin" | "partner" }) {
  const router = useRouter();
  const params = useParams<{ project?: string; section?: string }>();
  const { user } = useAuth();

  const isPartner = mode === "partner";
  const routeBase = isPartner ? "/partner/prodoc-editor" : "/admin/prodoc-editor";
  // Partners never see the admin-only Surveys tab.
  const sections = isPartner ? SECTIONS.filter((s) => !s.adminOnly) : SECTIONS;

  const confirm = useConfirm();
  const [docs, setDocs] = useState<Prodoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [selectedProdocId, setSelectedProdocId] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>(params.section ?? "general");
  const [error, setError] = useState<string | null>(null);
  const [editorSaveState, setEditorSaveState] = useState<SaveState>("idle");

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

  // Indicators
  const [indicatorLines, setIndicatorLines] = useState<IndicatorLine[]>([]);
  const [library, setLibrary] = useState<LibraryIndicator[]>([]);
  const [loadingIndicators, setLoadingIndicators] = useState(false);
  const [addingIndicator, setAddingIndicator] = useState(false);

  // ── Load project documents & pre-select from URL params ─────────────────

  useEffect(() => {
    if (isPartner && !user) return; // wait for auth before filtering to the org
    fetch("/api/reports?data_type=prodoc")
      .then((r) => r.json())
      .then((data: Prodoc[]) => {
        let list = Array.isArray(data) ? data : [];
        if (isPartner && user) {
          list = list.filter(
            (d) =>
              d.partner_short_name?.toLowerCase() === user.id.toLowerCase() ||
              d.partner_short_name === user.organization
          );
        }
        setDocs(list);
        if (params.project) {
          const match = list.find((d) => toSlug(d) === params.project);
          if (match) setSelectedProdocId(String(match.id));
        } else if (isPartner && list.length > 0) {
          // No project in the URL — partners have no dropdown, so open the first.
          setSelectedProdocId(String(list[0].id));
        }
      })
      .catch(() => setError("Failed to load project documents"))
      .finally(() => setLoadingDocs(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPartner, user]);

  useEffect(() => {
    if (params.section) setSelectedSection(params.section);
  }, [params.section]);

  // ── Load section data when document or section changes ──────────────────

  const loadSurveys = useCallback(async (prodocId: string) => {
    setLoadingSurveys(true); setError(null);
    try {
      const res = await fetch(`/api/surveys?reportId=${prodocId}`);
      if (!res.ok) throw new Error("Failed to load surveys");
      setSurveys(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoadingSurveys(false); }
  }, []);

  const loadRisks = useCallback(async (prodocId: string) => {
    setLoadingRisk(true); setError(null);
    try {
      const res = await fetch(`/api/risk?reportId=${prodocId}`);
      if (!res.ok) throw new Error("Failed to load risks");
      setRisks(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoadingRisk(false); }
  }, []);

  const loadIndicators = useCallback(async (prodocId: string, projectId: number) => {
    setLoadingIndicators(true); setError(null);
    try {
      const [linesRes, libRes] = await Promise.all([
        fetch(`/api/indicator-data?reportId=${prodocId}`),
        fetch(`/api/indicators?project_id=${projectId}`),
      ]);
      if (!linesRes.ok || !libRes.ok) throw new Error("Failed to load indicators");
      setIndicatorLines(await linesRes.json());
      setLibrary(await libRes.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoadingIndicators(false); }
  }, []);

  useEffect(() => {
    if (!selectedProdocId) return;
    setSurveys([]); setRisks([]); setIndicatorLines([]); setLibrary([]);
    if (selectedSection === "surveys") loadSurveys(selectedProdocId);
    else if (selectedSection === "risk") loadRisks(selectedProdocId);
    else if (selectedSection === "indicators") {
      const doc = docs.find((d) => String(d.id) === selectedProdocId);
      if (doc) loadIndicators(selectedProdocId, doc.project_id);
    }
  }, [selectedProdocId, selectedSection, docs, loadSurveys, loadRisks, loadIndicators]);

  // ── Navigation ────────────────────────────────────────────────────────

  function pushUrl(doc: Prodoc, section: string) {
    router.push(`${routeBase}/${toSlug(doc)}/${section}`);
  }

  function handleDocChange(val: string) {
    setSelectedProdocId(val);
    setSurveys([]); setRisks([]); setIndicatorLines([]); setLibrary([]);
    const doc = docs.find((d) => String(d.id) === val);
    if (doc) pushUrl(doc, selectedSection);
  }

  function handleSectionChange(val: string) {
    setSelectedSection(val);
    setSurveys([]); setRisks([]); setIndicatorLines([]); setLibrary([]);
    const doc = docs.find((d) => String(d.id) === selectedProdocId);
    if (doc) pushUrl(doc, val);
  }

  // ── Surveys CRUD ────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!newQuestion.trim() || !selectedProdocId) return;
    setAdding(true); setError(null);
    try {
      const res = await fetch("/api/surveys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: Number(selectedProdocId), question: newQuestion }),
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
    const survey = surveys.find((s) => s.id === id);
    if (!await confirm({ message: `Delete the question "${survey?.question ?? "this survey question"}"? This cannot be undone.` })) return;
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
    if (!newRiskName.trim() || !selectedProdocId) return;
    setAddingRisk(true); setError(null);
    try {
      const res = await fetch("/api/risk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: Number(selectedProdocId), risk_name: newRiskName, risk_category: newRiskCategory, approved_mitigation: newRiskApprovedMitigation || null }),
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
    const risk = risks.find((r) => r.id === id);
    if (!await confirm({ message: `Delete risk "${risk?.risk_name ?? "this risk"}"? This cannot be undone.` })) return;
    setDeletingRiskId(id); setError(null);
    try {
      const res = await fetch(`/api/risk?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete risk");
      setRisks((prev) => prev.filter((r) => r.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setDeletingRiskId(null); }
  }

  // ── Indicators CRUD ───────────────────────────────────────────────────────

  const selectedDoc = docs.find((d) => String(d.id) === selectedProdocId);
  // Status → who can edit (same rule as reports):
  //   Open → admin + partner · Under Review → admin only · Closed → no one
  const readOnly =
    !!selectedDoc &&
    (selectedDoc.status === "Closed" ||
      (selectedDoc.status === "Under Review" && isPartner));

  // Change the prodoc status from the top bar (admin only). Optimistic; readOnly
  // recomputes from the updated local state immediately.
  async function handleStatusChange(newStatus: string) {
    if (!selectedDoc) return;
    const id = selectedDoc.id;
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d)));
    await fetch(`/api/reports/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function addIndicatorLine(indicatorId: number) {
    if (!selectedProdocId || !selectedDoc) return;

    // Calculate baseline year (project start) and target year (project end)
    let baselineYear: number | null = null;
    let targetYear: number | null = null;

    if (selectedDoc.project_start_date) {
      baselineYear = new Date(selectedDoc.project_start_date).getFullYear();
      if (selectedDoc.project_duration_months) {
        const endDate = new Date(selectedDoc.project_start_date);
        endDate.setMonth(endDate.getMonth() + selectedDoc.project_duration_months);
        targetYear = endDate.getFullYear();
      } else {
        targetYear = baselineYear;
      }
    }

    const res = await fetch("/api/indicator-data", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportId: Number(selectedProdocId),
        indicator_id: indicatorId,
        baseline_year: baselineYear,
        target_year: targetYear,
      }),
    });
    if (!res.ok) { const err = await res.json(); setError(err.error || "Failed to add indicator"); return; }
    const created: IndicatorLine = await res.json();
    setIndicatorLines((prev) => [...prev, created]);
  }

  async function handleIndicatorSelect(item: ComboboxItem) {
    setAddingIndicator(true); setError(null);
    try { await addIndicatorLine(item.id); }
    finally { setAddingIndicator(false); }
  }

  async function handleIndicatorCreate(name: string) {
    if (!selectedDoc) return;
    setAddingIndicator(true); setError(null);
    try {
      const res = await fetch("/api/indicators", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, is_standard: false, project_id: selectedDoc.project_id }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to create indicator"); }
      const created: LibraryIndicator = await res.json();
      setLibrary((prev) => [...prev, created]);
      await addIndicatorLine(created.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setAddingIndicator(false); }
  }

  function updateIndicatorLineLocal(id: number, patch: Partial<IndicatorLine>) {
    setIndicatorLines((prev) => prev.map((l) => l.id === id ? { ...l, ...patch } : l));
  }

  async function saveIndicatorLine(id: number) {
    const line = indicatorLines.find((l) => l.id === id);
    if (!line) return;
    setError(null);
    const res = await fetch("/api/indicator-data", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        baseline_value: line.baseline_value,
        baseline_year: line.baseline_year,
        target_value: line.target_value,
        target_year: line.target_year,
      }),
    });
    if (!res.ok) { const err = await res.json(); setError(err.error || "Failed to save"); }
  }

  async function handleIndicatorDelete(id: number) {
    if (!await confirm({ message: "Remove this indicator from the project document?", confirmLabel: "Remove", variant: "default" })) return;
    setError(null);
    const res = await fetch(`/api/indicator-data?id=${id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); setError(err.error || "Failed to remove"); return; }
    setIndicatorLines((prev) => prev.filter((l) => l.id !== id));
  }

  const indicatorComboItems: ComboboxItem[] = library
    .filter((lib) => !indicatorLines.some((l) => l.indicator_id === lib.id))
    .map((lib) => ({ id: lib.id, label: lib.name, hint: lib.is_standard ? "Standard" : "Custom" }));

  // ── Render ──────────────────────────────────────────────────────────────

  // Group indicators by category (must be at top level, not in conditional)
  const groupedIndicators = useMemo(() => {
    if (indicatorLines.length === 0) return [];
    const map = new Map<string, typeof indicatorLines>();
    for (const line of indicatorLines) {
      const cat = line.category || "(No category)";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(line);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [indicatorLines]);

  const sectionLoading =
    selectedSection === "surveys" ? loadingSurveys :
    selectedSection === "risk" ? loadingRisk :
    selectedSection === "indicators" ? loadingIndicators : false;

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="border-b px-8 h-32 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-qanelas">{selectedDoc ? selectedDoc.project_title : "Project Document"}</h1>
            {!isPartner && selectedDoc && (
              <Select value={selectedDoc.status ?? "Open"} onValueChange={handleStatusChange}>
                <SelectTrigger className={`!h-7 w-fit shrink-0 px-2.5 text-xs font-semibold border rounded-full [&>svg]:size-3 [&>svg]:shrink-0 ${reportStatusStyle((selectedDoc.status as "Open" | "Under Review" | "Closed") ?? "Open")}`}>
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    {readOnly && <Lock className="size-3" />}
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {PRODOC_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          {isPartner ? (
            <p className="text-sm text-muted-foreground mt-0.5">
              {selectedDoc ? (selectedDoc.project_short_name || "Project Document") : "Your project document baseline."}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">Project Document Editor</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {selectedProdocId && (selectedSection === "general" || selectedSection === "narratives") && (
            <AutosaveIndicator state={editorSaveState} idleAsSaved />
          )}

          {(!isPartner || docs.length > 1) && (
            <Select value={selectedProdocId} onValueChange={handleDocChange} disabled={loadingDocs}>
            <SelectTrigger className="w-[320px] h-9">
              {loadingDocs ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Loading…
                </span>
              ) : selectedDoc ? (
                <span className="truncate">{selectedDoc.project_short_name || selectedDoc.project_title}</span>
              ) : (
                <span className="text-muted-foreground">Select a project</span>
              )}
            </SelectTrigger>
            <SelectContent>
              {Object.entries(
                docs.reduce((acc, d) => {
                  const key = d.partner_short_name;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(d);
                  return acc;
                }, {} as Record<string, Prodoc[]>)
              ).map(([partner, grouped]) => (
                <SelectGroup key={partner}>
                  <SelectLabel>{partner}</SelectLabel>
                  {grouped.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.project_short_name || d.project_title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          )}
        </div>
      </div>

      {/* Section tabs */}
      <div className="border-b px-8 flex gap-1 shrink-0">
        {sections.map((sec) => {
          const active = selectedSection === sec.value;
          return (
            <button
              key={sec.value}
              onClick={() => handleSectionChange(sec.value)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-foreground text-foreground"
                  : sec.muted
                    ? "border-transparent text-muted-foreground/40 hover:text-muted-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {sec.label}
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

        {readOnly && selectedProdocId && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <Lock className="size-3.5 shrink-0" />
            <span>
              This project document is <b>{selectedDoc?.status}</b> and is view-only
              {selectedDoc?.status === "Under Review" ? " for partners — only administrators can edit it" : ""}.
            </span>
          </div>
        )}

        {/* fieldset disables every form control within when the prodoc is closed */}
        <fieldset disabled={readOnly} className="min-w-0 border-0 p-0 m-0">
        {!selectedProdocId ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <FileQuestion className="size-10 opacity-30" />
            <p className="text-sm">
              {loadingDocs
                ? labels.partnerEditor.loading
                : isPartner
                  ? "No project document is available for your organization yet."
                  : "Select a project to edit its project document."}
            </p>
          </div>

        ) : sectionLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {labels.partnerEditor.loading}
          </div>

        ) : selectedSection === "general" ? (
          selectedDoc ? <GeneralInfoAdminEditor projectId={selectedDoc.project_id} onSaveStateChange={setEditorSaveState} isAdmin={!isPartner} /> : null

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

        ) : selectedSection === "indicators" ? (
          <div className="space-y-4">
            <div className="max-w-xl">
              <Combobox
                items={indicatorComboItems}
                placeholder={labels.placeholders.indicatorSearch}
                onSelect={handleIndicatorSelect}
                onCreate={handleIndicatorCreate}
                createLabel={labels.adminEditor.createIndicator}
                busy={addingIndicator}
              />
            </div>
            {indicatorLines.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                {labels.adminEditor.emptyIndicators}
              </div>
            ) : (
              <div className="rounded-xl border bg-card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-8">{labels.indicators.columns.number}</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{labels.indicators.columns.indicator}</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-32">{labels.indicators.columns.baselineValue}</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-24">{labels.indicators.columns.baselineYear}</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-32">{labels.indicators.columns.targetValue}</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-24">{labels.indicators.columns.targetYear}</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground w-16">{labels.indicators.columns.actions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {groupedIndicators.map(([category, lines]) => {
                        let rowNum = 1;
                        return [
                          <tr key={`cat-${category}`} className="bg-muted/40">
                            <td colSpan={7} className="px-4 py-2.5">
                              <div className="flex items-center gap-2 font-semibold text-sm">
                                <Layers className="size-3.5 text-muted-foreground" />
                                {category}
                                <span className="text-xs text-muted-foreground font-normal">({lines.length})</span>
                              </div>
                            </td>
                          </tr>,
                          ...lines.map((line) => {
                            const num = rowNum++;
                            return (
                              <tr key={line.id} className="transition-colors hover:bg-muted/20 align-top">
                                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{num}.</td>
                              <td className="px-4 py-3">
                                <p className="text-sm font-medium">{line.indicator_name}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {!line.is_standard && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Custom</span>}
                                  {line.cycle && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{cycleLabel(line.cycle)}</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Input
                                  value={line.baseline_value ?? ""}
                                  onChange={(e) => updateIndicatorLineLocal(line.id, { baseline_value: e.target.value })}
                                  onBlur={() => saveIndicatorLine(line.id)}
                                  placeholder={labels.placeholders.baselineValue}
                                  className="text-sm h-8"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number" value={line.baseline_year ?? ""}
                                  onChange={(e) => updateIndicatorLineLocal(line.id, { baseline_year: e.target.value ? Number(e.target.value) : null })}
                                  onBlur={() => saveIndicatorLine(line.id)}
                                  placeholder={labels.placeholders.year}
                                  className="text-sm h-8 w-20"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <Input
                                  value={line.target_value ?? ""}
                                  onChange={(e) => updateIndicatorLineLocal(line.id, { target_value: e.target.value })}
                                  onBlur={() => saveIndicatorLine(line.id)}
                                  placeholder={labels.placeholders.targetValue}
                                  className="text-sm h-8"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <Input
                                  type="number" value={line.target_year ?? ""}
                                  onChange={(e) => updateIndicatorLineLocal(line.id, { target_year: e.target.value ? Number(e.target.value) : null })}
                                  onBlur={() => saveIndicatorLine(line.id)}
                                  placeholder={labels.placeholders.year}
                                  className="text-sm h-8 w-20"
                                />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button onClick={() => handleIndicatorDelete(line.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                                  <Trash2 className="size-3.5" />
                                </button>
                              </td>
                            </tr>
                            );
                          }),
                        ].flat();
                      })}
                    </tbody>
                  </table>
                </div>
            )}
          </div>

        ) : selectedSection === "narratives" ? (
          selectedDoc ? <NarrativesAdminEditor projectId={selectedDoc.project_id} onSaveStateChange={setEditorSaveState} /> : null

        ) : selectedSection === "workplan" ? (
          selectedDoc ? <WorkplanAdminEditor projectId={selectedDoc.project_id} defaultAgent={selectedDoc.partner_short_name} /> : null
        ) : selectedSection === "expenditure" ? (
          selectedDoc ? <ExpenditureAdminEditor projectId={selectedDoc.project_id} isAdmin={!isPartner} /> : null
        ) : null}
        </fieldset>
      </div>
    </div>
  );
}
