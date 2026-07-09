"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CalendarDays,
  Building2,
  Layers,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/admin/shared";
import {
  ReportRow,
  Project,
  GroupMode,
  GROUP_COLORS,
  ReportCard,
  CreateReportForm,
} from "@/components/admin/report-components";

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("year");
  const [showForm, setShowForm] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, pRes] = await Promise.all([
        fetch("/api/reports?data_type=report"),
        fetch("/api/projects"),
      ]);
      if (!rRes.ok) throw new Error("Failed to load reports");
      if (!pRes.ok) throw new Error("Failed to load projects");
      setReports(await rRes.json());
      setProjects(await pRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const groups = useMemo(() => {
    const map = new Map<string, ReportRow[]>();
    for (const r of reports) {
      const key = groupMode === "year" ? String(r.year) : r.partner_long_name || r.partner_short_name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) =>
      groupMode === "year" ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])
    );
  }, [reports, groupMode]);

  async function handleDelete(id: number) {
    if (!confirm("Delete this report and all its indicator data?")) return;
    const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (res.ok) loadData();
    else setError("Failed to delete report");
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Reports" description="Create and manage reporting periods for projects">
        <Layers className="size-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Group by</span>
        <Select value={groupMode} onValueChange={(v) => setGroupMode(v as GroupMode)}>
          <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="year">Year</SelectItem>
            <SelectItem value="organization">Organization</SelectItem>
          </SelectContent>
        </Select>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5" /> Add report
          </Button>
        )}
      </PageHeader>

      <div className="flex-1 overflow-auto px-8 py-6 space-y-8">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <CreateReportForm
          open={showForm}
          onClose={() => setShowForm(false)}
          projects={projects}
          dataType="report"
          onRefresh={loadData}
          title="New report"
        />

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            No reports yet. Create one above to get started.
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(([key, rows], gi) => {
              const color = GROUP_COLORS[gi % GROUP_COLORS.length];
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    {groupMode === "year" ? (
                      <CalendarDays className={`size-4 ${color.icon}`} />
                    ) : (
                      <Building2 className={`size-4 ${color.icon}`} />
                    )}
                    <h3 className={`text-base font-bold ${color.label}`}>{key}</h3>
                    <span className="text-sm text-muted-foreground">({rows.length})</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {rows.map((r) => (
                      <ReportCard
                        key={r.id}
                        report={r}
                        color={color}
                        onDelete={() => handleDelete(r.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
