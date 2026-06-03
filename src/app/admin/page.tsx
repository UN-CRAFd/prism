"use client";

import { useState, useEffect } from "react";
import {
  getAllSurveyData,
  PARTNERS,
  YEARS,
  type SurveyData,
} from "@/lib/survey-data";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminFullDataPage() {
  const [allData, setAllData] = useState<SurveyData[]>([]);
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
      <div className="border-b px-8 py-4">
        <h1 className="text-2xl font-bold font-qanelas">Full Data</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          View all partner submissions across all years
        </p>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="flex gap-4 mb-6">
          <Select value={filterPartner} onValueChange={setFilterPartner}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by Partner" />
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
              <SelectValue placeholder="Filter by Year" />
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

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No survey submissions found. Partners need to fill out and save their surveys first.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {filtered.map((survey) => {
              const partner = PARTNERS.find((p) => p.id === survey.partnerId);
              return (
                <Card key={`${survey.partnerId}-${survey.year}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{partner?.name || survey.partnerId}</CardTitle>
                        <CardDescription>
                          {partner?.fullName} &mdash; {survey.year}
                        </CardDescription>
                      </div>
                      <Badge variant="outline">{survey.year}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="narrative">
                      <TabsList>
                        <TabsTrigger value="narrative">Narrative</TabsTrigger>
                        <TabsTrigger value="quantitative">Quantitative</TabsTrigger>
                      </TabsList>

                      <TabsContent value="narrative" className="mt-4">
                        <div className="space-y-4">
                          <FlatSection
                            title="Project Information"
                            data={survey.narrative.projectInformation}
                          />
                          <AssessmentSection data={survey.narrative.selfAssessment} />
                          <NestedSection
                            title="Key Achievements"
                            data={survey.narrative.keyAchievements}
                          />
                          <ArraySection
                            title="Lessons Learned"
                            data={survey.narrative.lessonsLearned}
                          />
                          <NestedSection
                            title="Visibility & Engagement"
                            data={survey.narrative.visibilityEngagement}
                          />
                        </div>
                      </TabsContent>

                      <TabsContent value="quantitative" className="mt-4">
                        <div className="space-y-4">
                          <QuantitativeSection
                            title="Indicators"
                            rows={Object.entries(survey.quantitative.indicators.responses).map(([id, r]) => ({ id, ...r }))}
                          />
                          <QuantitativeSection
                            title="Expenditures"
                            rows={survey.quantitative.expenditures.entries}
                          />
                          <QuantitativeSection
                            title="Work Plan"
                            rows={survey.quantitative.workPlan.rows}
                          />
                          <QuantitativeSection
                            title="Risk Management"
                            rows={survey.quantitative.riskManagement.entries}
                          />
                          <QuantitativeSection
                            title="Funding Transfer"
                            rows={survey.quantitative.fundingTransfer.rows}
                          />
                          <QuantitativeSection
                            title="Complementary Funding"
                            rows={survey.quantitative.complementaryFunding.rows}
                          />
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function camelToLabel(s: string) {
  return s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

function FlatSection({
  title,
  data,
}: {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}) {
  const entries = Object.entries(data).filter(
    ([, v]) => v !== "" && v !== false && v !== null && v !== undefined
  );
  if (entries.length === 0)
    return <div className="text-sm text-muted-foreground italic">{title}: No data entered</div>;

  return (
    <div className="rounded-lg border p-4">
      <h4 className="font-semibold mb-2 text-sm">{title}</h4>
      <Table>
        <TableBody>
          {entries.map(([key, value]) => (
            <TableRow key={key}>
              <TableCell className="font-medium w-48">{camelToLabel(key)}</TableCell>
              <TableCell className="whitespace-pre-wrap">{String(value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AssessmentSection({ data }: { data: Record<string, { rating: string; justification: string }> }) {
  const filled = Object.entries(data).filter(([, v]) => v.rating || v.justification);
  if (filled.length === 0)
    return <div className="text-sm text-muted-foreground italic">Self Assessment: No data entered</div>;

  return (
    <div className="rounded-lg border p-4">
      <h4 className="font-semibold mb-2 text-sm">Self Assessment</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead>Justification</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filled.map(([key, val]) => (
            <TableRow key={key}>
              <TableCell className="font-medium">{key}.</TableCell>
              <TableCell>{val.rating || "—"}</TableCell>
              <TableCell className="whitespace-pre-wrap">{val.justification || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ArraySection({ title, data }: { title: string; data: any[] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filled = data.filter((entry: any) =>
    Object.values(entry).some((v) => v !== "" && v !== null && v !== undefined)
  );
  if (filled.length === 0)
    return <div className="text-sm text-muted-foreground italic">{title}: No data entered</div>;

  const columns = Object.keys(filled[0]);
  return (
    <div className="rounded-lg border p-4">
      <h4 className="font-semibold mb-2 text-sm">{title}</h4>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col}>{camelToLabel(col)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filled.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col} className="whitespace-pre-wrap">{String(row[col] ?? "")}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NestedSection({ title, data }: { title: string; data: Record<string, any> }) {
  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm">{title}</h4>
      {Object.entries(data).map(([key, value]) => {
        if (Array.isArray(value)) {
          return <ArraySection key={key} title={camelToLabel(key)} data={value} />;
        }
        if (typeof value === "object" && value !== null) {
          return <FlatSection key={key} title={camelToLabel(key)} data={value} />;
        }
        return null;
      })}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function QuantitativeSection({
  title,
  rows,
}: {
  title: string;
  rows: any[];
}) {
  if (!rows || rows.length === 0)
    return (
      <div className="text-sm text-muted-foreground italic">
        {title}: No data entered
      </div>
    );

  const columns = Object.keys(rows[0]).filter((k) => k !== "id");

  return (
    <div className="rounded-lg border p-4">
      <h4 className="font-semibold mb-2 text-sm">{title}</h4>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col} className="capitalize">
                {col.replace(/([A-Z])/g, " $1").trim()}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col}>
                  {String(row[col] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
