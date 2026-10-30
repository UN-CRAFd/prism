"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { projectSlug } from "@/lib/utils";
import { ArrowRight, RefreshCw } from "lucide-react";
import labels from "@/lib/labels";
import type { Report } from "@/lib/types";
import { StatusPill } from "@/components/partner/status-pill";
import { documentPath, documentTitle, firstUnlockedSection } from "@/lib/project-updates";

type UpdateReport = Report & { unlocked_sections?: string[] };

export default function ProjectUpdatesPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [updates, setUpdates] = useState<UpdateReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<Record<number, { completed: number; total: number }>>({});

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        const res = await fetch("/api/reports?data_type=update");
        if (!res.ok) throw new Error("Failed to load project updates");
        const all: UpdateReport[] = await res.json();
        setUpdates(all);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  useEffect(() => {
    if (updates.length === 0) return;
    Promise.all(
      updates.map((u) =>
        fetch(`/api/report-completion?reportId=${u.id}`)
          .then((res) => res.json())
          .then((data) => {
            const sections: Record<string, boolean> = data.sections ?? {};
            const unlocked = u.unlocked_sections ?? [];
            const completed = unlocked.filter((k) => sections[k] === true).length;
            return { id: u.id, completed, total: unlocked.length };
          })
          .catch(() => ({ id: u.id, completed: 0, total: 0 }))
      )
    ).then((results) => {
      const c: Record<number, { completed: number; total: number }> = {};
      for (const { id, completed, total } of results) c[id] = { completed, total };
      setCompletion(c);
    });
  }, [updates]);

  const byYear = updates.reduce<Record<number, UpdateReport[]>>((acc, u) => {
    (acc[u.year] ??= []).push(u);
    return acc;
  }, {});
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  const completionPct = (id: number) => {
    const { completed, total } = completion[id] ?? { completed: 0, total: 0 };
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };
  // Within a year: least complete first, then project title A–Z. Sorted copy.
  const sortedForYear = (year: number) =>
    [...byYear[year]].sort(
      (a, b) =>
        completionPct(a.id) - completionPct(b.id) ||
        a.project_title.localeCompare(b.project_title),
    );

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <h1 className="t-title-banner">Project Updates</h1>
      </div>

      <div className="flex-1 px-8 py-8">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && years.length === 0 && (
          <div className="rounded-xl border bg-card px-6 py-12 text-center mt-4">
            <RefreshCw className="mx-auto size-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No project updates yet.</p>
          </div>
        )}

        {!loading && !error && years.length > 0 && (
          <div className="flex flex-col gap-10 pt-8">
            {years.map((year) => (
              <section key={year}>
                <h2 className="text-xl font-bold mb-3">{year}</h2>
                <div className="rounded-xl border bg-card overflow-hidden divide-y">
                  {sortedForYear(year).map((update) => {
                    const pct = completionPct(update.id);
                    const firstSection = firstUnlockedSection(update.unlocked_sections);
                    return (
                      <div key={update.id} className="px-6 py-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-base font-semibold truncate">{documentTitle(update)}</p>
                            <StatusPill
                              status={update.status}
                              label={update.status === "Open" && pct === 100 ? labels.prodocList.readyToSubmit : undefined}
                            />
                          </div>
                          <p className="text-sm text-muted-foreground truncate mb-2">{update.project_title}</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full ${update.status === "Open" ? "bg-crafd-yellow" : "bg-crafd-grey-400"} rounded-full transition-all duration-300`}
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
                              documentPath("/partner/project-updates", { ...update, data_type: "update" }, projectSlug(update.project_short_name, update.project_title), firstSection)
                            )
                          }
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-crafd-yellow px-3 py-1.5 text-sm font-semibold text-black hover:bg-crafd-yellow-900 transition-colors"
                        >
                          Open update
                          <ArrowRight className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
