"use client";

import { useState, useEffect, useMemo } from "react";
import { getAllSurveyData, PARTNERS, YEARS, type SurveyData } from "@/lib/survey-data";
import { DEFAULT_SECTIONS } from "@/lib/survey-template";
import {
  DEFAULT_INDICATORS,
  EXPENDITURE_CATEGORIES,
  computeRiskLevel,
  RISK_LEVEL_STYLES,
} from "@/lib/indicator-definitions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts";
import { cn } from "@/lib/utils";

const PARTNER_COLORS: Record<string, string> = {
  acled: "#f1b434",
  iom: "#3b82f6",
  fhn: "#10b981",
};

const RATING_COLORS: Record<number, string> = {
  1: "#fca5a5",
  2: "#fdba74",
  3: "#fcd34d",
  4: "#86efac",
  5: "#4ade80",
};

const RISK_PIE_COLORS: Record<string, string> = {
  Low: "#4ade80",
  Medium: "#fcd34d",
  High: "#fb923c",
  Extreme: "#f87171",
};

// --- helpers ---

function ratingNum(s: string): number | null {
  const n = parseInt(s);
  return n >= 1 && n <= 5 ? n : null;
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// --- main component ---

export default function VisualizationPage() {
  const [allData, setAllData] = useState<SurveyData[]>([]);
  const [filterPartner, setFilterPartner] = useState("all");
  const [filterYear, setFilterYear] = useState("all");

  useEffect(() => {
    setAllData(getAllSurveyData());
  }, []);

  const filtered = useMemo(
    () =>
      allData.filter(
        (d) =>
          (filterPartner === "all" || d.partnerId === filterPartner) &&
          (filterYear === "all" || d.year === Number(filterYear))
      ),
    [allData, filterPartner, filterYear]
  );

  // --- Summary stats ---
  const totalSubmissions = filtered.length;

  const allRatings = useMemo(() => {
    return filtered.flatMap((d) =>
      Object.values(d.narrative.selfAssessment)
        .map((a) => ratingNum(a.rating))
        .filter((n): n is number => n !== null)
    );
  }, [filtered]);

  const avgRating = allRatings.length ? avg(allRatings).toFixed(1) : "—";

  const indicatorStatuses = useMemo(() => {
    return filtered.flatMap((d) =>
      Object.values(d.quantitative.indicators.responses).map((r) => r.status)
    );
  }, [filtered]);

  const onTrackCount = indicatorStatuses.filter(
    (s) => s === "On track" || s === "Ahead of schedule"
  ).length;

  const totalRisks = useMemo(
    () =>
      filtered.reduce(
        (n, d) =>
          n +
          d.quantitative.riskManagement.entries.filter(
            (e) => e.likelihood && e.impact
          ).length,
        0
      ),
    [filtered]
  );

  // --- Submission grid ---
  const submissionGrid = useMemo(
    () =>
      PARTNERS.map((p) => ({
        partner: p,
        years: YEARS.map((y) => ({
          year: y,
          submitted: allData.some((d) => d.partnerId === p.id && d.year === y),
        })),
      })),
    [allData]
  );

  // --- Self-assessment radar (per section, averaged across filtered data) ---
  const radarData = useMemo(() => {
    return DEFAULT_SECTIONS.map((section) => {
      const sectionEntry: Record<string, string | number> = { section: section.title };
      PARTNERS.forEach((p) => {
        const partnerSurveys = filtered.filter((d) => d.partnerId === p.id);
        const ratings = partnerSurveys.flatMap((d) =>
          section.questions.map((q) => ratingNum(d.narrative.selfAssessment[q.id]?.rating ?? "")).filter((n): n is number => n !== null)
        );
        sectionEntry[p.name] = ratings.length ? parseFloat(avg(ratings).toFixed(2)) : 0;
      });
      return sectionEntry;
    });
  }, [filtered]);

  // --- Self-assessment per-question bar ---
  const questionBarData = useMemo(() => {
    return DEFAULT_SECTIONS.flatMap((section) =>
      section.questions.map((q) => {
        const entry: Record<string, string | number> = { id: q.id, section: section.number };
        PARTNERS.forEach((p) => {
          const ratings = filtered
            .filter((d) => d.partnerId === p.id)
            .map((d) => ratingNum(d.narrative.selfAssessment[q.id]?.rating ?? ""))
            .filter((n): n is number => n !== null);
          entry[p.name] = ratings.length ? parseFloat(avg(ratings).toFixed(2)) : 0;
        });
        return entry;
      })
    );
  }, [filtered]);

  // --- Indicator achievement ---
  const indicatorBarData = useMemo(() => {
    return DEFAULT_INDICATORS.map((def) => {
      const entry: Record<string, string | number> = {
        label: `${def.number}`,
        title: def.title.slice(0, 40) + (def.title.length > 40 ? "…" : ""),
        target: parseFloat(def.targetValue) || 0,
      };
      PARTNERS.forEach((p) => {
        const partnerSurveys = filtered.filter((d) => d.partnerId === p.id);
        const values = partnerSurveys
          .map((d) => parseFloat(d.quantitative.indicators.responses[def.id]?.achievedValue ?? "") || null)
          .filter((n): n is number => n !== null);
        if (values.length) entry[p.name] = parseFloat(avg(values).toFixed(1));
      });
      return entry;
    });
  }, [filtered]);

  // --- Expenditure: budget vs actual (editable categories only) ---
  const editableCategories = EXPENDITURE_CATEGORIES.filter((c) => !c.readOnly);
  const expenditureData = useMemo(() => {
    return editableCategories.map((cat) => {
      const entry: Record<string, string | number> = { label: cat.label.replace(/,.*/, "").slice(0, 20) };
      PARTNERS.forEach((p) => {
        const partnerSurveys = filtered.filter((d) => d.partnerId === p.id);
        const entries = partnerSurveys.flatMap((d) =>
          d.quantitative.expenditures.entries.filter((e) => e.category === cat.key)
        );
        if (entries.length) {
          entry[`${p.name} budget`] = parseFloat(avg(entries.map((e) => e.approvedAnnualBudget)).toFixed(0));
          entry[`${p.name} actual`] = parseFloat(avg(entries.map((e) => e.annualExpenditure)).toFixed(0));
        }
      });
      return entry;
    });
  }, [filtered]);

  // --- Risk level distribution ---
  const riskPieData = useMemo(() => {
    const counts: Record<string, number> = { Low: 0, Medium: 0, High: 0, Extreme: 0 };
    filtered.forEach((d) => {
      d.quantitative.riskManagement.entries.forEach((e) => {
        const result = computeRiskLevel(e.likelihood, e.impact);
        if (result) counts[result.level] = (counts[result.level] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const hasData = filtered.length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-8 h-32 flex flex-col justify-center shrink-0">
        <h1 className="text-2xl font-bold font-qanelas">Visualization</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Survey data insights — narrative and quantitative reports
        </p>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6 space-y-8">
        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <Select value={filterPartner} onValueChange={setFilterPartner}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Partners</SelectItem>
              {PARTNERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="outline" className="text-xs text-muted-foreground">
            {totalSubmissions} submission{totalSubmissions !== 1 ? "s" : ""} in view
          </Badge>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Submissions" value={String(totalSubmissions)} sub="matching filter" />
          <SummaryCard label="Avg. self-assessment" value={avgRating} sub="out of 5" />
          <SummaryCard label="Indicators on track" value={indicatorStatuses.length ? `${onTrackCount}/${indicatorStatuses.length}` : "—"} sub="on track or ahead" />
          <SummaryCard label="Risks assessed" value={String(totalRisks)} sub="with likelihood & impact" />
        </div>

        {/* Submission grid */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submission overview</CardTitle>
            <CardDescription>Which partner / year combinations have been submitted</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr>
                    <th className="text-left font-medium text-muted-foreground pb-2 pr-6">Partner</th>
                    {YEARS.map((y) => (
                      <th key={y} className="text-center font-medium text-muted-foreground pb-2 px-3 w-20">{y}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {submissionGrid.map(({ partner, years }) => (
                    <tr key={partner.id}>
                      <td className="py-1.5 pr-6 font-medium">{partner.name}</td>
                      {years.map(({ year, submitted }) => (
                        <td key={year} className="py-1.5 px-3 text-center">
                          <span className={cn(
                            "inline-flex items-center justify-center rounded-md px-3 py-1 text-xs font-medium border",
                            submitted
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-neutral-50 text-neutral-400 border-neutral-200"
                          )}>
                            {submitted ? "Submitted" : "—"}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {!hasData ? (
          <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
            No survey submissions match the selected filters. Ask partners to fill out and save their surveys.
          </div>
        ) : (
          <>
            {/* ── Narrative: Self-assessment ── */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Narrative · Self-Assessment
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Radar per section */}
                {DEFAULT_SECTIONS.map((section) => {
                  const data = radarData.find((r) => r.section === section.title);
                  if (!data) return null;
                  const radarEntries = section.questions.map((q) => {
                    const pt: Record<string, string | number> = { subject: q.id.toUpperCase() };
                    PARTNERS.forEach((p) => {
                      const ratings = filtered
                        .filter((d) => d.partnerId === p.id)
                        .map((d) => ratingNum(d.narrative.selfAssessment[q.id]?.rating ?? ""))
                        .filter((n): n is number => n !== null);
                      pt[p.name] = ratings.length ? parseFloat(avg(ratings).toFixed(2)) : 0;
                    });
                    return pt;
                  });
                  const hasAnyData = radarEntries.some((e) =>
                    PARTNERS.some((p) => (e[p.name] as number) > 0)
                  );
                  if (!hasAnyData) return null;

                  return (
                    <Card key={section.id}>
                      <CardHeader>
                        <CardTitle className="text-sm">{section.number}. {section.title}</CardTitle>
                        <CardDescription className="text-xs">Avg. rating per question (1 – 5)</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                          <RadarChart data={radarEntries} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                            <PolarGrid stroke="#e5e7eb" />
                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#6b7280" }} />
                            {PARTNERS.map((p) => (
                              <Radar
                                key={p.id}
                                name={p.name}
                                dataKey={p.name}
                                stroke={PARTNER_COLORS[p.id]}
                                fill={PARTNER_COLORS[p.id]}
                                fillOpacity={0.15}
                                dot={{ r: 3 }}
                              />
                            ))}
                            <Tooltip formatter={(v: number) => v > 0 ? v.toFixed(1) : "—"} />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Question-level bar (all 17 questions) */}
              {questionBarData.some((r) => PARTNERS.some((p) => (r[p.name] as number) > 0)) && (
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle className="text-sm">All questions — rating overview</CardTitle>
                    <CardDescription className="text-xs">Avg. rating per question (1–5), grouped by partner</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={questionBarData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="id" tick={{ fontSize: 11, fill: "#6b7280" }} />
                        <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: "#6b7280" }} />
                        <Tooltip formatter={(v: number) => v > 0 ? v.toFixed(1) : "—"} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        {PARTNERS.map((p) => (
                          <Bar key={p.id} dataKey={p.name} fill={PARTNER_COLORS[p.id]} radius={[2, 2, 0, 0]} maxBarSize={20} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ── Quantitative: Indicators ── */}
            {indicatorBarData.some((r) => PARTNERS.some((p) => p.name in r)) && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Quantitative · Indicators
                </h2>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Achieved value per indicator</CardTitle>
                    <CardDescription className="text-xs">Reported achieved values by partner</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={indicatorBarData}
                        layout="vertical"
                        margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "#6b7280" }} />
                        <YAxis type="category" dataKey="label" width={28} tick={{ fontSize: 11, fill: "#6b7280" }} />
                        <Tooltip
                          formatter={(v: number) => v.toLocaleString()}
                          labelFormatter={(l) => {
                            const def = DEFAULT_INDICATORS.find((d) => d.number === l);
                            return def?.title ?? l;
                          }}
                        />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        {PARTNERS.map((p) => (
                          <Bar key={p.id} dataKey={p.name} fill={PARTNER_COLORS[p.id]} radius={[0, 2, 2, 0]} maxBarSize={16} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Quantitative: Expenditures ── */}
            {expenditureData.some((r) =>
              PARTNERS.some((p) => `${p.name} actual` in r || `${p.name} budget` in r)
            ) && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Quantitative · Expenditures
                </h2>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Budget vs actual by category</CardTitle>
                    <CardDescription className="text-xs">Annual approved budget vs annual expenditure (USD)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={expenditureData}
                        layout="vertical"
                        margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 10, fill: "#6b7280" }}
                          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                        />
                        <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 10, fill: "#6b7280" }} />
                        <Tooltip
                          formatter={(v: number) => `$${v.toLocaleString()}`}
                        />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        {PARTNERS.flatMap((p) => [
                          <Bar key={`${p.id}-budget`} dataKey={`${p.name} budget`} fill={PARTNER_COLORS[p.id]} fillOpacity={0.35} radius={[0, 2, 2, 0]} maxBarSize={10} />,
                          <Bar key={`${p.id}-actual`} dataKey={`${p.name} actual`} fill={PARTNER_COLORS[p.id]} radius={[0, 2, 2, 0]} maxBarSize={10} />,
                        ])}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Quantitative: Risks ── */}
            {riskPieData.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Quantitative · Risk Management
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Risk level distribution</CardTitle>
                      <CardDescription className="text-xs">Across all assessed risks in filtered submissions</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={riskPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={90}
                            paddingAngle={3}
                          >
                            {riskPieData.map((entry) => (
                              <Cell key={entry.name} fill={RISK_PIE_COLORS[entry.name] ?? "#94a3b8"} />
                            ))}
                            <LabelList dataKey="value" position="outside" style={{ fontSize: 11 }} />
                          </Pie>
                          <Tooltip formatter={(v: number) => [`${v} risk${v !== 1 ? "s" : ""}`, ""]} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Risk table */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Risk breakdown</CardTitle>
                      <CardDescription className="text-xs">All assessed risks in filtered submissions</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {filtered.flatMap((d) =>
                          d.quantitative.riskManagement.entries
                            .filter((e) => e.likelihood && e.impact)
                            .map((e) => {
                              const result = computeRiskLevel(e.likelihood, e.impact);
                              const partner = PARTNERS.find((p) => p.id === d.partnerId);
                              return (
                                <div key={`${d.partnerId}-${d.year}-${e.id}`} className="flex items-start gap-2 text-xs">
                                  <span className={cn(
                                    "shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 font-medium",
                                    result ? RISK_LEVEL_STYLES[result.level] : "border-neutral-200 text-neutral-400"
                                  )}>
                                    {result?.level ?? "—"}
                                  </span>
                                  <span className="text-muted-foreground">{partner?.name} {d.year}</span>
                                  <span className="leading-snug line-clamp-2">{e.title}</span>
                                </div>
                              );
                            })
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className="text-3xl font-bold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
