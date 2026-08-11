"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/utils";
import { Loader2, Upload, FileText, Download, Trash2 } from "lucide-react";
import labels from "@/lib/labels.json";
import {
  DOCUMENT_TYPES, DOC_ACCEPT, MAX_DOC_MB, isAllowedDocExtension, formatFileSize,
} from "@/lib/documents";

// ── Documents / annexes editor ────────────────────────────────────────────────
// Partner-uploaded documents attached to the project document. Each upload has a
// type (fixed list), an optional document date, and the file itself. Files are
// stored in the DB (bytea) — see /api/project-documents. Uploads are capped at
// MAX_DOC_MB. Immediate saves (no autosave): upload/delete hit the API directly.

const d = labels.documents;

interface ProjectDocument {
  id: number;
  project_id: number;
  doc_type: string;
  doc_date: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

export function DocumentsEditor({
  projectId,
  readOnly = false,
}: {
  projectId: number;
  readOnly?: boolean;
}) {
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload form state.
  const [docType, setDocType] = useState<string>("");
  const [docDate, setDocDate] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/project-documents?project_id=${projectId}`);
        if (!res.ok) throw new Error("Failed to load documents");
        if (cancelled) return;
        setDocuments(await res.json());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  function pickFile(f: File | null) {
    setError(null);
    if (f && !isAllowedDocExtension(f.name)) {
      setError(d.errorType);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (f && f.size > MAX_DOC_MB * 1024 * 1024) {
      setError(d.errorSize.replace("{mb}", String(MAX_DOC_MB)));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(f);
  }

  async function handleUpload() {
    if (!docType) { setError(d.errorNoType); return; }
    if (!file) { setError(d.errorNoFile); return; }
    setUploading(true); setError(null);
    try {
      const body = new FormData();
      body.append("project_id", String(projectId));
      body.append("doc_type", docType);
      if (docDate) body.append("doc_date", docDate);
      body.append("file", file);
      const res = await fetch("/api/project-documents", { method: "POST", body });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to upload"); }
      const created: ProjectDocument = await res.json();
      setDocuments((prev) => [created, ...prev]);
      // Reset the form for the next upload.
      setDocType(""); setDocDate(""); setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setUploading(false); }
  }

  async function handleDelete(doc: ProjectDocument) {
    if (!await confirm({ message: d.deleteConfirm.replace("{name}", doc.file_name), confirmLabel: d.delete, variant: "destructive" })) return;
    setDeletingId(doc.id); setError(null);
    try {
      const res = await fetch(`/api/project-documents?id=${doc.id}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to delete"); }
      setDocuments((prev) => prev.filter((x) => x.id !== doc.id));
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setDeletingId(null); }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!readOnly && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {labels.tabInstructions.documents}
        </div>
      )}

      {/* Upload form */}
      {!readOnly && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{d.uploadHeading}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{d.columns.type}</label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="w-full"><SelectValue placeholder={d.typePlaceholder} /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{d.columns.date}</label>
              <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className="w-full" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{d.columns.file}</label>
              <input
                ref={fileInputRef}
                type="file"
                accept={DOC_ACCEPT}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent text-sm outline-none cursor-pointer file:cursor-pointer file:mr-3 file:h-full file:border-0 file:bg-muted file:px-3 file:text-xs file:font-medium"
              />
            </div>

            <Button onClick={handleUpload} disabled={uploading || !docType || !file} className="shrink-0">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <><Upload className="size-4 mr-1.5" />{d.upload}</>}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{d.allowedHint.replace("{mb}", String(MAX_DOC_MB))}</p>
        </div>
      )}

      {/* List of documents */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b">
          <FileText className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{d.listHeading}</h3>
          <span className="text-xs text-muted-foreground">({documents.length})</span>
        </div>

        {documents.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">{d.empty}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-6 py-3 font-medium">{d.columns.type}</th>
                <th className="px-4 py-3 font-medium w-32">{d.columns.date}</th>
                <th className="px-4 py-3 font-medium">{d.columns.file}</th>
                <th className="px-4 py-3 font-medium w-24">{d.columns.size}</th>
                <th className="px-4 py-3 font-medium w-40">{d.columns.uploaded}</th>
                <th className="px-4 py-3 font-medium w-20 text-right">{d.columns.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {documents.map((doc) => (
                <tr key={doc.id} className="transition-colors hover:bg-muted/20">
                  <td className="px-6 py-3">
                    <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{doc.doc_type}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{doc.doc_date ? formatDate(doc.doc_date) : "—"}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`/api/project-documents/${doc.id}`}
                      className="inline-flex items-center gap-1.5 text-blue-600 hover:underline break-all"
                    >
                      <Download className="size-3.5 shrink-0" />
                      {doc.file_name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatFileSize(doc.size_bytes)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(doc.created_at)}
                    {doc.uploaded_by ? <span className="block">{doc.uploaded_by}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!readOnly && (
                      <button
                        onClick={() => handleDelete(doc)}
                        disabled={deletingId === doc.id}
                        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                        aria-label={d.delete}
                      >
                        {deletingId === doc.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
