"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { projectSlug } from "@/lib/utils";
import { ArrowRight, FileText } from "lucide-react";
import labels from "@/lib/labels";
import type { Report } from "@/lib/types";
import { StatusPill } from "@/components/partner/status-pill";

export function ProdocList() {
  const { user } = useAuth();
  const router = useRouter();

  const [prodocs, setProdocs] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        const res = await fetch("/api/reports?data_type=prodoc");
        if (!res.ok) throw new Error("Failed to load project documents");
        const all: Report[] = await res.json();
        setProdocs(all);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  // De-duplicate by project slug (same as sidebar prodocItems)
  const slug = (r: Report) => projectSlug(r.project_short_name, r.project_title);
  const items = Array.from(new Map(prodocs.map((p) => [slug(p), p])).values());

  // Fetch completion for each unique project
  useEffect(() => {
    if (items.length === 0) return;
    Promise.all(
      items.map((r) =>
        fetch(`/api/prodoc-completion?projectId=${r.project_id}`)
          .then((res) => res.json())
          .then((data: { sections?: Record<string, boolean> }) => {
            const sections = data.sections ?? {};
            const keys = Object.keys(sections);
            const trueCount = Object.values(sections).filter(Boolean).length;
            const pct = keys.length > 0 ? Math.round((trueCount / keys.length) * 100) : 0;
            return { id: r.project_id, pct };
          })
          .catch(() => ({ id: r.project_id, pct: 0 }))
      )
    ).then((results) => {
      const c: Record<number, number> = {};
      for (const { id, pct } of results) c[id] = pct;
      setCompletion(c);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodocs]);

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <h1 className="t-title-banner">{labels.prodocList.title}</h1>
      </div>

      <div className="flex-1 px-8 py-8">
        {loading && (
          <p className="text-sm text-muted-foreground">{labels.prodocList.loading}</p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-xl border bg-card px-6 py-12 text-center mt-4">
            <FileText className="mx-auto size-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {labels.prodocList.empty}
            </p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="pt-8">
            <div className="rounded-xl border bg-card overflow-hidden divide-y">
              {items.map((row) => {
                const pct = completion[row.project_id] ?? 0;
                return (
                  <div
                    key={slug(row)}
                    className="px-6 py-4 flex items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-base font-semibold truncate">{row.project_title}</p>
                        <StatusPill status={row.status} />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${pct === 100 ? "bg-emerald-500" : "bg-crafd-yellow"} rounded-full transition-all duration-300`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                          {pct}%
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        router.push(
                          `/partner/prodoc-editor/${slug(row)}/general`
                        )
                      }
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-crafd-yellow px-3 py-1.5 text-sm font-semibold text-black hover:bg-crafd-yellow-900 transition-colors"
                    >
                      {labels.prodocList.open}
                      <ArrowRight className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
