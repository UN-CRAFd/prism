"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, FileQuestion, Pencil, Layers, Lock, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEAD_TEXT } from "@/components/report-editor/matrix-table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth-context";
import labels from "@/lib/labels.json";
import { WorkplanAdminEditor, WorkplanUpdatesManager } from "@/components/workplan-grid";
import { ExpenditureAdminEditor } from "@/components/expenditure-grid";
import { NarrativesAdminEditor } from "@/components/admin/narratives-editor";
import { GeneralInfoAdminEditor } from "@/components/admin/general-info-editor";
import { SdgTargetsEditor } from "@/components/admin/sdg-targets-editor";
import { SignaturesEditor } from "@/components/admin/signatures-editor";
import { AutosaveIndicator, type SaveState } from "@/components/autosave";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { ReadOnlyProvider } from "@/components/ui/read-only-context";
import { CommentsProvider, ItemComments } from "@/components/report-editor/comments-context";
import { Badge, ScaleSelect } from "@/components/report-editor/scale-select";
import { riskLevelLabel, computeRiskLevelKey, RISK_LEVEL_COLORS } from "@/lib/risk";
import { cycleLabel } from "@/lib/indicators";
import { reportStatusStyle } from "@/lib/reports";

function RiskLevelBadge({ likelihood, impact }: { likelihood: number | null; impact: number | null }) {
  const key = computeRiskLevelKey(likelihood, impact);
  if (!key) return <span className="text-muted-foreground text-sm">—</span>;
  return <Badge colors={RISK_LEVEL_COLORS[key]}>{riskLevelLabel(key)}</Badge>;
}

const PRODOC_STATUSES = ["Open", "Under Review", "Closed"] as const;

// ── Project Document Editor ──────────────────────────────────────────────────
// Defines the baseline/template for a project on its project document (prodoc —
// the single reports row with data_type='prodoc'). Risk/indicators are stored
// against the prodoc id (a prodoc is a reports row); workplan + expenditure plan
// are project-level. New reports snapshot these baselines at creation. (Survey
// questions are not part of the prodoc — reports seed them from the admin's
// standard survey questions / the project's previous report.)

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

const SECTIONS: { value: string; label: string; muted?: boolean; adminOnly?: boolean; hidden?: boolean }[] = [
  { value: "general", label: labels.sections.general },
  { value: "narratives", label: labels.sections.narratives },
  { value: "sdg", label: labels.sections.sdg, hidden: true }, // hidden for now
  { value: "indicators", label: labels.sections.indicators },
  { value: "risk", label: labels.sections.risk },
  // "Budgets" is the prodoc-editor label for the expenditure section (the report
  // editor keeps "Expenditure"); it sits before the workplan tab here.
  { value: "expenditure", label: "Budgets" },
  { value: "workplan", label: labels.sections.workplan },
  { value: "signatures", label: labels.sections.signatures },
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
  // Partners never see admin-only tabs; `hidden` tabs are shelved for everyone
  // (their render branch stays, so they can be re-enabled by dropping the flag).
  const sections = SECTIONS.filter((s) => !s.hidden && (!isPartner || !s.adminOnly));

  const confirm = useConfirm();
  const [docs, setDocs] = useState<Prodoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [selectedProdocId, setSelectedProdocId] = useState<string>("");
  const [selectedSection, setSelectedSection] = useState<string>(params.section ?? "general");
  const [error, setError] = useState<string | null>(null);
  const [editorSaveState, setEditorSaveState] = useState<SaveState>("idle");

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
    setRisks([]); setIndicatorLines([]); setLibrary([]);
    if (selectedSection === "risk") loadRisks(selectedProdocId);
    else if (selectedSection === "indicators") {
      const doc = docs.find((d) => String(d.id) === selectedProdocId);
      if (doc) loadIndicators(selectedProdocId, doc.project_id);
    }
  }, [selectedProdocId, selectedSection, docs, loadRisks, loadIndicators]);

  // ── Navigation ────────────────────────────────────────────────────────

  function pushUrl(doc: Prodoc, section: string) {
    router.push(`${routeBase}/${toSlug(doc)}/${section}`);
  }

  function handleDocChange(val: string) {
    setSelectedProdocId(val);
    setRisks([]); setIndicatorLines([]); setLibrary([]);
    const doc = docs.find((d) => String(d.id) === val);
    if (doc) pushUrl(doc, selectedSection);
  }

  function handleSectionChange(val: string) {
    setSelectedSection(val);
    setRisks([]); setIndicatorLines([]); setLibrary([]);
    const doc = docs.find((d) => String(d.id) === selectedProdocId);
    if (doc) pushUrl(doc, val);
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

  // Likelihood/impact are inline dropdowns (no edit mode) — save immediately on
  // change, optimistic like the indicator baseline/target cells.
  async function updateRiskAssessment(id: number, patch: { likelihood?: number | null; impact?: number | null }) {
    setRisks((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setError(null);
    const res = await fetch("/api/risk", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) setError("Failed to save risk assessment");
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
    selectedSection === "risk" ? loadingRisk :
    selectedSection === "indicators" ? loadingIndicators : false;

  // Quant tables that scroll inside their own bounded box with a frozen column
  // header (matching the report editor), so the header stays pinned while the
  // body scrolls rather than scrolling with the whole page.
  const fillHeight =
    !!selectedProdocId &&
    ["workplan", "expenditure", "indicators", "risk"].includes(selectedSection);

  // Frozen column header for the inline risk/indicators tables: pin each header
  // cell to the top of the bounded scroll box. The tables are border-collapse,
  // so the collapsed bottom border vanishes on sticky cells — an inset box-shadow
  // redraws it. Opaque bg keeps scrolled rows from showing through.
  const stickyHead = fillHeight ? "sticky top-0 z-10 bg-neutral-100" : "";
  const stickyHeadStyle = fillHeight ? { boxShadow: "inset 0 -1px 0 var(--border)" } : undefined;

  return (
    // Reuse the report editor's comment thread system for the project document:
    // comments are keyed on a reports.id, and a prodoc IS a reports row, so the
    // same provider/route power admin↔partner comments here with no new backend.
    // Partners are read-only (view + confirm addressed); admins add/resolve/delete.
    <CommentsProvider
      reportId={selectedProdocId ? Number(selectedProdocId) : null}
      enabled={!!selectedProdocId}
      readOnly={isPartner}
    >
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

        <div className="flex items-center gap-1">
          {selectedProdocId && (selectedSection === "general" || selectedSection === "narratives" || selectedSection === "sdg") && (
            <AutosaveIndicator state={editorSaveState} idleAsSaved />
          )}

          {selectedProdocId && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={() => window.open(`/prodoc-print/${selectedProdocId}?auto=1`, "_blank")}
            >
              <Printer className="size-4 mr-1.5" />
              Print
            </Button>
          )}

          {(!isPartner || docs.length > 1) && (
            <Select value={selectedProdocId} onValueChange={handleDocChange} disabled={loadingDocs}>
            <SelectTrigger className="w-[320px] h-9">
              {loadingDocs ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> {labels.common.loading}
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

      {/* Content — quant tables fill the leftover height and scroll inside their
          own box (single scroller, frozen header); every other section scrolls here. */}
      <div className={cn("flex-1 px-8 py-6", fillHeight ? "flex flex-col min-h-0 overflow-hidden" : "overflow-auto")}>
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

        {/* Section-level comment thread for finalizing the project document: admins
            leave a note on the current section for the partner to address, partners
            see and confirm it. `item_id` null anchors it to the whole section. Kept
            OUTSIDE the read-only fieldset below so admins can still comment on an
            Under Review document and partners can still confirm on a locked one.
            (Partners see nothing here until a comment exists — ItemComments self-hides.)
            The risk/indicators tables, the narratives cards and the workplan
            activities instead carry per-item comments on each row, mirroring the
            report editor, so they're excluded here. */}
        {selectedProdocId && !sectionLoading &&
          !["risk", "indicators", "narratives", "workplan"].includes(selectedSection) && (
          <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
            {!isPartner && <span>Comment on this section:</span>}
            <ItemComments section={selectedSection} itemId={null} />
          </div>
        )}

        {/* Two complementary read-only mechanisms lock a view-only prodoc, mirroring
            the report editor:
            (1) the disabled <fieldset> natively locks every native control inside
            (input, textarea, checkbox, button) while keeping scrolling/selection;
            (2) <ReadOnlyProvider> locks every Radix Select in the subtree — those
            portalled triggers are NOT reliably disabled by fieldset[disabled] (a
            Chromium/WebKit quirk), so without it the General Info status/relationship
            and SDG goal/target dropdowns would stay live on a closed document.
            Keep the fieldset at its default (block) display: a flex/grid fieldset
            worsens the cascade bug for native controls too. If a section ever needs a
            fill-height flex layout, put the flex on an inner wrapper, not the fieldset.
            The header status dropdown sits outside this subtree so admins can still
            reopen a closed prodoc. */}
        <ReadOnlyProvider readOnly={readOnly}>
        <fieldset disabled={readOnly} className={cn("min-w-0 border-0 p-0 m-0", fillHeight && "flex-1 min-h-0")}>
        <div className={cn("min-w-0", fillHeight && "flex flex-col h-full min-h-0")}>
        {!selectedProdocId ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <FileQuestion className="size-10 opacity-30" />
            <p className="text-sm">
              {loadingDocs
                ? labels.common.loading
                : isPartner
                  ? "No project document is available for your organization yet."
                  : "Select a project to edit its project document."}
            </p>
          </div>

        ) : sectionLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
          </div>

        ) : selectedSection === "general" ? (
          selectedDoc ? <GeneralInfoAdminEditor projectId={selectedDoc.project_id} onSaveStateChange={setEditorSaveState} isAdmin={!isPartner} readOnly={readOnly} /> : null

        ) : selectedSection === "risk" ? (
          <div className={cn("space-y-4", fillHeight && "flex flex-col flex-1 min-h-0 space-y-0 gap-4")}>
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
              <div className={cn("rounded-xl border bg-card", fillHeight ? "flex-1 min-h-0 overflow-auto" : "overflow-hidden")}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th style={stickyHeadStyle} className={cn("text-left px-4 py-3 text-muted-foreground w-8", HEAD_TEXT, stickyHead)}>{labels.risk.columns.number}</th>
                      <th style={stickyHeadStyle} className={cn("text-left px-4 py-3 text-muted-foreground w-96", HEAD_TEXT, stickyHead)}>{labels.risk.columns.risk}</th>
                      <th style={stickyHeadStyle} className={cn("text-left px-4 py-3 text-muted-foreground w-32", HEAD_TEXT, stickyHead)}>{labels.risk.columns.likelihood}</th>
                      <th style={stickyHeadStyle} className={cn("text-left px-4 py-3 text-muted-foreground w-32", HEAD_TEXT, stickyHead)}>{labels.risk.columns.impact}</th>
                      <th style={stickyHeadStyle} className={cn("text-left px-4 py-3 text-muted-foreground w-28", HEAD_TEXT, stickyHead)}>{labels.risk.columns.riskLevel}</th>
                      <th style={stickyHeadStyle} className={cn("text-left px-4 py-3 text-muted-foreground", HEAD_TEXT, stickyHead)}>{labels.risk.columns.approvedMitigation}</th>
                      <th style={stickyHeadStyle} className={cn("text-right px-4 py-3 text-muted-foreground w-28", HEAD_TEXT, stickyHead)}>{labels.risk.columns.actions}</th>
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
                              <td colSpan={5} className="px-4 py-3 align-top">
                                <div className="flex flex-col gap-2">
                                  <Input value={editingRiskName} onChange={(e) => setEditingRiskName(e.target.value)} placeholder={labels.placeholders.riskName} className="text-sm" autoFocus />
                                  <Input value={editingRiskCategory} onChange={(e) => setEditingRiskCategory(e.target.value)} placeholder={labels.placeholders.riskCategories} className="text-sm" />
                                  <Textarea value={editingRiskApprovedMitigation} onChange={(e) => setEditingRiskApprovedMitigation(e.target.value)} placeholder={labels.placeholders.approvedMitigation} className="text-sm min-h-[80px] resize-y" />
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center justify-end gap-2">
                                  <Button size="sm" variant="outline" onClick={() => handleRiskEditSave(risk.id)}>{labels.adminEditor.save}</Button>
                                  <Button size="sm" variant="outline" onClick={() => { setEditingRiskId(null); setEditingRiskName(""); setEditingRiskCategory(""); setEditingRiskApprovedMitigation(""); }}>{labels.common.cancel}</Button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{risk.risk_name}</p>
                                    {risk.risk_category && risk.risk_category.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {risk.risk_category.map((cat, ci) => (
                                          <span key={ci} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{cat}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <ItemComments section="risk" itemId={risk.id} />
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <ScaleSelect kind="likelihood" value={risk.likelihood} onValueChange={(v) => updateRiskAssessment(risk.id, { likelihood: v })} />
                              </td>
                              <td className="px-4 py-3 align-top">
                                <ScaleSelect kind="impact" value={risk.impact} onValueChange={(v) => updateRiskAssessment(risk.id, { impact: v })} />
                              </td>
                              <td className="px-4 py-3 align-top">
                                <RiskLevelBadge likelihood={risk.likelihood} impact={risk.impact} />
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
          <div className={cn("space-y-4", fillHeight && "flex flex-col flex-1 min-h-0 space-y-0 gap-4")}>
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
              <div className={cn("rounded-xl border bg-card", fillHeight ? "flex-1 min-h-0 overflow-auto" : "overflow-x-auto")}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th style={stickyHeadStyle} className={cn("text-left px-4 py-3 text-muted-foreground w-8", HEAD_TEXT, stickyHead)}>{labels.indicators.columns.number}</th>
                        <th style={stickyHeadStyle} className={cn("text-left px-4 py-3 text-muted-foreground", HEAD_TEXT, stickyHead)}>{labels.indicators.columns.indicator}</th>
                        <th style={stickyHeadStyle} className={cn("text-left px-4 py-3 text-muted-foreground w-32", HEAD_TEXT, stickyHead)}>{labels.indicators.columns.baselineValue}</th>
                        <th style={stickyHeadStyle} className={cn("text-left px-4 py-3 text-muted-foreground w-24", HEAD_TEXT, stickyHead)}>{labels.indicators.columns.baselineYear}</th>
                        <th style={stickyHeadStyle} className={cn("text-left px-4 py-3 text-muted-foreground w-32", HEAD_TEXT, stickyHead)}>{labels.indicators.columns.targetValue}</th>
                        <th style={stickyHeadStyle} className={cn("text-left px-4 py-3 text-muted-foreground w-24", HEAD_TEXT, stickyHead)}>{labels.indicators.columns.targetYear}</th>
                        <th style={stickyHeadStyle} className={cn("text-right px-4 py-3 text-muted-foreground w-16", HEAD_TEXT, stickyHead)}>{labels.indicators.columns.actions}</th>
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
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{line.indicator_name}</p>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {!line.is_standard && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Custom</span>}
                                      {line.cycle && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{cycleLabel(line.cycle)}</span>}
                                    </div>
                                  </div>
                                  <ItemComments section="indicators" itemId={line.id} />
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
          selectedDoc ? <NarrativesAdminEditor projectId={selectedDoc.project_id} onSaveStateChange={setEditorSaveState} readOnly={readOnly} /> : null

        ) : selectedSection === "sdg" ? (
          selectedDoc ? <SdgTargetsEditor projectId={selectedDoc.project_id} onSaveStateChange={setEditorSaveState} readOnly={readOnly} /> : null

        ) : selectedSection === "signatures" ? (
          selectedDoc ? <SignaturesEditor projectId={selectedDoc.project_id} isAdmin={!isPartner} readOnly={readOnly} /> : null

        ) : selectedSection === "workplan" ? (
          selectedDoc ? (
            <div className={cn(fillHeight ? "flex flex-col gap-4 flex-1 min-h-0" : "space-y-4")}>
              <WorkplanUpdatesManager
                projectId={selectedDoc.project_id}
                startDate={selectedDoc.project_start_date}
                durationMonths={selectedDoc.project_duration_months}
              />
              <WorkplanAdminEditor projectId={selectedDoc.project_id} defaultAgent={selectedDoc.partner_short_name} fillHeight={fillHeight} />
            </div>
          ) : null
        ) : selectedSection === "expenditure" ? (
          selectedDoc ? <ExpenditureAdminEditor projectId={selectedDoc.project_id} isAdmin={!isPartner} fillHeight={fillHeight} /> : null
        ) : null}
        </div>
        </fieldset>
        </ReadOnlyProvider>
      </div>
    </div>
    </CommentsProvider>
  );
}
