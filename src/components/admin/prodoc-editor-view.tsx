"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Loader2, Plus, Trash2, FileQuestion, Pencil, Lock, Printer, X } from "lucide-react";
import { cn, shortName } from "@/lib/utils";
import { HEAD_TEXT } from "@/components/report-editor/matrix-table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth-context";
import labels from "@/lib/labels";
import { WorkplanAdminEditor } from "@/components/workplan-grid";
import { ExpenditureAdminEditor } from "@/components/expenditure-grid";
import { NarrativesAdminEditor } from "@/components/admin/narratives-editor";
import { GeneralInfoAdminEditor } from "@/components/admin/general-info-editor";
import { SdgTargetsEditor } from "@/components/admin/sdg-targets-editor";
import { SignaturesEditor } from "@/components/admin/signatures-editor";
import { DocumentsEditor } from "@/components/admin/documents-editor";
import { AutosaveIndicator, type SaveState } from "@/components/autosave";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { MultiSelect } from "@/components/ui/multi-select";
import { ReadOnlyProvider } from "@/components/ui/read-only-context";
import { InfoPopover } from "@/components/ui/info-popover";
import { CommentsProvider, ItemComments } from "@/components/report-editor/comments-context";
import { Badge, ScaleSelect } from "@/components/report-editor/scale-select";
import { riskLevelLabel, computeRiskLevelKey, RISK_LEVEL_COLORS } from "@/lib/risk";
import { cycleLabel } from "@/lib/indicators";
import { reportStatusStyle } from "@/lib/reports";
import { optionValues } from "@/lib/options";
import { getEditorSessionId } from "@/lib/editor-session-id";

function RiskLevelBadge({ likelihood, impact }: { likelihood: number | null; impact: number | null }) {
  const key = computeRiskLevelKey(likelihood, impact);
  if (!key) return <span className="text-muted-foreground text-sm">—</span>;
  return <Badge colors={RISK_LEVEL_COLORS[key]}>{riskLevelLabel(key)}</Badge>;
}

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
  owner_partner_id: number;  // projects.partner_id — the project lead's org

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
  // Distinct projects that already reference this indicator (via indicator_data).
  // Used to rank recurring custom indicators as suggestions in the add flow.
  usage_project_count?: number;
}

// `label` is a getter so it reflects admin label overrides applied after this
// array is built at module load (see lib/labels.ts).
const SECTIONS: { value: string; label: string; muted?: boolean; adminOnly?: boolean; hidden?: boolean }[] = [
  { value: "general", get label() { return labels.sections.general; } },
  { value: "narratives", get label() { return labels.sections.narratives; } },
  { value: "sdg", get label() { return labels.sections.sdg; }, hidden: true }, // hidden for now
  { value: "indicators", get label() { return labels.sections.indicators; } },
  { value: "risk", get label() { return labels.sections.risk; } },
  // "Budgets" is the prodoc-editor label for the expenditure section (the report
  // editor keeps "Expenditure"); it sits before the workplan tab here.
  { value: "expenditure", label: "Budgets" },
  { value: "workplan", get label() { return labels.sections.workplan; } },
  { value: "signatures", get label() { return labels.sections.signatures; } },
  { value: "documents", get label() { return labels.sections.documents; } },
];

type LockPhase = "idle" | "acquiring" | "held" | "blocked" | "available" | "warning" | "timed-out";

// Keep these in sync with LOCK_TIMEOUT_MS in src/app/api/prodoc-lock/route.ts.
const LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const LOCK_WARNING_MS = 14 * 60 * 1000; // warn 1 minute before timeout

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

  // Editor lock
  const [lockPhase, setLockPhase] = useState<LockPhase>("idle");
  const [lockHolder, setLockHolder] = useState<{ name: string; role: string } | null>(null);
  const [canOverride, setCanOverride] = useState(false);
  // Refs mirror mutable values needed inside async callbacks and cleanup fns
  // without creating stale closures. Updated synchronously on every render.
  const lockPhaseRef = useRef<LockPhase>("idle");
  lockPhaseRef.current = lockPhase;
  const selectedProdocIdRef = useRef(selectedProdocId);
  selectedProdocIdRef.current = selectedProdocId;
  const lastEditRef = useRef<number>(0);           // timestamp of last user-initiated write
  const lastHeartbeatRef = useRef<number>(0);      // timestamp of last heartbeat POST
  const selectedProjectIdRef = useRef<number | null>(null); // projects.id for the selected prodoc

  // Risk
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [newRiskName, setNewRiskName] = useState("");
  const [newRiskCategory, setNewRiskCategory] = useState<string[]>([]);
  const [newRiskApprovedMitigation, setNewRiskApprovedMitigation] = useState("");
  const [addingRisk, setAddingRisk] = useState(false);
  const [deletingRiskId, setDeletingRiskId] = useState<number | null>(null);
  const [editingRiskId, setEditingRiskId] = useState<number | null>(null);
  const [editingRiskName, setEditingRiskName] = useState("");
  const [editingRiskCategory, setEditingRiskCategory] = useState<string[]>([]);
  const [editingRiskApprovedMitigation, setEditingRiskApprovedMitigation] = useState("");

  // Indicator inline edit — custom indicators are partner-editable; standard indicators are admin-only.
  const [editingIndicatorId, setEditingIndicatorId] = useState<number | null>(null);
  const [editingIndName, setEditingIndName] = useState("");
  const [editingIndDescription, setEditingIndDescription] = useState("");
  const [editingIndMov, setEditingIndMov] = useState("");

  // Indicators
  const [indicatorLines, setIndicatorLines] = useState<IndicatorLine[]>([]);
  const [library, setLibrary] = useState<LibraryIndicator[]>([]);
  const [loadingIndicators, setLoadingIndicators] = useState(false);
  const [addingIndicator, setAddingIndicator] = useState(false);
  // Create-a-custom-indicator panel (revealed from the search box's "create new").
  const [creatingIndicator, setCreatingIndicator] = useState(false);
  const [newIndName, setNewIndName] = useState("");
  const [newIndDescription, setNewIndDescription] = useState("");
  const [newIndMeansOfVerification, setNewIndMeansOfVerification] = useState("");

  // ── Load project documents & pre-select from URL params ─────────────────

  useEffect(() => {
    if (isPartner && !user) return; // wait for auth before filtering to the org
    fetch("/api/reports?data_type=prodoc")
      .then((r) => r.json())
      .then((data: Prodoc[]) => {
        // The API already scopes this list to what the partner may see — their
        // own projects PLUS any they were granted edit rights on (editor
        // prodocs are owned by a different partner, so a client-side owner
        // filter here would wrongly drop them). Trust the server scoping.
        const list = Array.isArray(data) ? data : [];
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

  const loadIndicators = useCallback(async (prodocId: string) => {
    setLoadingIndicators(true); setError(null);
    try {
      const [linesRes, libRes] = await Promise.all([
        fetch(`/api/indicator-data?reportId=${prodocId}`),
        // Indicators are a shared global vocabulary now — fetch the whole library.
        fetch(`/api/indicators`),
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
      loadIndicators(selectedProdocId);
    }
  }, [selectedProdocId, selectedSection, loadRisks, loadIndicators]);

  // ── Editor lock effects ──────────────────────────────────────────────

  // Release lock with keepalive so the browser sends the request even during
  // page unload. Called from the acquire-effect cleanup AND beforeunload.
  function releaseLock(projectId: number) {
    return fetch("/api/prodoc-lock", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, session_id: getEditorSessionId() }),
      keepalive: true,
    }).catch(() => {});
  }

  // Send a DELETE on page close/refresh. The acquire-effect cleanup covers
  // navigation within the app; this covers true browser unloads.
  useEffect(() => {
    function handleBeforeUnload() {
      const projectId = selectedProjectIdRef.current;
      const phase = lockPhaseRef.current;
      if (projectId != null && (phase === "held" || phase === "warning")) releaseLock(projectId);
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Acquire the lock when a project is selected; release it on project change or
  // unmount. Uses AbortController so a stale response from a previous project
  // never updates state after the effect has been cleaned up.
  useEffect(() => {
    const projectId = selectedProjectIdRef.current;
    if (!selectedProdocId || projectId == null) {
      setLockPhase("idle"); lockPhaseRef.current = "idle";
      return;
    }
    const controller = new AbortController();
    setLockPhase("acquiring"); lockPhaseRef.current = "acquiring";

    (async () => {
      try {
        const res = await fetch("/api/prodoc-lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, session_id: getEditorSessionId() }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res.ok) {
          setLockPhase("held"); lockPhaseRef.current = "held";
          lastEditRef.current = Date.now();
          lastHeartbeatRef.current = Date.now();
        } else if (res.status === 409) {
          const data = await res.json();
          if (controller.signal.aborted) return;
          setLockPhase("blocked"); lockPhaseRef.current = "blocked";
          setLockHolder({ name: data.holder_name ?? "?", role: data.holder_role ?? "?" });
          setCanOverride(data.can_override === true);
        } else {
          if (res.status === 403) {
            console.error("[prodoc-lock] 403 acquiring lock — verify guardProject receives projects.id", { project_id: projectId });
          }
          // Fail open for 5xx and unexpected responses so the editor stays usable.
          setLockPhase("held"); lockPhaseRef.current = "held";
          lastEditRef.current = Date.now();
          lastHeartbeatRef.current = Date.now();
        }
      } catch {
        if (!controller.signal.aborted) {
          setLockPhase("held"); lockPhaseRef.current = "held";
          lastEditRef.current = Date.now();
          lastHeartbeatRef.current = Date.now();
        }
      }
    })();

    return () => {
      controller.abort();
      releaseLock(projectId);
      setLockPhase("idle"); lockPhaseRef.current = "idle";
      setLockHolder(null);
    };
  }, [selectedProdocId]);

  // Heartbeat (every 60 s if edited) + inactivity warning (9 min) + expiry (10 min).
  // Runs only while we hold the lock; the 30 s tick keeps precision adequate.
  const isHolding = lockPhase === "held" || lockPhase === "warning";
  useEffect(() => {
    if (!isHolding || !selectedProdocId) return;
    const interval = setInterval(async () => {
      const phase = lockPhaseRef.current;
      if (phase !== "held" && phase !== "warning") return;

      const now = Date.now();
      const timeSinceEdit = now - lastEditRef.current;

      if (timeSinceEdit >= LOCK_TIMEOUT_MS) {
        const pid = selectedProjectIdRef.current;
        if (pid != null) await releaseLock(pid);
        setLockPhase("timed-out"); lockPhaseRef.current = "timed-out";
        return;
      }

      if (timeSinceEdit >= LOCK_WARNING_MS && phase === "held") {
        setLockPhase("warning"); lockPhaseRef.current = "warning";
      }

      if (now - lastHeartbeatRef.current >= 60_000 && lastEditRef.current > lastHeartbeatRef.current) {
        lastHeartbeatRef.current = now;
        fetch("/api/prodoc-lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: selectedProjectIdRef.current, session_id: getEditorSessionId() }),
        }).then((r) => {
          if (r.status === 403) console.error("[prodoc-lock] 403 on heartbeat — verify guardProject receives projects.id", { project_id: selectedProjectIdRef.current });
        }).catch(() => {});
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [isHolding, selectedProdocId]);

  // Poll GET every 15 s while blocked; transition to "available" when the lock frees.
  useEffect(() => {
    if (lockPhase !== "blocked" || !selectedProdocId) return;
    const poll = setInterval(async () => {
      try {
        const pid = selectedProjectIdRef.current;
        if (pid == null) return;
        const sid = encodeURIComponent(getEditorSessionId());
        const res = await fetch(`/api/prodoc-lock?project_id=${pid}&session_id=${sid}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.held) {
          setLockPhase("available"); lockPhaseRef.current = "available";
        } else {
          setLockHolder({ name: data.holder_name ?? "?", role: data.holder_role ?? "?" });
        }
      } catch { /* network error during poll — ignore */ }
    }, 15_000);
    return () => clearInterval(poll);
  }, [lockPhase, selectedProdocId]);

  // ── Navigation ────────────────────────────────────────────────────────

  function pushUrl(doc: Prodoc, section: string) {
    router.push(`${routeBase}/${toSlug(doc)}/${section}`);
  }

  function handleDocChange(val: string) {
    setSelectedProdocId(val);
    setRisks([]); setIndicatorLines([]); setLibrary([]);
    const doc = docs.find((d) => String(d.id) === val);
    if (doc) pushUrl(doc, "general");
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
    noteEdit();
    setAddingRisk(true); setError(null);
    try {
      const res = await fetch("/api/risk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: Number(selectedProdocId), risk_name: newRiskName, risk_category: newRiskCategory, approved_mitigation: newRiskApprovedMitigation || null }),
      });
      if (!res.ok) throw new Error("Failed to add risk");
      const created: Risk = await res.json();
      setRisks((prev) => [...prev, created]);
      setNewRiskName(""); setNewRiskCategory([]); setNewRiskApprovedMitigation("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setAddingRisk(false); }
  }

  async function handleRiskEditSave(id: number) {
    if (!editingRiskName.trim()) return;
    noteEdit();
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

  async function handleIndicatorEditSave(indicatorId: number) {
    if (!editingIndName.trim()) return;
    noteEdit();
    setError(null);
    try {
      const res = await fetch(`/api/indicators/${indicatorId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingIndName, description: editingIndDescription || null, means_of_verification: editingIndMov || null }),
      });
      if (!res.ok) throw new Error("Failed to update indicator");
      const updated = await res.json();
      setIndicatorLines((prev) => prev.map((l) =>
        l.indicator_id === indicatorId
          ? { ...l, indicator_name: updated.name, indicator_description: updated.description, means_of_verification: updated.means_of_verification }
          : l
      ));
      setEditingIndicatorId(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
  }

  async function handleRiskDelete(id: number) {
    const risk = risks.find((r) => r.id === id);
    if (!await confirm({ message: `Delete risk "${risk?.risk_name ?? "this risk"}"? This cannot be undone.` })) return;
    noteEdit();
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
    noteEdit();
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
  selectedProjectIdRef.current = selectedDoc?.project_id ?? null;
  // Status → who can edit (same rule as reports):
  //   Open → admin + partner · Under Review → admin only · Closed → no one
  const statusReadOnly =
    !!selectedDoc &&
    (selectedDoc.status === "Closed" ||
      (selectedDoc.status === "Under Review" && isPartner));
  // Lock → blocked while another session holds the lock (or while we're acquiring).
  const lockBlocking =
    lockPhase === "blocked" || lockPhase === "available" || lockPhase === "acquiring" || lockPhase === "timed-out";
  const readOnly = statusReadOnly || lockBlocking;

  // Called by every handler that writes data. Resets the inactivity clock and
  // clears the expiry warning if it was showing.
  function noteEdit() {
    lastEditRef.current = Date.now();
    if (lockPhaseRef.current === "warning") {
      setLockPhase("held"); lockPhaseRef.current = "held";
    }
  }

  // Wrapper for autosave editors so noteEdit() fires when a save starts.
  function handleSaveStateChange(state: SaveState) {
    setEditorSaveState(state);
    if (state === "saving") noteEdit();
  }

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

  // Shown in the "available" banner after polling detects the lock freed.
  async function handleStartEditing() {
    const projectId = selectedDoc?.project_id;
    if (!selectedProdocId || projectId == null) return;
    setLockPhase("acquiring"); lockPhaseRef.current = "acquiring";
    const res = await fetch("/api/prodoc-lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, session_id: getEditorSessionId() }),
    });
    if (res.ok) {
      setLockPhase("held"); lockPhaseRef.current = "held";
      lastEditRef.current = Date.now(); lastHeartbeatRef.current = Date.now();
      setLockHolder(null);
    } else if (res.status === 409) {
      const data = await res.json();
      setLockPhase("blocked"); lockPhaseRef.current = "blocked";
      setLockHolder({ name: data.holder_name ?? "?", role: data.holder_role ?? "?" });
      setCanOverride(data.can_override === true);
    } else {
      if (res.status === 403) {
        console.error("[prodoc-lock] 403 on start-editing — verify guardProject receives projects.id", { project_id: projectId });
      }
      setLockPhase("held"); lockPhaseRef.current = "held"; // fail open
      lastEditRef.current = Date.now(); lastHeartbeatRef.current = Date.now();
      setLockHolder(null);
    }
  }

  // Shown in the "blocked" banner when the 409 carries can_override: true.
  async function handleAdminOverride() {
    const projectId = selectedDoc?.project_id;
    if (!selectedProdocId || projectId == null || !lockHolder) return;
    const ok = await confirm({
      message: `This will interrupt ${lockHolder.name}'s editing session. Continue?`,
    });
    if (!ok) return;
    setLockPhase("acquiring"); lockPhaseRef.current = "acquiring";
    const res = await fetch("/api/prodoc-lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, session_id: getEditorSessionId(), override: true }),
    });
    if (res.ok) {
      setLockPhase("held"); lockPhaseRef.current = "held";
      lastEditRef.current = Date.now(); lastHeartbeatRef.current = Date.now();
      setLockHolder(null); setCanOverride(false);
    } else {
      if (res.status === 403) {
        console.error("[prodoc-lock] 403 on admin override — verify guardProject receives projects.id", { project_id: projectId });
      }
      // Unexpected: go back to blocked so the user can retry.
      setLockPhase("blocked"); lockPhaseRef.current = "blocked";
    }
  }

  async function addIndicatorLine(indicatorId: number) {
    if (!selectedProdocId || !selectedDoc) return;
    noteEdit();

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

  // Opening the create panel from the search box — pre-fill the typed text as the
  // name; description + means of verification are then required before saving.
  function handleIndicatorCreate(name: string) {
    setNewIndName(name);
    setNewIndDescription("");
    setNewIndMeansOfVerification("");
    setCreatingIndicator(true);
  }

  function cancelIndicatorCreate() {
    setCreatingIndicator(false);
    setNewIndName(""); setNewIndDescription(""); setNewIndMeansOfVerification("");
  }

  // Indicators created here are always custom (partner-defined vocabulary), whether
  // an admin or a partner is editing. They require a name, description and means of
  // verification, then join the shared library and are attached to this document.
  async function submitIndicatorCreate() {
    if (!selectedDoc) return;
    if (!newIndName.trim() || !newIndDescription.trim() || !newIndMeansOfVerification.trim()) return;
    noteEdit();
    setAddingIndicator(true); setError(null);
    try {
      const res = await fetch("/api/indicators", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newIndName.trim(),
          description: newIndDescription.trim(),
          means_of_verification: newIndMeansOfVerification.trim(),
          is_standard: false,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to create indicator"); }
      const created: LibraryIndicator = await res.json();
      setLibrary((prev) => [...prev, created]);
      await addIndicatorLine(created.id);
      cancelIndicatorCreate();
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setAddingIndicator(false); }
  }

  function updateIndicatorLineLocal(id: number, patch: Partial<IndicatorLine>) {
    setIndicatorLines((prev) => prev.map((l) => l.id === id ? { ...l, ...patch } : l));
  }

  async function saveIndicatorLine(id: number) {
    const line = indicatorLines.find((l) => l.id === id);
    if (!line) return;
    noteEdit();
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
    noteEdit();
    setError(null);
    const res = await fetch(`/api/indicator-data?id=${id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); setError(err.error || "Failed to remove"); return; }
    setIndicatorLines((prev) => prev.filter((l) => l.id !== id));
  }

  // Suggestion ordering comes from the API (standard first, then custom indicators
  // by how many distinct projects already use them). The hint surfaces that signal:
  // standard entries read "Standard"; recurring customs read "Used by N projects".
  const indicatorComboItems: ComboboxItem[] = library
    .filter((lib) => !indicatorLines.some((l) => l.indicator_id === lib.id))
    .map((lib) => ({
      id: lib.id,
      label: lib.name,
      hint: lib.is_standard
        ? "Standard"
        : (lib.usage_project_count ?? 0) > 0
        ? `Used by ${lib.usage_project_count} project${lib.usage_project_count === 1 ? "" : "s"}`
        : "Custom",
    }));

  // ── Render ──────────────────────────────────────────────────────────────

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
      <div className="border-b px-8 h-32 flex items-center justify-between gap-4 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl font-bold font-qanelas truncate min-w-0" title={selectedDoc?.project_title}>{selectedDoc ? selectedDoc.project_title : "Project Document"}</h1>
            {/* Partners edit two kinds of prodocs: their own projects (they're the
                project lead) and ones they were granted editor rights on (owned by a
                different org — see [[project-editors-prodoc-rights]]). This badge tells
                the two apart at a glance by comparing the owner org to the login. */}
            {isPartner && selectedDoc && user?.partner_id != null && (
              <span
                className={cn(
                  "shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
                  selectedDoc.owner_partner_id === user.partner_id
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-violet-50 text-violet-700 border-violet-200"
                )}
              >
                {selectedDoc.owner_partner_id === user.partner_id ? "Project Lead" : "Implementing Partner"}
              </span>
            )}
            {!isPartner && selectedDoc && (
              <Select value={selectedDoc.status ?? "Open"} onValueChange={handleStatusChange}>
                <SelectTrigger className={`!h-7 w-fit shrink-0 px-2.5 text-xs font-semibold border rounded-full [&>svg]:size-3 [&>svg]:shrink-0 ${reportStatusStyle(selectedDoc.status ?? "Open")}`}>
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    {readOnly && <Lock className="size-3" />}
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {optionValues("reportStatus").map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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

        <div className="flex items-center gap-2 shrink-0">
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
            <SelectTrigger className="w-[320px] max-w-[45vw] h-9">
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
                  <SelectLabel>{shortName(partner)}</SelectLabel>
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

        {statusReadOnly && selectedProdocId && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <Lock className="size-3.5 shrink-0" />
            <span>
              This project document is <b>{selectedDoc?.status}</b> and is view-only
              {selectedDoc?.status === "Under Review" ? " for partners — only the CRAF'd Secretariat can unlock the project document" : ""}.
            </span>
          </div>
        )}

        {/* Lock acquisition in progress */}
        {selectedProdocId && lockPhase === "acquiring" && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-600">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            <span>Checking editor availability…</span>
          </div>
        )}

        {/* Editing session ended due to inactivity */}
        {selectedProdocId && lockPhase === "timed-out" && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <div className="flex items-center gap-2">
              <Lock className="size-3.5 shrink-0" />
              <span>Your editing session ended due to inactivity.</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-7 text-xs border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900"
              onClick={handleStartEditing}
            >
              Start editing
            </Button>
          </div>
        )}

        {/* Another session holds the lock */}
        {selectedProdocId && lockPhase === "blocked" && lockHolder && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <div className="flex items-center gap-2">
              <Lock className="size-3.5 shrink-0" />
              <span><b>{lockHolder.name}</b> is currently editing this document.</span>
            </div>
            {canOverride && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 h-7 text-xs border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900"
                onClick={handleAdminOverride}
              >
                Take over editing
              </Button>
            )}
          </div>
        )}

        {/* Lock just freed — user must click to claim it */}
        {selectedProdocId && lockPhase === "available" && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-900">
            <span>This document is now available.</span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-7 text-xs border-green-300 bg-green-50 hover:bg-green-100 text-green-900"
              onClick={handleStartEditing}
            >
              Start editing
            </Button>
          </div>
        )}

        {/* Inactivity warning — lock will expire in ~1 minute */}
        {selectedProdocId && lockPhase === "warning" && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-900">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>Your editing session will expire in 1 minute due to inactivity. Make a change to keep it.</span>
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
            report editor, so they're excluded here. Budgets carry their per-cell
            year × category notes instead, so the section thread is excluded too. */}
        {selectedProdocId && !sectionLoading &&
          !["risk", "indicators", "narratives", "workplan", "expenditure"].includes(selectedSection) && (
          <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
            {!isPartner && <span>Comment on this section:</span>}
            <ItemComments section={selectedSection} itemId={null} />
          </div>
        )}

        {/* Title sentence for the quant tabs (review feedback): the other sections'
            editors render their own tabInstructions box; these four sections render
            inline here. Hidden when view-only, like the General Information box. */}
        {selectedProdocId && !sectionLoading && !readOnly &&
          ["indicators", "risk", "expenditure", "workplan"].includes(selectedSection) && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {selectedSection === "indicators" ? labels.tabInstructions.prodocIndicators
              : selectedSection === "risk" ? labels.tabInstructions.prodocRisk
              : selectedSection === "expenditure" ? labels.tabInstructions.prodocBudgets
              : labels.tabInstructions.prodocWorkplan}
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
        <div
          className={cn("min-w-0", fillHeight && "flex flex-col h-full min-h-0")}
          onClick={noteEdit}
          onInput={noteEdit}
        >
        {!selectedProdocId ? (
          !params.project ? (
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
          ) : loadingDocs ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Loading project document…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <FileQuestion className="size-10 opacity-30" />
              <p className="text-sm">Project document not found.</p>
            </div>
          )

        ) : sectionLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
          </div>

        ) : selectedSection === "general" ? (
          selectedDoc ? <GeneralInfoAdminEditor projectId={selectedDoc.project_id} onSaveStateChange={handleSaveStateChange} isAdmin={!isPartner} readOnly={readOnly} /> : null

        ) : selectedSection === "risk" ? (
          <div className={cn("space-y-4", fillHeight && "flex flex-col flex-1 min-h-0 space-y-0 gap-4")}>
            <div className="flex gap-2">
              <Input placeholder={labels.placeholders.riskName} value={newRiskName} onChange={(e) => setNewRiskName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newRiskName.trim()) handleRiskAdd(); }} className="flex-1" />
              <div className="flex-1">
                <MultiSelect optionKey="riskCategory" value={newRiskCategory} onChange={setNewRiskCategory} placeholder={labels.placeholders.riskCategories} />
              </div>
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
                              {/* Edit inline, keeping each field in its own column
                                  (name + categories in Risk; likelihood/impact stay
                                  the inline dropdowns; mitigation in its column). */}
                              <td className="px-4 py-3 align-top">
                                <div className="flex flex-col gap-2">
                                  <Input value={editingRiskName} onChange={(e) => setEditingRiskName(e.target.value)} placeholder={labels.placeholders.riskName} className="text-sm" autoFocus />
                                  <MultiSelect optionKey="riskCategory" value={editingRiskCategory} onChange={setEditingRiskCategory} placeholder={labels.placeholders.riskCategories} />
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
                                <Textarea value={editingRiskApprovedMitigation} onChange={(e) => setEditingRiskApprovedMitigation(e.target.value)} placeholder={labels.placeholders.approvedMitigation} className="text-sm min-h-[80px] resize-y" />
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center justify-end gap-2">
                                  <Button size="sm" variant="outline" onClick={() => handleRiskEditSave(risk.id)}>{labels.adminEditor.save}</Button>
                                  <Button size="sm" variant="outline" onClick={() => { setEditingRiskId(null); setEditingRiskName(""); setEditingRiskCategory([]); setEditingRiskApprovedMitigation(""); }}>{labels.common.cancel}</Button>
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
                                      <div className="mt-1.5 flex flex-wrap gap-1">
                                        {risk.risk_category.map((cat) => (
                                          <span key={cat} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                            {cat}
                                          </span>
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
                                  <button onClick={() => { setEditingRiskId(risk.id); setEditingRiskName(risk.risk_name); setEditingRiskCategory(risk.risk_category ?? []); setEditingRiskApprovedMitigation(risk.approved_mitigation ?? ""); }} className="text-muted-foreground hover:text-foreground transition-colors">
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

            {/* Create panel — shown only after choosing "create a new one" from the
                search box. Indicators created here are always custom; name,
                description and means of verification are required. */}
            {creatingIndicator && (
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 max-w-3xl">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{labels.adminEditor.createIndicator}</p>
                  <Button variant="ghost" size="sm" onClick={cancelIndicatorCreate} className="h-7 px-2 text-muted-foreground">
                    <X className="size-4 mr-1" />{labels.adminEditor.cancel ?? "Cancel"}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input required placeholder={labels.placeholders.indicatorName} value={newIndName} onChange={(e) => setNewIndName(e.target.value)} className="flex-[2]" autoFocus />
                  <Input required placeholder={labels.placeholders.indicatorDescription} value={newIndDescription} onChange={(e) => setNewIndDescription(e.target.value)} className="flex-[2]" />
                  <Input required placeholder={labels.placeholders.meansOfVerification} value={newIndMeansOfVerification} onChange={(e) => setNewIndMeansOfVerification(e.target.value)} className="flex-[2]" />
                  <Button
                    onClick={submitIndicatorCreate}
                    disabled={addingIndicator || !newIndName.trim() || !newIndDescription.trim() || !newIndMeansOfVerification.trim()}
                    size="sm"
                    className="shrink-0"
                  >
                    {addingIndicator ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{labels.adminEditor.add}</>}
                  </Button>
                </div>
              </div>
            )}

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
                      {indicatorLines.map((line, i) => {
                            const num = i + 1;
                            const isEditing = editingIndicatorId === line.indicator_id;
                            return (
                              <tr key={line.id} className="transition-colors hover:bg-muted/20 align-top">
                                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{num}.</td>
                              <td className="px-4 py-3">
                                {isEditing ? (
                                  <div className="flex flex-col gap-1.5">
                                    <Input value={editingIndName} onChange={(e) => setEditingIndName(e.target.value)} placeholder={labels.placeholders.indicatorName} className="text-sm" autoFocus />
                                    <Input value={editingIndDescription} onChange={(e) => setEditingIndDescription(e.target.value)} placeholder={labels.placeholders.indicatorDescription} className="text-sm" />
                                    <Input value={editingIndMov} onChange={(e) => setEditingIndMov(e.target.value)} placeholder={labels.placeholders.meansOfVerification} className="text-sm" />
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium">{line.indicator_name}</p>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {!line.is_standard && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Custom</span>}
                                        {line.cycle && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{cycleLabel(line.cycle)}</span>}
                                      </div>
                                    </div>
                                    <InfoPopover description={line.indicator_description} meansOfVerification={line.means_of_verification} />
                                    <ItemComments section="indicators" itemId={line.id} />
                                  </div>
                                )}
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
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <Button size="sm" variant="outline" onClick={() => handleIndicatorEditSave(line.indicator_id)}>{labels.adminEditor.save}</Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingIndicatorId(null)}>{labels.common.cancel}</Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-2">
                                    {!readOnly && !line.is_standard && (
                                      <button onClick={() => { setEditingIndicatorId(line.indicator_id); setEditingIndName(line.indicator_name); setEditingIndDescription(line.indicator_description ?? ""); setEditingIndMov(line.means_of_verification ?? ""); }} className="text-muted-foreground hover:text-foreground transition-colors">
                                        <Pencil className="size-3.5" />
                                      </button>
                                    )}
                                    <button onClick={() => handleIndicatorDelete(line.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                            );
                      })}
                    </tbody>
                  </table>
                </div>
            )}
          </div>

        ) : selectedSection === "narratives" ? (
          selectedDoc ? <NarrativesAdminEditor projectId={selectedDoc.project_id} onSaveStateChange={handleSaveStateChange} readOnly={readOnly} /> : null

        ) : selectedSection === "sdg" ? (
          selectedDoc ? <SdgTargetsEditor projectId={selectedDoc.project_id} onSaveStateChange={handleSaveStateChange} readOnly={readOnly} /> : null

        ) : selectedSection === "signatures" ? (
          selectedDoc ? <SignaturesEditor projectId={selectedDoc.project_id} isAdmin={!isPartner} readOnly={readOnly} /> : null

        ) : selectedSection === "documents" ? (
          selectedDoc ? <DocumentsEditor projectId={selectedDoc.project_id} readOnly={readOnly} /> : null

        ) : selectedSection === "workplan" ? (
          // The project document defines only the baseline workplan (planned
          // activities + quarters). Report-time update windows are managed in the
          // report editor, not here.
          selectedDoc ? (
            <WorkplanAdminEditor projectId={selectedDoc.project_id} defaultAgent={selectedDoc.partner_short_name} fillHeight={fillHeight} />
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
