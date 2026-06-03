"use client";

import { useState, useEffect, useMemo } from "react";
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

export default function ComparisonPage() {
  const [allData, setAllData] = useState<SurveyData[]>([]);
  const [compareMode, setCompareMode] = useState<"partners" | "years">(
    "partners"
  );
  const [selectedYear, setSelectedYear] = useState<string>("2026");
  const [selectedPartner, setSelectedPartner] = useState<string>("acled");

  useEffect(() => {
    setAllData(getAllSurveyData());
  }, []);

  const partnerComparison = useMemo(() => {
    return PARTNERS.map((p) => {
      const survey = allData.find(
        (d) => d.partnerId === p.id && d.year === Number(selectedYear)
      );
      return { partner: p, survey };
    });
  }, [allData, selectedYear]);

  const yearComparison = useMemo(() => {
    return YEARS.map((y) => {
      const survey = allData.find(
        (d) => d.partnerId === selectedPartner && d.year === y
      );
      return { year: y, survey };
    });
  }, [allData, selectedPartner]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-8 py-4">
        <h1 className="text-2xl font-bold font-qanelas">Comparison</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Compare data across projects and years
        </p>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        <Tabs
          value={compareMode}
          onValueChange={(v) => setCompareMode(v as "partners" | "years")}
        >
          <div className="flex items-center gap-4 mb-6">
            <TabsList>
              <TabsTrigger value="partners">Compare Partners</TabsTrigger>
              <TabsTrigger value="years">Compare Years</TabsTrigger>
            </TabsList>

            {compareMode === "partners" && (
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {compareMode === "years" && (
              <Select value={selectedPartner} onValueChange={setSelectedPartner}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTNERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <TabsContent value="partners">
            <Card>
              <CardHeader>
                <CardTitle>Partner Comparison &mdash; {selectedYear}</CardTitle>
                <CardDescription>
                  Side-by-side comparison of all partners for the selected year
                </CardDescription>
              </CardHeader>
              <CardContent>
                {partnerComparison.every((p) => !p.survey) ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No survey data submitted for {selectedYear} yet. Partners need to fill out and save their surveys first.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-48">Field</TableHead>
                        {PARTNERS.map((p) => (
                          <TableHead key={p.id}>{p.name}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Submission Status</TableCell>
                        {partnerComparison.map(({ partner, survey }) => (
                          <TableCell key={partner.id}>
                            {survey ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                Submitted
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Not Submitted</Badge>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Project Title</TableCell>
                        {partnerComparison.map(({ partner, survey }) => (
                          <TableCell key={partner.id}>
                            {survey?.narrative.projectInformation.projectTitle || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Overall Progress</TableCell>
                        {partnerComparison.map(({ partner, survey }) => (
                          <TableCell key={partner.id}>
                            {survey?.narrative.selfAssessment.overallProgress || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Timeliness</TableCell>
                        {partnerComparison.map(({ partner, survey }) => (
                          <TableCell key={partner.id}>
                            {survey?.narrative.selfAssessment.timelinessRating || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Budget Utilization</TableCell>
                        {partnerComparison.map(({ partner, survey }) => (
                          <TableCell key={partner.id}>
                            {survey?.narrative.selfAssessment.budgetUtilization || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Partnership Quality</TableCell>
                        {partnerComparison.map(({ partner, survey }) => (
                          <TableCell key={partner.id}>
                            {survey?.narrative.selfAssessment.partnershipQuality || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Total Budget</TableCell>
                        {partnerComparison.map(({ partner, survey }) => (
                          <TableCell key={partner.id}>
                            {survey?.narrative.projectInformation.totalBudget || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Indicators Count</TableCell>
                        {partnerComparison.map(({ partner, survey }) => (
                          <TableCell key={partner.id}>
                            {survey?.quantitative.indicators.rows.length ?? 0}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Expenditure Lines</TableCell>
                        {partnerComparison.map(({ partner, survey }) => (
                          <TableCell key={partner.id}>
                            {survey?.quantitative.expenditures.rows.length ?? 0}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Risk Items</TableCell>
                        {partnerComparison.map(({ partner, survey }) => (
                          <TableCell key={partner.id}>
                            {survey?.quantitative.riskManagement.rows.length ?? 0}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="years">
            <Card>
              <CardHeader>
                <CardTitle>
                  Year Comparison &mdash;{" "}
                  {PARTNERS.find((p) => p.id === selectedPartner)?.name}
                </CardTitle>
                <CardDescription>
                  Track how this partner&apos;s submissions have evolved over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                {yearComparison.every((y) => !y.survey) ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No survey data submitted by{" "}
                    {PARTNERS.find((p) => p.id === selectedPartner)?.name} yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-48">Field</TableHead>
                        {YEARS.map((y) => (
                          <TableHead key={y}>{y}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Submission Status</TableCell>
                        {yearComparison.map(({ year, survey }) => (
                          <TableCell key={year}>
                            {survey ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                Submitted
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Not Submitted</Badge>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Project Title</TableCell>
                        {yearComparison.map(({ year, survey }) => (
                          <TableCell key={year}>
                            {survey?.narrative.projectInformation.projectTitle || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Overall Progress</TableCell>
                        {yearComparison.map(({ year, survey }) => (
                          <TableCell key={year}>
                            {survey?.narrative.selfAssessment.overallProgress || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Timeliness</TableCell>
                        {yearComparison.map(({ year, survey }) => (
                          <TableCell key={year}>
                            {survey?.narrative.selfAssessment.timelinessRating || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Budget Utilization</TableCell>
                        {yearComparison.map(({ year, survey }) => (
                          <TableCell key={year}>
                            {survey?.narrative.selfAssessment.budgetUtilization || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Total Budget</TableCell>
                        {yearComparison.map(({ year, survey }) => (
                          <TableCell key={year}>
                            {survey?.narrative.projectInformation.totalBudget || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Indicators Count</TableCell>
                        {yearComparison.map(({ year, survey }) => (
                          <TableCell key={year}>
                            {survey?.quantitative.indicators.rows.length ?? 0}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Expenditure Lines</TableCell>
                        {yearComparison.map(({ year, survey }) => (
                          <TableCell key={year}>
                            {survey?.quantitative.expenditures.rows.length ?? 0}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
