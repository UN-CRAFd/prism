"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Loader2, ListChecks, Trash2 } from "lucide-react";
import { PageHeader, ErrorBanner, LoadingState } from "@/components/admin/shared";
import { optionItems } from "@/lib/options";

type ReportType = string;

interface StandardQuestion {
  id: number;
  report_type: ReportType;
  question: string;
}

// Per-type explanatory blurbs. Keyed by report-type value; unknown/added types
// fall back to a generic line. Titles come from the editable option labels.
const TYPE_BLURBS: Record<string, string> = {
  annual: "Seed each project's first annual report. Later annual reports copy the previous report.",
  final: "Added to every final report, for all projects.",
};

export default function SurveyQuestionsPage() {
  const confirm = useConfirm();
  const [questions, setQuestions] = useState<StandardQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-type "new question" drafts and busy flags.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const types = optionItems("reportType");
  const [adding, setAdding] = useState<ReportType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/standard-surveys");
      if (!res.ok) throw new Error("Failed to load standard survey questions");
      setQuestions(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(reportType: ReportType) {
    const question = (drafts[reportType] ?? "").trim();
    if (!question) return;
    setAdding(reportType);
    setError(null);
    try {
      const res = await fetch("/api/standard-surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: reportType, question }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to add question"); }
      const created: StandardQuestion = await res.json();
      setQuestions((prev) => [...prev, created]);
      setDrafts((prev) => ({ ...prev, [reportType]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAdding(null);
    }
  }

  async function handleDelete(q: StandardQuestion) {
    if (!await confirm({ message: `Remove this question from all ${q.report_type} reports going forward? Existing reports keep their copy.` })) return;
    setError(null);
    const res = await fetch(`/api/standard-surveys?id=${q.id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error || "Failed to delete question"); return; }
    setQuestions((prev) => prev.filter((x) => x.id !== q.id));
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Standard Survey Questions"
        description="Questions used to seed new reports of each type, across all projects"
      />

      <div className="flex-1 overflow-auto px-8 py-6">
        {error && <ErrorBanner message={error} />}

        {loading ? (
          <LoadingState />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {types.map((t) => {
              const list = questions.filter((q) => q.report_type === t.value);
              const blurb = TYPE_BLURBS[t.value] ?? `Standard questions added to every ${t.label.toLowerCase()} report, for all projects.`;
              return (
                <section key={t.value} className="rounded-xl border bg-card flex flex-col">
                  <div className="border-b px-5 py-3.5">
                    <h2 className="text-sm font-semibold">{t.label}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{blurb}</p>
                  </div>

                  {list.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                      <ListChecks className="size-7 opacity-30" />
                      <p className="text-sm">No standard questions yet.</p>
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {list.map((q, i) => (
                        <li key={q.id} className="flex items-start gap-3 px-5 py-3">
                          <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">{i + 1}.</span>
                          <p className="flex-1 text-sm">{q.question}</p>
                          <button
                            onClick={() => handleDelete(q)}
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                            aria-label="Delete question"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="border-t px-5 py-3 flex gap-2 mt-auto">
                    <Input
                      placeholder="Add a standard question…"
                      value={drafts[t.value] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [t.value]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAdd(t.value); }}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => handleAdd(t.value)}
                      disabled={adding === t.value || !(drafts[t.value] ?? "").trim()}
                      size="sm"
                      className="shrink-0"
                    >
                      {adding === t.value ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />Add</>}
                    </Button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
