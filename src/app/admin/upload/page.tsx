"use client";

export const dynamic = "force-dynamic";

import { useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, FileArchive, Info, X, CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { value: "surveys", label: "Surveys" },
  { value: "risk", label: "Risk Management" },
];

type UploadState = "idle" | "ready" | "uploading" | "success" | "error";

function FileDropzone({
  accept,
  label,
  hint,
  onFile,
  file,
  onClear,
  state,
}: {
  accept: string;
  label: string;
  hint: string;
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
        "relative rounded-xl border-2 border-dashed transition-colors px-6 py-8 flex flex-col items-center gap-3 text-center cursor-pointer",
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-neutral-400",
        file && "border-solid border-neutral-300 bg-muted/30"
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !file && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />

      {file ? (
        <>
          {state === "success" ? (
            <CheckCircle2 className="size-8 text-green-500" />
          ) : (
            <FileSpreadsheet className="size-8 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
          {state !== "uploading" && (
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </>
      ) : (
        <>
          <UploadCloud className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
          </div>
        </>
      )}
    </div>
  );
}

function NamingConvention({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 flex gap-2.5">
      <Info className="size-3.5 shrink-0 text-muted-foreground mt-0.5" />
      <div className="space-y-0.5 flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Naming convention</p>
        {lines.map((l, i) =>
          l === `` ? <div key={i} className="h-1" /> : <p key={i} className="text-xs font-mono text-foreground whitespace-nowrap">{l}</p>
        )}
      </div>
    </div>
  );
}

// ── Individual file upload panel ───────────────────────────────────────────

function IndividualUpload() {
  const [section, setSection] = useState("surveys");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);

  function handleFile(f: File) {
    setFile(f);
    setState("ready");
    setMessage("");
  }

  function clear() {
    setFile(null);
    setState("idle");
    setMessage("");
    setResult(null);
  }

  async function handleUpload() {
    if (!file) return;
    setState("uploading");
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("section", section);
      const res = await fetch("/api/upload/file", { method: "POST", body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Upload failed");
      setState("success");
      setResult(d);
      setMessage(`Done: ${d.inserted} inserted, ${d.skipped} skipped.`);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Upload failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Section</p>
        <Select value={section} onValueChange={(v) => { setSection(v); clear(); }}>
          <SelectTrigger className="w-48 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {section === "surveys" ? (
        <NamingConvention lines={[
          `Required columns:`,
          `  year · project_name · question`,
          `  assessment · context  (optional)`,
          ``,
          `year + project_name are matched to the`,
          `corresponding report in the database.`,
        ]} />
      ) : (
        <NamingConvention lines={[
          `Required columns:`,
          `  year · project_name · risk_name`,
          ``,
          `Optional columns:`,
          `  risk_category  (comma-separated)`,
          `  likelihood     (1–5 or Rare/Unlikely/`,
          `                  Possible/Likely/Very Likely)`,
          `  impact         (1–5 or Insignificant/`,
          `                  Minor/Moderate/Major/Extreme)`,
          `  approved_mitigation · updated_mitigation`,
          `  project_revision   (yes/no)`,
        ]} />
      )}

      <FileDropzone
        accept=".csv,.xlsx"
        label="Drop a CSV or XLSX file here"
        hint="or click to browse"
        onFile={handleFile}
        file={file}
        onClear={clear}
        state={state}
      />

      {message && (
        <p className={cn("text-xs", state === "error" ? "text-destructive" : "text-green-600")}>
          {message}
        </p>
      )}
      {result && result.errors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1 max-h-32 overflow-auto">
          {result.errors.map((e, i) => (
            <p key={i} className="text-xs text-amber-700">{e}</p>
          ))}
        </div>
      )}

      <Button
        onClick={handleUpload}
        disabled={!file || state === "uploading" || state === "success"}
        className="w-full"
        size="sm"
      >
        {state === "uploading" ? "Uploading…" : state === "success" ? "Uploaded" : "Upload"}
      </Button>
    </div>
  );
}

// ── ZIP download panel ─────────────────────────────────────────────────────

function ZipDownload() {
  const [sections, setSections] = useState<string[]>(["surveys"]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  function toggleSection(val: string) {
    setSections((prev) =>
      prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]
    );
  }

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

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Include sections</p>
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => toggleSection(s.value)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                sections.includes(s.value)
                  ? "border-neutral-800 bg-neutral-900 text-white"
                  : "border-border text-muted-foreground hover:border-neutral-400"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <NamingConvention lines={[
        `Each section exported as a CSV:`,
        `  surveys_[partner]_[year].csv`,
        `  risk_[partner]_[year].csv`,
        ``,
        `Surveys: year · project_name · question`,
        `         assessment · context`,
        `Risk:    year · project_name · risk_name`,
        `         risk_category · likelihood · impact`,
        `         approved_mitigation · updated_mitigation`,
        `         project_revision`,
      ]} />

      <div className="rounded-xl border-2 border-dashed border-border px-6 py-8 flex flex-col items-center gap-2 text-center text-muted-foreground">
        <FileArchive className="size-8 opacity-40" />
        <p className="text-sm">Selected sections will be bundled into a ZIP</p>
        <p className="text-xs opacity-60">{sections.length === 0 ? "No sections selected" : sections.map((s) => SECTIONS.find((x) => x.value === s)?.label).join(", ")}</p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button
        onClick={handleDownload}
        disabled={sections.length === 0 || downloading}
        className="w-full"
        size="sm"
      >
        <Download className="size-3.5 mr-1.5" />
        {downloading ? "Preparing…" : "Download ZIP"}
      </Button>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function UploadDownloadPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-8 h-32 flex flex-col justify-center shrink-0">
        <h1 className="text-2xl font-bold font-qanelas">Upload / Download</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Import section data via individual files or a ZIP archive
        </p>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">Upload by section</p>
                <p className="text-xs text-muted-foreground">CSV or XLSX, one section at a time</p>
              </div>
            </div>
            <IndividualUpload />
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <FileArchive className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">Download as ZIP</p>
                <p className="text-xs text-muted-foreground">Export selected sections as CSVs bundled in a ZIP</p>
              </div>
            </div>
            <ZipDownload />
          </div>

        </div>
      </div>
    </div>
  );
}
