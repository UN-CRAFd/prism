"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader, LoadingState, ErrorBanner } from "@/components/admin/shared";
import { reportStatusStyle } from "@/lib/reports";

interface VersionLogEntry {
  id: number;
  entity_type: "report" | "prodoc" | "project";
  entity_id: number;
  entity_label: string | null;
  project_id: number;
  from_status: string | null;
  to_status: string;
  actor_role: "admin" | "partner";
  actor_org: string | null;
  actor_name: string | null;
  reason: string | null;
  created_at: string;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actorLabel(entry: VersionLogEntry): string {
  if (entry.actor_role === "partner") return entry.actor_org ?? "Partner";
  return entry.actor_name ?? "CRAF’d Secretariat";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium", reportStatusStyle(status))}>
      {status}
    </span>
  );
}

function EntryCard({ entry }: { entry: VersionLogEntry }) {
  const label = entry.entity_label ?? entry.project_title;
  const project = entry.project_short_name ?? entry.project_title;
  const partner = entry.partner_short_name ?? entry.actor_org ?? "";

  return (
    <div className="rounded-xl border bg-card px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{label}</p>
          <p className="text-xs text-muted-foreground truncate">
            {project}{partner ? ` · ${partner}` : ""}
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{formatDate(entry.created_at)}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {entry.from_status ? (
          <>
            <StatusPill status={entry.from_status} />
            <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
            <StatusPill status={entry.to_status} />
          </>
        ) : (
          <StatusPill status={entry.to_status} />
        )}
        <span className="text-xs text-muted-foreground">by {actorLabel(entry)}</span>
      </div>

      {entry.reason && (
        <p className="text-xs text-muted-foreground italic">{entry.reason}</p>
      )}
    </div>
  );
}

export default function VersionLogPage() {
  const [entries, setEntries] = useState<VersionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/version-log");
      if (!res.ok) throw new Error("Failed to load version log");
      setEntries(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Version Log" description="Status transitions on reports, project documents and projects" />

      <div className="flex-1 overflow-auto px-8 py-6 space-y-3">
        {error && <ErrorBanner message={error} />}

        {loading ? (
          <LoadingState />
        ) : entries.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            <History className="size-5 mx-auto mb-2 opacity-40" />
            No status transitions recorded yet.
          </div>
        ) : (
          entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
