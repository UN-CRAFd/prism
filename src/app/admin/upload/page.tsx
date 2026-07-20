"use client";

export const dynamic = "force-dynamic";

import { useRef, useState } from "react";
import {
  UploadCloud, FileSpreadsheet, X,
  CheckCircle2, Download, ArrowUpFromLine, ArrowDownToLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────

const UPLOAD_SECTIONS = [
  { value: "surveys", label: "Surveys" },
  { value: "risk",    label: "Risk Management" },
];

const DOWNLOAD_SECTIONS = [
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
          {state === "success"
            ? <CheckCircle2 className="size-7 text-green-500" />
            : <FileSpreadsheet className="size-7 text-muted-foreground" />}
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

// ── Download panel ─────────────────────────────────────────────────────────

function ExportPanel() {
  const [sections, setSections] = useState<string[]>(DOWNLOAD_SECTIONS.map((s) => s.value));
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  function toggle(val: string) {
    setSections((prev) =>
      prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]
    );
  }

  const allSelected = sections.length === DOWNLOAD_SECTIONS.length;

  async function handleDownload() {
    if (sections.length === 0) return;
    setDownloading(true);
    setError("");
    try {
      const params = sections.map((s) => `sections=${s}`).join("&");
      const res = await fetch(`/api/download/zip?${params}`);
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

  const selectedLabels = sections
    .map((v) => DOWNLOAD_SECTIONS.find((s) => s.value === v)?.label)
    .filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      {/* Card header */}
      <div className="flex items-center gap-3 pb-5 border-b">
        <div className="rounded-lg bg-muted p-2.5">
          <ArrowDownToLine className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold">Export data</p>
          <p className="text-xs text-muted-foreground">All reports, bundled as CSV files in a ZIP</p>
        </div>
      </div>

      <div className="flex flex-col gap-5 pt-5 flex-1">
        {/* Section toggles */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">Sections to include</p>
            <button
              onClick={() => setSections(allSelected ? [] : DOWNLOAD_SECTIONS.map((s) => s.value))}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DOWNLOAD_SECTIONS.map((s) => {
              const active = sections.includes(s.value);
              return (
                <button
                  key={s.value}
                  onClick={() => toggle(s.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-neutral-800 bg-neutral-900 text-white"
                      : "border-border text-muted-foreground hover:border-neutral-400 hover:text-foreground"
                  )}
                >
                  <span className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    active ? "border-white bg-white" : "border-neutral-400"
                  )}>
                    {active && <CheckCircle2 className="size-3 text-neutral-900" />}
                  </span>
                  <span className="text-sm font-medium truncate">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-lg bg-muted/40 border px-3.5 py-3">
          {selectedLabels.length === 0 ? (
            <p className="text-xs text-muted-foreground">No sections selected — pick at least one above.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{selectedLabels.length} section{selectedLabels.length !== 1 ? "s" : ""}</span>
              {" "}will be exported: {selectedLabels.join(", ")}.
            </p>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="mt-auto">
          <Button
            onClick={handleDownload}
            disabled={sections.length === 0 || downloading}
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
