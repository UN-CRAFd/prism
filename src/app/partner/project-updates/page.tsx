"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { projectSlug } from "@/lib/utils";
import { ArrowRight, RefreshCw } from "lucide-react";
import labels from "@/lib/labels";
import type { Report } from "@/lib/types";
import { ProgressBar } from "@/components/partner/progress-bar";
import { StatusPill } from "@/components/partner/status-pill";
import { PartnerStatusChips, matchesPartnerStatus, type PartnerStatusFilterValue } from "@/components/partner/status-filter";
import { documentPath, documentTitle, firstUnlockedSection } from "@/lib/project-updates";
import { progressSections } from "@/lib/report-sections";
import { isPartnerEditable } from "@/lib/report-status";

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
    setCompletion({});
    updates.forEach((u) =>
        fetch(`/api/report-completion?reportId=${u.id}`)
          .then((res) => res.json())
          .then((data) => {
            const sections: Record<string, boolean> = data.sections ?? {};
            const unlocked = progressSections(u.unlocked_sections ?? []);
            const completed = unlocked.filter((k) => sections[k] === true).length;
            return { id: u.id, completed, total: unlocked.length };
          })
          .catch(() => ({ id: u.id, completed: 0, total: 0 }))
          .then(({ id, completed, total }) => setCompletion((prev) => ({ ...prev, [id]: { completed, total } })))
    );
  }, [updates]);

  const byYear = updates.reduce<Record<number, UpdateReport[]>>((acc, u) => {
    (acc[u.year] ??= []).push(u);
    return acc;
  }, {});
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  const [statusFilter, setStatusFilter] = useState<PartnerStatusFilterValue>("all");
  const matches = (u: UpdateReport) => matchesPartnerStatus(u.status, statusFilter);
  // Year groups with nothing left after filtering are hidden.
  const visibleYears = years.filter((y) => byYear[y].some(matches));

  const completionPct = (id: number) => {
    const { completed, total } = completion[id] ?? { completed: 0, total: 0 };
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };
  // Every card stays in the loading state until ALL completion numbers are in (or failed → 0);
  // then the values and the sort appear together.
  const allLoaded = updates.every((u) => completion[u.id] !== undefined);
  // Within a year: least complete first, then project title A–Z. Sorted copy.
  const sortedForYear = (year: number) =>
    byYear[year].filter(matches).sort(
      (a, b) =>
        (allLoaded ? completionPct(a.id) - completionPct(b.id) : 0) ||
        a.project_title.localeCompare(b.project_title),
    );

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <h1 className="t-title-banner">Project Updates</h1>
        <p className="mt-1 text-sm text-neutral-400">{labels.partnerListDescriptions.update}</p>
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
          <div className="flex flex-col gap-10">
            <div className="-mb-6">
              <PartnerStatusChips statuses={updates.map((u) => u.status)} value={statusFilter} onChange={setStatusFilter} />
            </div>
            {visibleYears.map((year) => (
              <section key={year}>
                <h2 className="text-xl font-bold mb-3">{year}</h2>
                <div className="rounded-xl border bg-card overflow-hidden divide-y">
                  {sortedForYear(year).map((update) => {
                    const pct = allLoaded ? completionPct(update.id) : 0;
                    const firstSection = firstUnlockedSection(update.unlocked_sections);
                    return (
                      <div key={update.id} className="px-6 py-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-base font-semibold truncate">{documentTitle(update)}</p>
                            <StatusPill
                              partner
                              status={update.status}
                              label={isPartnerEditable(update.status) && pct === 100 ? labels.prodocList.readyToSubmit : undefined}
                            />
                          </div>
                          <p className="text-sm text-muted-foreground truncate mb-2">{update.project_title}</p>
                          <ProgressBar pct={allLoaded ? pct : null} editable={isPartnerEditable(update.status)} />
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
