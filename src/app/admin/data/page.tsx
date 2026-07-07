"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, TableIcon } from "lucide-react";

const SECTIONS = [{ value: "surveys", label: "Surveys" }];

interface SurveyRow {
  id: number;
  reportid: number;
  question: string;
  assessment: number | null;
  context: string | null;
  year: number;
  report_type: string | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
}

export default function AdminFullDataPage() {
  const [section, setSection] = useState("surveys");
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (sec: string) => {
    setLoading(true);
    setError(null);
    try {
      if (sec === "surveys") {
        const res = await fetch("/api/surveys");
        if (!res.ok) throw new Error("Failed to load surveys");
        const data = await res.json();
        setSurveys(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(section); }, [section, loadData]);

  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className="border-b px-8 h-32 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-qanelas">Full Data</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View all submissions across all reports
          </p>
        </div>

        <Select value={section} onValueChange={(v) => setSection(v)}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : section === "surveys" && surveys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <TableIcon className="size-8 opacity-30" />
            <p className="text-sm">No survey data found.</p>
          </div>
        ) : section === "surveys" ? (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Year</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="w-32">Partner</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead className="w-24">Assessment</TableHead>
                  <TableHead>Context</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {surveys.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.year}</TableCell>
                    <TableCell className="capitalize text-muted-foreground text-xs">
                      {row.report_type ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.project_short_name || row.project_title}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.partner_short_name}
                    </TableCell>
                    <TableCell className="text-sm">{row.question}</TableCell>
                    <TableCell className="text-sm">
                      {row.assessment ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {row.context || <span>—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
