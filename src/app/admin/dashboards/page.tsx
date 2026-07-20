"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, LoadingState, ErrorBanner } from "@/components/admin/shared";
import { ProjectGantt, type GanttProject } from "@/components/admin/project-gantt";

export default function DashboardsPage() {
  const [projects, setProjects] = useState<GanttProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load projects");
      setProjects(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Dashboards" description="Visual overview of the CRAF'd portfolio" />

      <div className="flex-1 overflow-auto px-8 py-6 space-y-8">
        {error && <ErrorBanner message={error} />}

        {loading ? (
          <LoadingState />
        ) : (
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Project periods</h2>
              <p className="text-xs text-muted-foreground">Start date through end of duration for every project.</p>
            </div>
            <ProjectGantt projects={projects} />
          </section>
        )}
      </div>
    </div>
  );
}
