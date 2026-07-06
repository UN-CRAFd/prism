"use client";

import { useState, useEffect } from "react";
import {
  getAllSurveyData,
  PARTNERS,
  YEARS,
  type SurveyData,
} from "@/lib/survey-data";
import { DEFAULT_INDICATORS } from "@/lib/indicator-definitions";
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SECTIONS = [
  { id: "indicators", label: "Indicators" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function AdminFullDataPage() {
  const [allData, setAllData] = useState<SurveyData[]>([]);
  const [filterSection, setFilterSection] = useState<SectionId>("indicators");
  const [filterPartner, setFilterPartner] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");

  useEffect(() => {
    setAllData(getAllSurveyData());
  }, []);

  const filtered = allData.filter((d) => {
    if (filterPartner !== "all" && d.partnerId !== filterPartner) return false;
    if (filterYear !== "all" && d.year !== Number(filterYear)) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-8 h-32 flex flex-col justify-center shrink-0">
        <h1 className="text-2xl font-bold font-qanelas">Full Data</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          View all partner submissions across all years
        </p>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="flex gap-3 mb-6">
          <Select value={filterSection} onValueChange={(v) => setFilterSection(v as SectionId)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Section" />
            </SelectTrigger>
            <SelectContent>
              {SECTIONS.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterPartner} onValueChange={setFilterPartner}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Partners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Partners</SelectItem>
              {PARTNERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filterSection === "indicators" && (
          <IndicatorsTable surveys={filtered} />
        )}
      </div>
    </div>
  );
}

function IndicatorsTable({ surveys }: { surveys: SurveyData[] }) {
  const rows = surveys.flatMap((survey) => {
    const partner = PARTNERS.find((p) => p.id === survey.partnerId);
    return Object.entries(survey.quantitative.indicators.responses).map(([id, response]) => {
      const def = DEFAULT_INDICATORS.find((d) => d.id === id);
      return {
        partner: partner?.name ?? survey.partnerId,
        year: survey.year,
        number: def?.number ?? "—",
        title: def?.title ?? id,
        achievedValue: response.achievedValue,
        status: response.status,
        comment: response.comment,
      };
    });
  });

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No indicator data found. Partners need to fill out and save their surveys first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Partner</TableHead>
            <TableHead className="w-16">Year</TableHead>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Indicator</TableHead>
            <TableHead className="w-32">Achieved Value</TableHead>
            <TableHead className="w-36">Status</TableHead>
            <TableHead>Comment</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{row.partner}</TableCell>
              <TableCell>{row.year}</TableCell>
              <TableCell className="text-muted-foreground">{row.number}</TableCell>
              <TableCell className="text-sm">{row.title}</TableCell>
              <TableCell>{row.achievedValue || "—"}</TableCell>
              <TableCell>
                {row.status ? (
                  <Badge variant="outline" className="text-xs">{row.status}</Badge>
                ) : "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-pre-wrap">
                {row.comment || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}


