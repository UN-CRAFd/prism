"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  UploadCloud, FileSpreadsheet, X,
  Download, ArrowUpFromLine, ArrowDownToLine, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────

const UPLOAD_SECTIONS = [
  { value: "surveys", label: "Surveys" },
  { value: "risk",    label: "Risk Management" },
];

// Report-scoped sections (annual/final report data). Only meaningful when the
// export includes reports.
const REPORT_DOWNLOAD_SECTIONS = [
  { value: "overview",          label: "Overview" },
  { value: "surveys",           label: "Surveys" },
  { value: "achievements",      label: "Key Achievements" },
  { value: "partnerships",      label: "Partnerships" },
  { value: "results",           label: "Results" },
  { value: "lessons",           label: "Lessons Learned" },
  { value: "external_coverage", label: "External Coverage" },
  { value: "testimonials",      label: "Testimonials" },
  { value: "risk",              label: "Risk Management" },
  { value: "indicators",        label: "Indicators" },
  { value: "workplan",          label: "Workplan" },
  { value: "expenditure",       label: "Expenditure" },
  { value: "transfers",         label: "Transfers" },
  { value: "complementary",     label: "Complementary Funding" },
];

// Prodoc (project-document) sections — project-scoped, no report year. Only
// meaningful when the export includes prodocs.
const PRODOC_DOWNLOAD_SECTIONS = [
  { value: "prodoc_narratives",  label: "Narratives" },
  { value: "prodoc_sdg_targets", label: "SDG Targets" },
  { value: "prodoc_workplan",    label: "Baseline Workplan" },
  { value: "prodoc_budgets",     label: "Baseline Budgets" },
  { value: "prodoc_signatures",  label: "Signatures" },
];

type ExportType = "report" | "prodoc" | "both";

// The "overview" section is report-scoped but adds project meta useful to any
// export; the workplan section is report-only (baseline lives in prodoc_workplan).
const REPORT_ONLY_SECTIONS = new Set(["workplan"]);

interface ProjectOpt {
  id: number;
  project_title: string;
  short_name: string | null;
  partner_short_name: string;
}

const SCHEMA: Record<string, { required: string; optional?: string }> = {
  surveys: {
    required: "year · project_name · question",
    optional: "assessment · context",
  },
  risk: {
    required: "year · project_name · risk_name",
    optional: "risk_category · likelihood · impact · approved_mitigation · updated_mitigation · project_revision",
  },
};

type UploadState = "idle" | "ready" | "uploading" | "success" | "error";

// ── Dropzone ───────────────────────────────────────────────────────────────

function FileDropzone({
  onFile, file, onClear, state,
}: {
  onFile: (f: File) => void;
  file: File | null;
  onClear: () => void;
  state: UploadState;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  return (
    <div
      className={cn(
        "relative rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3 text-center cursor-pointer min-h-[160px]",
        dragging
          ? "border-primary bg-primary/5 scale-[1.01]"
          : file
          ? "border-solid border-neutral-300 bg-muted/20 cursor-default"
          : "border-border hover:border-neutral-400 hover:bg-muted/10"
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !file && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />

      {file ? (
        <>
          <FileSpreadsheet className="size-7 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
          {state !== "uploading" && (
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </>
      ) : (
        <>
          <div className="rounded-full bg-muted p-3">
            <UploadCloud className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Drop your file here</p>
            <p className="text-xs text-muted-foreground mt-0.5">CSV or XLSX · click to browse</p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Upload panel ───────────────────────────────────────────────────────────

function ImportPanel() {
  const [section, setSection] = useState("surveys");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);

  function clear() {
    setFile(null); setState("idle"); setMessage(""); setResult(null);
  }

  async function handleUpload() {
    if (!file) return;
    setState("uploading"); setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("section", section);
      const res = await fetch("/api/upload/file", { method: "POST", body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Upload failed");
      setState("success");
      setResult(d);
      setMessage(`${d.inserted} inserted · ${d.skipped} skipped`);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Upload failed");
    }
  }

  const schema = SCHEMA[section];

  return (
    <div className="flex flex-col h-full">
      {/* Card header */}
      <div className="flex items-center gap-3 pb-5 border-b">
        <div className="rounded-lg bg-muted p-2.5">
          <ArrowUpFromLine className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold">Import data</p>
          <p className="text-xs text-muted-foreground">CSV or XLSX, one section at a time</p>
        </div>
      </div>

      <div className="flex flex-col gap-5 pt-5 flex-1">
        {/* Section tabs */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Section</p>
          <div className="flex gap-1 p-1 rounded-lg bg-muted">
            {UPLOAD_SECTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => { setSection(s.value); clear(); }}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                  section === s.value
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Schema hint */}
        {schema && (
          <div className="rounded-lg bg-muted/40 border px-3.5 py-3 space-y-1">
            <div className="flex gap-1.5 text-xs">
              <span className="font-medium text-foreground shrink-0">Required:</span>
              <span className="font-mono text-muted-foreground">{schema.required}</span>
            </div>
            {schema.optional && (
              <div className="flex gap-1.5 text-xs">
                <span className="font-medium text-foreground shrink-0">Optional:</span>
                <span className="font-mono text-muted-foreground">{schema.optional}</span>
              </div>
            )}
          </div>
        )}

        {/* Dropzone */}
        <FileDropzone
          onFile={(f) => { setFile(f); setState("ready"); setMessage(""); }}
          file={file}
          onClear={clear}
          state={state}
        />

        {/* Feedback */}
        {message && (
          <p className={cn("text-xs font-medium", state === "error" ? "text-destructive" : "text-green-600")}>
            {message}
          </p>
        )}
        {result && result.errors.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1 max-h-28 overflow-auto">
            {result.errors.map((e, i) => (
              <p key={i} className="text-xs text-amber-700">{e}</p>
            ))}
          </div>
        )}

        <div className="mt-auto">
          <Button
            onClick={handleUpload}
            disabled={!file || state === "uploading" || state === "success"}
            className="w-full"
            size="sm"
          >
            {state === "uploading" ? "Uploading…" : state === "success" ? "Uploaded" : "Upload"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Section multi-select dropdown ────────────────────────────────────────────
// A checkbox dropdown for one section group (report or prodoc). `selected` is
// the full sections state; onToggle flips one value; the trigger summarizes how
// many of this group's items are picked.

function SectionMultiSelect({
  label,
  items,
  selected,
  onToggle,
  onSetAll,
}: {
  label: string;
  items: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  onSetAll: (values: string[], select: boolean) => void;
}) {
  const values = items.map((i) => i.value);
  const count = values.filter((v) => selected.includes(v)).length;
  const allSelected = count === values.length;
  const triggerLabel =
    count === 0 ? `No ${label.toLowerCase()}`
    : allSelected ? `All ${label.toLowerCase()}`
    : `${count} of ${values.length} selected`;

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full h-9 justify-between font-normal">
            <span className={cn("truncate", count === 0 && "text-muted-foreground")}>{triggerLabel}</span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[320px] max-h-[420px] overflow-y-auto">
          <DropdownMenuCheckboxItem
            checked={allSelected}
            onCheckedChange={() => onSetAll(values, !allSelected)}
            onSelect={(e) => e.preventDefault()}
          >
            {allSelected ? "Clear all" : "Select all"}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {items.map((i) => (
            <DropdownMenuCheckboxItem
              key={i.value}
              checked={selected.includes(i.value)}
              onCheckedChange={() => onToggle(i.value)}
              onSelect={(e) => e.preventDefault()}
            >
              {i.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Download panel ─────────────────────────────────────────────────────────

function ExportPanel() {
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  // Empty = all projects.
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  // Reports and project documents are independent toggles; either or both.
  const [wantReport, setWantReport] = useState(true);
  const [wantProdoc, setWantProdoc] = useState(true);
  const [sections, setSections] = useState<string[]>([
    ...REPORT_DOWNLOAD_SECTIONS.map((s) => s.value),
    ...PRODOC_DOWNLOAD_SECTIONS.map((s) => s.value),
  ]);
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // The request's `type` param, derived from the two toggles.
  const type: ExportType =
    wantReport && wantProdoc ? "both" : wantProdoc ? "prodoc" : "report";

  // The section values exposed by the chosen data type(s). Anything outside this
  // set is never submitted, so a report-only section can't leak into a prodoc-only
  // export.
  const visibleValues = useMemo(() => {
    const set = new Set<string>();
    if (wantReport) REPORT_DOWNLOAD_SECTIONS.forEach((s) => set.add(s.value));
    if (wantProdoc) PRODOC_DOWNLOAD_SECTIONS.forEach((s) => set.add(s.value));
    return set;
  }, [wantReport, wantProdoc]);

  // Sections actually submitted: intersection of the user's picks with what the
  // chosen type exposes (so a report-only section can't leak into a prodoc export).
  const effectiveSections = useMemo(
    () => sections.filter((s) => visibleValues.has(s) && !(REPORT_ONLY_SECTIONS.has(s) && !wantReport)),
    [sections, visibleValues, wantReport]
  );

  function toggleSection(val: string) {
    setSections((prev) => (prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]));
  }

  // Bulk select/clear a group's values in the sections state.
  function setAllSections(values: string[], select: boolean) {
    setSections((prev) =>
      select ? [...new Set([...prev, ...values])] : prev.filter((s) => !values.includes(s))
    );
  }

  function toggleProject(id: number) {
    setSelectedProjectIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Projects grouped by partner for the dropdown.
  const groupedProjects = useMemo(() => {
    const map = new Map<string, ProjectOpt[]>();
    for (const p of projects) {
      const g = map.get(p.partner_short_name);
      if (g) g.push(p);
      else map.set(p.partner_short_name, [p]);
    }
    return Array.from(map.entries())
      .map(([partner, items]) => ({ partner, items }))
      .sort((a, b) => a.partner.localeCompare(b.partner));
  }, [projects]);

  const projectFilterLabel = (() => {
    if (selectedProjectIds.length === 0) return "All projects";
    if (selectedProjectIds.length === 1) {
      const p = projects.find((x) => x.id === selectedProjectIds[0]);
      return p ? p.short_name || p.project_title : "1 project";
    }
    return `${selectedProjectIds.length} projects selected`;
  })();

  async function handleDownload() {
    if (effectiveSections.length === 0 && !includeDocuments && !includePhotos) return;
    setDownloading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("type", type);
      for (const s of effectiveSections) params.append("sections", s);
      for (const id of selectedProjectIds) params.append("projects", String(id));
      if (includeDocuments) params.set("documents", "true");
      if (includePhotos) params.set("photos", "true");

      const res = await fetch(`/api/download/zip?${params.toString()}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "export.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  // Need a data type chosen, and at least one section or file kind to include.
  const nothingToExport =
    (!wantReport && !wantProdoc) ||
    (effectiveSections.length === 0 && !includeDocuments && !includePhotos);

  return (
    <div className="flex flex-col h-full">
      {/* Card header */}
      <div className="flex items-center gap-3 pb-5 border-b">
        <div className="rounded-lg bg-muted p-2.5">
          <ArrowDownToLine className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold">Export data</p>
          <p className="text-xs text-muted-foreground">Bundle CSVs and uploaded files into a ZIP</p>
        </div>
      </div>

      <div className="flex flex-col gap-5 pt-5 flex-1">
        {/* Scope: projects + type */}
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Projects</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full h-9 justify-between font-normal">
                  <span className={cn("truncate", selectedProjectIds.length === 0 && "text-muted-foreground")}>
                    {projectFilterLabel}
                  </span>
                  <ChevronDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[320px] max-h-[420px] overflow-y-auto">
                <DropdownMenuCheckboxItem
                  checked={selectedProjectIds.length === 0}
                  onCheckedChange={() => setSelectedProjectIds([])}
                  onSelect={(e) => e.preventDefault()}
                >
                  All projects
                </DropdownMenuCheckboxItem>
                {groupedProjects.map((g) => (
                  <DropdownMenuGroup key={g.partner}>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">{g.partner?.toUpperCase()}</DropdownMenuLabel>
                    {g.items.map((p) => (
                      <DropdownMenuCheckboxItem
                        key={p.id}
                        checked={selectedProjectIds.includes(p.id)}
                        onCheckedChange={() => toggleProject(p.id)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {p.short_name || p.project_title}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuGroup>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Include</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm">
                <input type="checkbox" checked={wantReport} onChange={(e) => setWantReport(e.target.checked)} className="size-4" />
                <span className="font-medium">Reports</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm">
                <input type="checkbox" checked={wantProdoc} onChange={(e) => setWantProdoc(e.target.checked)} className="size-4" />
                <span className="font-medium">Project Docs</span>
              </label>
            </div>
          </div>
        </div>

        {/* Section dropdowns — one per selected data type */}
        {(wantReport || wantProdoc) && (
          <div className="flex flex-col gap-3">
            {wantReport && (
              <SectionMultiSelect
                label="Report sections"
                items={REPORT_DOWNLOAD_SECTIONS}
                selected={sections}
                onToggle={toggleSection}
                onSetAll={setAllSections}
              />
            )}
            {wantProdoc && (
              <SectionMultiSelect
                label="Project-document sections"
                items={PRODOC_DOWNLOAD_SECTIONS}
                selected={sections}
                onToggle={toggleSection}
                onSetAll={setAllSections}
              />
            )}
          </div>
        )}

        {/* Uploaded files */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Uploaded files</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm">
              <input type="checkbox" checked={includeDocuments} onChange={(e) => setIncludeDocuments(e.target.checked)} className="size-4" />
              <span className="font-medium">Documents</span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm">
              <input type="checkbox" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} className="size-4" />
              <span className="font-medium">Photos</span>
            </label>
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-lg bg-muted/40 border px-3.5 py-3">
          {nothingToExport ? (
            <p className="text-xs text-muted-foreground">Nothing selected — pick at least one section or file type.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Exporting{" "}
              <span className="font-medium text-foreground">{projectFilterLabel.toLowerCase()}</span>
              {" · "}
              <span className="font-medium text-foreground">{effectiveSections.length} section{effectiveSections.length !== 1 ? "s" : ""}</span>
              {(includeDocuments || includePhotos) && (
                <>
                  {" · "}
                  {[includeDocuments && "documents", includePhotos && "photos"].filter(Boolean).join(" + ")}
                </>
              )}
              .
            </p>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="mt-auto">
          <Button
            onClick={handleDownload}
            disabled={nothingToExport || downloading}
            className="w-full"
            size="sm"
          >
            <Download className="size-3.5" />
            {downloading ? "Preparing…" : "Download ZIP"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function UploadDownloadPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-8 h-32 flex flex-col justify-center shrink-0">
        <h1 className="text-2xl font-bold font-qanelas">Import / Export</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Bulk import section data or export all reports as CSV files
        </p>
      </div>

      <div className="flex-1 overflow-auto px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-card p-6 flex flex-col">
            <ImportPanel />
          </div>
          <div className="rounded-xl border bg-card p-6 flex flex-col">
            <ExportPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
