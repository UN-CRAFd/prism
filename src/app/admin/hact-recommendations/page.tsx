"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader, ErrorBanner, LoadingState, FilterBar, SearchInput } from "@/components/admin/shared";
import { shortName } from "@/lib/utils";

// HACT Recommendations — pick a project, then maintain its list at
// /admin/hact-recommendations/[projectId]. The list is shared with the HACT page
// of every project update of that project (see /api/hact-recommendations).

interface ProjectRow {
  id: number;
  project_title: string;
  short_name: string | null;
  status: string;
  partner_short_name: string;
}

export default function HactRecommendationsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) throw new Error("Failed to load projects");
        setProjects(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      [p.project_title, p.short_name, p.partner_short_name].some((v) => v?.toLowerCase().includes(q))
    );
  }, [projects, search]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="HACT Recommendations"
        description="Select a project to add, edit and track its HACT recommendations. Each project's list also appears in its project updates."
      />

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search projects…" />
      </FilterBar>

      <div className="flex-1 overflow-auto px-8 py-6">
        {error && <ErrorBanner message={error} />}

        {loading ? (
          <LoadingState />
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {visible.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">No projects found.</p>
            ) : (
              visible.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/hact-recommendations/${p.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">
                    {shortName(p.partner_short_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.project_title}</span>
                    {p.short_name && (
                      <span className="block text-xs text-muted-foreground">{p.short_name}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.status}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
