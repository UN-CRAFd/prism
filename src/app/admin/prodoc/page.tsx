"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer, Pencil, CalendarDays, CheckCircle2, Circle } from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import { ReportRow } from "@/components/admin/report-components";

function ProDocCard({
  doc,
  onOpen,
}: {
  doc: ReportRow;
  onOpen: () => void;
}) {
  return (
    <Card
      onClick={onOpen}
      className="group relative p-3.5 border bg-card cursor-pointer transition-colors hover:bg-muted/50"
    >
      <div className="absolute right-2.5 top-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); window.print(); }}
          className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
          title="Print"
        >
          <Printer className="size-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
          title="Edit"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>

      <div className="pr-20">
        <p className="truncate text-[15px] font-bold leading-snug" title={doc.project_short_name || doc.project_title}>
          {doc.project_short_name || doc.project_title}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {doc.partner_long_name || doc.partner_short_name}
        </p>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="gap-1 text-xs">
          <CalendarDays className="size-3" /> {doc.year}
        </Badge>
        {doc.authorized ? (
          <Badge className="gap-1 text-xs bg-green-500/15 text-green-700 hover:bg-green-500/15">
            <CheckCircle2 className="size-3" /> Authorized
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
            <Circle className="size-3" /> Pending
          </Badge>
        )}
      </div>
    </Card>
  );
}

export default function ProDocPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rRes = await fetch("/api/reports?data_type=prodoc");
      if (!rRes.ok) throw new Error("Failed to load project documents");
      setDocs(await rRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Open a project document in the prodoc editor (project-scoped, defaults to the
  // first section). Slug matches the editor's toSlug convention.
  function openDoc(doc: ReportRow) {
    const slug = (doc.project_short_name ?? doc.project_title).toLowerCase().replace(/\s+/g, "-");
    router.push(`/admin/prodoc-editor/${slug}/surveys`);
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Project Documents"
        description="One project document is created automatically with each project"
      />

      <div className="flex-1 overflow-auto px-8 py-6 space-y-8">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            No project documents yet. Create a project and its document appears here automatically.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {docs.map((doc) => (
              <ProDocCard
                key={doc.id}
                doc={doc}
                onOpen={() => openDoc(doc)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
