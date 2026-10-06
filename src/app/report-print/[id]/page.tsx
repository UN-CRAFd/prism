"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { formatDate, shortName, formatUsd } from "@/lib/utils";
import { likelihoodLabel, impactLabel } from "@/lib/risk";
import { statusLabel } from "@/lib/indicators";
import { resultLabel, quarterRange, quarterFromDate, groupQuartersByYear } from "@/lib/workplan";

// ─────────────────────────────────────────────────────────────────────────────
// Annual Report print view. Renders all report sections as a styled A4 document.
// PDF output is via the browser's native print (window.print → "Save as PDF").
// ─────────────────────────────────────────────────────────────────────────────

const BRAND = "#f1b434";
const INK = "#1a1a1a";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const SOFT = "#f8f8f6";

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #ffffff !important; }
  .report-screen { background: #ffffff !important; padding: 0 !important; min-height: 0 !important; }
  .report-doc { width: 100% !important; margin: 0 !important; padding: 0 !important; }
  .no-print { display: none !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  h1, h2 { break-after: avoid-page; }
  thead { display: table-header-group; }
  tr, [data-trow], .avoid-break { break-inside: avoid; }
}
`;

// ── Data types ────────────────────────────────────────────────────────────────

interface ReportMeta {
  id: number; project_id: number; year: number; report_type: string;
  data_type: string; report_submission_date: string | null;
  status: string; project_title: string;
  project_short_name: string | null; partner_short_name: string | null; partner_long_name: string | null;
}

interface Overview {
  project_title: string; mptfo_project_number: string | null;
  grant_size_usd: number | null;
  participating_organizations: { id: number; name: string }[];
  implementing_partners: { id: number; name: string }[];
  geographic_scope: string | null; project_start_date: string | null;
  project_duration_months: number | null;
  organization_name: string | null; organization_website: string | null;
  report_submission_date: string | null;
}

interface SurveyRow {
  id: number; question: string; assessment: number | null; context: string | null; category: string | null;
}

interface Achievement {
  id: number; achievement: string | null; significance: string | null; links: string | null;
}

interface Partnership {
  id: number; partner_organization: string | null; result: string | null; links: string | null;
}

interface ResultRow {
  id: number; context: string | null; data_driven_decision: string | null;
  resulting_impact: string | null; links: string | null;
}

interface Lesson {
  id: number; category: string | null; lesson_learned: string | null; adjustment_informed: string | null;
}

interface ExternalCoverage {
  id: number; type: string | null; description: string | null;
  reach_indicator: string | null; links: string | null;
}

interface Testimonial {
  id: number; kind: string | null; quote: string | null;
  person_name: string | null; person_title: string | null;
}

interface WorkplanActivity {
  id: number; outcome: string | null; objective_num: string | null; objective_text: string | null;
  activity_num: string | null; activity_text: string | null; implementing_agent: string | null;
  planned_quarters: string[]; sort_order: number;
  byUpdate: Record<string, { updated_quarters: string[]; status: string | null; comment: string | null }>;
}

interface WorkplanData {
  range: { start: string | null; end: string | null };
  updates: { id: number; year: number; type_code: string }[];
  activeUpdateId: number | null;
  activities: WorkplanActivity[];
}

interface IndicatorMatrixRow {
  indicator_id: number; indicator_name: string; indicator_description: string | null;
  category: string | null; is_standard: boolean;
  baseline_value: string | null; baseline_year: number | null;
  target_value: string | null; target_year: number | null;
  linked_results: string[];
  byYear: Record<string, { achieved_value: string | null; status: string | null; comment: string | null }>;
}

interface IndicatorData {
  years: number[]; currentYear: number;
  rows: IndicatorMatrixRow[];
}

interface ExpenditureData {
  indirectRate: number; currentYear: number;
  categories: { id: number; name: string; sort_order: number }[];
  years: number[];
  budgets: { category_id: number; year: number; approved_amount: string | null }[];
  expenditure: { category_id: number; year: number; annual_expenditure: string | null; comment: string | null }[];
}

interface RiskRow {
  id: number; risk_name: string; risk_description: string | null; risk_category: string[];
  updated_likelihood: number | null; updated_impact: number | null;
  updated_mitigation: string | null;
  project_revision: boolean | null; source_risk_id: number | null;
}

interface TransferPartnerRow {
  transfer_partner_id: number; organization_name: string; partner_type: string | null;
  byYear: Record<string, { amount_transferred: string | null }>;
}

interface TransferData {
  years: number[]; currentYear: number;
  rows: TransferPartnerRow[];
}

interface ComplementaryContributorRow {
  contributor_id: number; contributor_name: string; funding_type: string | null;
  byYear: Record<string, { contribution_amount: string | null }>;
}

interface ComplementaryData {
  years: number[]; currentYear: number;
  rows: ComplementaryContributorRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchSection<T>(url: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { data: null, error: `HTTP ${r.status}` };
    return { data: await r.json() as T, error: null };
  } catch {
    return { data: null, error: "Failed to load" };
  }
}


function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return formatDate(s);
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const ASSESSMENT_LABEL: Record<number, string> = {
  1: "Not at all",
  2: "To a small extent",
  3: "To a moderate extent",
  4: "To a great extent",
  5: "To a very great extent",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReportPrintPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const auto = search.get("auto") === "1";

  const [report, setReport] = useState<ReportMeta | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [surveys, setSurveys] = useState<SurveyRow[] | null>(null);
  const [achievements, setAchievements] = useState<Achievement[] | null>(null);
  const [partnerships, setPartnerships] = useState<Partnership[] | null>(null);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [externalCoverage, setExternalCoverage] = useState<ExternalCoverage[] | null>(null);
  const [testimonials, setTestimonials] = useState<Testimonial[] | null>(null);
  const [workplan, setWorkplan] = useState<WorkplanData | null>(null);
  const [indicators, setIndicators] = useState<IndicatorData | null>(null);
  const [expenditure, setExpenditure] = useState<ExpenditureData | null>(null);
  const [risks, setRisks] = useState<RiskRow[] | null>(null);
  const [transfers, setTransfers] = useState<TransferData | null>(null);
  const [complementary, setComplementary] = useState<ComplementaryData | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const [exporting, setExporting] = useState(false);

  const id = params.id;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchSection<ReportMeta>(`/api/reports/${id}`),
      fetchSection<Overview>(`/api/overview?reportId=${id}`),
      fetchSection<SurveyRow[]>(`/api/surveys?reportId=${id}`),
      fetchSection<Achievement[]>(`/api/achievements?reportId=${id}`),
      fetchSection<Partnership[]>(`/api/partnerships?reportId=${id}`),
      fetchSection<ResultRow[]>(`/api/results?reportId=${id}`),
      fetchSection<Lesson[]>(`/api/lessons-learned?reportId=${id}`),
      fetchSection<ExternalCoverage[]>(`/api/external-coverage?reportId=${id}`),
      fetchSection<Testimonial[]>(`/api/testimonials?reportId=${id}`),
      fetchSection<WorkplanData>(`/api/workplan?reportId=${id}`),
      fetchSection<IndicatorData>(`/api/indicator-data?reportId=${id}&matrix=1`),
      fetchSection<ExpenditureData>(`/api/expenditure?reportId=${id}`),
      fetchSection<RiskRow[]>(`/api/risk?reportId=${id}`),
      fetchSection<TransferData>(`/api/transfer-data?reportId=${id}&matrix=1`),
      fetchSection<ComplementaryData>(`/api/complementary-data?reportId=${id}&matrix=1`),
    ]).then(([
      reportRes, overviewRes, surveysRes, achievementsRes, partnershipsRes,
      resultsRes, lessonsRes, externalRes, testimonialsRes, workplanRes,
      indicatorsRes, expenditureRes, risksRes, transfersRes, complementaryRes,
    ]) => {
      setReport(reportRes.data);
      setOverview(overviewRes.data);
      setSurveys(surveysRes.data);
      setAchievements(achievementsRes.data);
      setPartnerships(partnershipsRes.data);
      setResults(resultsRes.data);
      setLessons(lessonsRes.data);
      setExternalCoverage(externalRes.data);
      setTestimonials(testimonialsRes.data);
      setWorkplan(workplanRes.data);
      setIndicators(indicatorsRes.data);
      setExpenditure(expenditureRes.data);
      setRisks(risksRes.data);
      setTransfers(transfersRes.data);
      setComplementary(complementaryRes.data);

      const errs: Record<string, string> = {};
      const check = (key: string, res: { error: string | null }) => { if (res.error) errs[key] = res.error; };
      check("report", reportRes); check("overview", overviewRes); check("surveys", surveysRes);
      check("achievements", achievementsRes); check("partnerships", partnershipsRes);
      check("results", resultsRes); check("lessons", lessonsRes); check("external-coverage", externalRes);
      check("testimonials", testimonialsRes); check("workplan", workplanRes);
      check("indicators", indicatorsRes); check("expenditure", expenditureRes);
      check("risk", risksRes); check("transfers", transfersRes); check("complementary", complementaryRes);
      setSectionErrors(errs);
      setLoading(false);
    });
  }, [id]);

  // Preload org logo.
  useEffect(() => {
    if (!report) return;
    const short = report.partner_short_name?.toLowerCase();
    const load = (src: string) =>
      new Promise<string | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(src);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    (async () => {
      let logo: string | null = null;
      if (short) {
        logo = (await load(`/logos/${short}.webp`)) || (await load(`/logos/${short}.png`));
      }
      await load("/images/crafd-symbol-black.svg");
      setOrgLogo(logo);
      setAssetsReady(true);
    })();
  }, [report]);

  // Set document title.
  useEffect(() => {
    if (!report) return;
    const slug = (report.project_short_name || report.project_title)
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const prev = document.title;
    document.title = `${slug}_annual-report-${report.year}`;
    return () => { document.title = prev; };
  }, [report]);

  const printPdf = useCallback(async () => {
    setExporting(true);
    try {
      await document.fonts.ready;
      window.print();
    } finally {
      setExporting(false);
    }
  }, []);

  // Auto-open print dialog.
  useEffect(() => {
    if (auto && report && assetsReady) {
      document.fonts.ready.then(() => setTimeout(() => window.print(), 350));
    }
  }, [auto, report, assetsReady]);

  // Auto-close after print in auto mode.
  useEffect(() => {
    if (!auto) return;
    const onAfterPrint = () => window.close();
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [auto]);

  if (loading || (!report && !sectionErrors["report"])) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", gap: 8, color: MUTED }}>
        <Loader2 className="size-5 animate-spin" /> Loading report…
      </div>
    );
  }

  if (!report) {
    return <div style={{ padding: 40, color: "#b91c1c", fontFamily: "var(--font-roboto)" }}>
      {sectionErrors["report"] || "Report not found"}
    </div>;
  }

  // ── Workplan helpers ─────────────────────────────────────────────────────────

  const wpActivities = workplan?.activities ?? [];
  const activeUpdateId = workplan?.activeUpdateId ?? null;
  const wpRange = workplan?.range ?? { start: null, end: null };
  const wpQuarters = quarterRange(wpRange.start, wpRange.end);
  const wpYearGroups = groupQuartersByYear(wpQuarters);

  // Group activities by outcome → objective
  const outcomeGroups = (() => {
    type ObjGroup = { num: string | null; text: string | null; activities: WorkplanActivity[] };
    const result: { outcome: string; objectives: ObjGroup[] }[] = [];
    const outcomeIdx = new Map<string, number>();
    const objIdx = new Map<string, Map<string, number>>();
    for (const a of wpActivities) {
      const outcomeKey = a.outcome || "—";
      let oi = outcomeIdx.get(outcomeKey);
      if (oi == null) {
        oi = result.length;
        outcomeIdx.set(outcomeKey, oi);
        objIdx.set(outcomeKey, new Map());
        result.push({ outcome: outcomeKey, objectives: [] });
      }
      const objKey = `${a.objective_num ?? ""}|||${a.objective_text ?? ""}`;
      const ojMap = objIdx.get(outcomeKey)!;
      let ji = ojMap.get(objKey);
      if (ji == null) {
        ji = result[oi].objectives.length;
        ojMap.set(objKey, ji);
        result[oi].objectives.push({ num: a.objective_num, text: a.objective_text, activities: [] });
      }
      result[oi].objectives[ji].activities.push(a);
    }
    return result;
  })();

  // ── Indicator helpers ────────────────────────────────────────────────────────

  const indRows = indicators?.rows ?? [];
  const indCurrentYear = indicators?.currentYear;
  const indStandard = indRows.filter((r) => r.is_standard);
  const indCustom = indRows.filter((r) => !r.is_standard);

  // Use workplan activities for resultLabel lookups.
  const wpActivitiesForLabels = wpActivities.map((a) => ({
    outcome: a.outcome,
    objective_num: a.objective_num,
    objective_text: a.objective_text,
  }));

  // ── Expenditure helpers ──────────────────────────────────────────────────────

  const expCats = (expenditure?.categories ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const expCurrentYear = expenditure?.currentYear;
  const expRate = num(expenditure?.indirectRate);
  const budgetAt = (catId: number, year: number) =>
    num(expenditure?.budgets.find((b) => b.category_id === catId && b.year === year)?.approved_amount);
  const expAt = (catId: number, year: number) =>
    num(expenditure?.expenditure.find((e) => e.category_id === catId && e.year === year)?.annual_expenditure);

  // ── Transfer helpers ─────────────────────────────────────────────────────────

  const transferRows = transfers?.rows ?? [];
  const transferCurrentYear = transfers?.currentYear;
  const complementaryRows = complementary?.rows ?? [];
  const complementaryCurrentYear = complementary?.currentYear;

  return (
    <div className="report-screen" style={{ background: "#525659", minHeight: "100vh", padding: "24px 0", fontFamily: "var(--font-roboto)" }}>
      <style>{PRINT_CSS}</style>

      {/* Floating print button (screen only) */}
      {!auto && (
        <div className="no-print" style={{ position: "fixed", top: 20, right: 24, zIndex: 50 }}>
          <button
            onClick={printPdf}
            disabled={exporting}
            style={{
              display: "flex", alignItems: "center", gap: 8, background: BRAND, color: "#1a1a1a",
              fontWeight: 700, border: "none", borderRadius: 8, padding: "10px 18px", cursor: "pointer",
              fontFamily: "var(--font-roboto)", fontSize: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            Save as PDF
          </button>
        </div>
      )}

      {/* A4 document */}
      <div
        className="report-doc"
        style={{
          width: 794, margin: "0 auto", background: "#ffffff", color: INK,
          padding: "12px 56px", boxSizing: "border-box", fontSize: 12.5, lineHeight: 1.55,
        }}
      >
        {/* ── Cover header ── */}
        <div className="avoid-break" style={{ position: "relative", borderTop: `6px solid ${BRAND}`, paddingTop: 22, marginBottom: 28, overflow: "hidden" }}>
          <img
            src="/images/crafd-symbol-black.svg"
            alt=""
            aria-hidden
            style={{ position: "absolute", top: -16, right: -12, width: 150, height: "auto", opacity: 0.05, pointerEvents: "none" }}
          />
          <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: MUTED, fontWeight: 600, marginTop: 4 }}>
                Complex Risk Analytics Fund (CRAF'd) · Annual Report {report.year}
              </div>
              <h1 style={{ fontFamily: "var(--font-qanelas)", fontWeight: 700, fontSize: 28, lineHeight: 1.1, margin: "10px 0 8px" }}>
                {report.project_title}
              </h1>
              <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.2, margin: "0 0 6px" }}>
                {report.partner_long_name || shortName(report.partner_short_name)}
                {report.partner_short_name && report.partner_long_name ? ` (${shortName(report.partner_short_name)})` : ""}
              </div>
              <div style={{ fontSize: 12, color: MUTED }}>
                <span style={{ marginRight: 16 }}>
                  Status: <strong style={{ color: INK }}>{report.status}</strong>
                </span>
                {report.report_submission_date && (
                  <span>Submitted: <strong style={{ color: INK }}>{fmtDate(report.report_submission_date)}</strong></span>
                )}
              </div>
            </div>
            {orgLogo && (
              <img
                src={orgLogo}
                alt={shortName(report.partner_short_name) || "Organization logo"}
                style={{ height: 56, width: "auto", maxWidth: 160, objectFit: "contain", flexShrink: 0 }}
              />
            )}
          </div>
        </div>

        {/* ── Overview ── */}
        <Section title="Overview" error={sectionErrors["overview"]}>
          {overview && (
            <>
              <div style={{ marginBottom: 10 }}>
                <MetaGrid items={[
                  ["MPTFO number", overview.mptfo_project_number || "—"],
                  ["Funding amount", formatUsd(overview.grant_size_usd)],
                  ["Geographic scope", overview.geographic_scope || "—"],
                  ["Project start date", fmtDate(overview.project_start_date)],
                  ["Duration", overview.project_duration_months ? `${overview.project_duration_months} months` : "—"],
                  ["Submission date", fmtDate(overview.report_submission_date)],
                ]} />
              </div>
              {Array.isArray(overview.participating_organizations) && overview.participating_organizations.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  <span style={{ color: MUTED }}>Project partners: </span>
                  {overview.participating_organizations.map((o) => o.name).join(", ")}
                </div>
              )}
              {Array.isArray(overview.implementing_partners) && overview.implementing_partners.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  <span style={{ color: MUTED }}>Implementing organizations: </span>
                  {overview.implementing_partners.map((o) => o.name).join(", ")}
                </div>
              )}
            </>
          )}
        </Section>

        {/* ── Surveys ── */}
        <Section title="Survey" error={sectionErrors["surveys"]}>
          {surveys && surveys.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <Th align="left" width="42%">Question</Th>
                  <Th align="center" width="18%">Rating</Th>
                  <Th align="left">Context</Th>
                </tr>
              </thead>
              <tbody>
                {surveys.map((s) => (
                  <tr key={s.id}>
                    <Td>{s.question || "—"}</Td>
                    <Td align="center">
                      {s.assessment != null ? (
                        <span>
                          <strong>{s.assessment}</strong>
                          <span style={{ display: "block", fontSize: 9.5, color: MUTED }}>
                            {ASSESSMENT_LABEL[s.assessment] ?? ""}
                          </span>
                        </span>
                      ) : "—"}
                    </Td>
                    <Td>{s.context || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            surveys && <Empty />
          )}
        </Section>

        {/* ── Key Achievements ── */}
        <Section title="Key Achievements" error={sectionErrors["achievements"]}>
          {achievements && achievements.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <Th align="left" width="40%">Achievement</Th>
                  <Th align="left">Significance</Th>
                </tr>
              </thead>
              <tbody>
                {achievements.map((a) => (
                  <tr key={a.id}>
                    <Td>{a.achievement || "—"}</Td>
                    <Td>{a.significance || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            achievements && <Empty />
          )}
        </Section>

        {/* ── Partnerships ── */}
        <Section title="Partnerships" error={sectionErrors["partnerships"]}>
          {partnerships && partnerships.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <Th align="left" width="28%">Partner organisation</Th>
                  <Th align="left">Result</Th>
                </tr>
              </thead>
              <tbody>
                {partnerships.map((p) => (
                  <tr key={p.id}>
                    <Td>{p.partner_organization || "—"}</Td>
                    <Td>{p.result || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            partnerships && <Empty />
          )}
        </Section>

        {/* ── Results ── */}
        <Section title="Results" error={sectionErrors["results"]}>
          {results && results.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <Th align="left" width="25%">Context</Th>
                  <Th align="left" width="37%">Data-driven decision</Th>
                  <Th align="left">Resulting impact</Th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id}>
                    <Td>{r.context || "—"}</Td>
                    <Td>{r.data_driven_decision || "—"}</Td>
                    <Td>{r.resulting_impact || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            results && <Empty />
          )}
        </Section>

        {/* ── Lessons Learned ── */}
        <Section title="Lessons Learned" error={sectionErrors["lessons"]}>
          {lessons && lessons.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <Th align="left" width="20%">Category</Th>
                  <Th align="left" width="40%">Lesson learned</Th>
                  <Th align="left">Adjustment informed</Th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((l) => (
                  <tr key={l.id}>
                    <Td>{l.category || "—"}</Td>
                    <Td>{l.lesson_learned || "—"}</Td>
                    <Td>{l.adjustment_informed || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            lessons && <Empty />
          )}
        </Section>

        {/* ── External Coverage ── */}
        <Section title="External Coverage" error={sectionErrors["external-coverage"]}>
          {externalCoverage && externalCoverage.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <Th align="left" width="18%">Type</Th>
                  <Th align="left" width="40%">Description</Th>
                  <Th align="left">Reach indicator</Th>
                </tr>
              </thead>
              <tbody>
                {externalCoverage.map((e) => (
                  <tr key={e.id}>
                    <Td>{e.type || "—"}</Td>
                    <Td>{e.description || "—"}</Td>
                    <Td>{e.reach_indicator || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            externalCoverage && <Empty />
          )}
        </Section>

        {/* ── Testimonials ── */}
        <Section title="Testimonials" error={sectionErrors["testimonials"]}>
          {testimonials && testimonials.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {testimonials.map((t) => (
                <div key={t.id} className="avoid-break" style={{
                  borderLeft: `3px solid ${BRAND}`, paddingLeft: 12,
                  background: SOFT, padding: "10px 12px",
                }}>
                  {t.kind === "leadership" && (
                    <div style={{ fontSize: 9.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>
                      Leadership quote
                    </div>
                  )}
                  <div style={{ fontSize: 12.5, fontStyle: "italic", lineHeight: 1.5 }}>
                    "{t.quote || ""}"
                  </div>
                  {(t.person_name || t.person_title) && (
                    <div style={{ marginTop: 6, fontSize: 11, color: MUTED }}>
                      — {[t.person_name, t.person_title].filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            testimonials && <Empty />
          )}
        </Section>

        {/* ── Workplan ── */}
        <Section title="Workplan" error={sectionErrors["workplan"]}>
          {wpActivities.length > 0 ? (
            wpQuarters.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, tableLayout: "fixed" }}>
                <colgroup>
                  <col />
                  {wpQuarters.map((q) => <col key={q} style={{ width: 18 }} />)}
                  <col style={{ width: 60 }} />
                  <col style={{ width: 110 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{
                      textAlign: "left", background: "#f3f4f6", color: "#374151", fontWeight: 700,
                      fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, padding: "6px 8px",
                      borderBottom: `1px solid ${LINE}`, verticalAlign: "bottom",
                    }}>Activity</th>
                    {wpYearGroups.map((g) => (
                      <th key={g.year} colSpan={g.quarters.length} style={{
                        textAlign: "center", background: "#f3f4f6", color: "#374151", fontWeight: 700,
                        fontSize: 10, padding: "4px 2px", borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`,
                      }}>
                        {g.year}
                      </th>
                    ))}
                    <th rowSpan={2} style={{
                      textAlign: "center", background: "#f3f4f6", color: "#374151", fontWeight: 700,
                      fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, padding: "6px 4px",
                      borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`, verticalAlign: "bottom",
                    }}>Status</th>
                    <th rowSpan={2} style={{
                      textAlign: "left", background: "#f3f4f6", color: "#374151", fontWeight: 700,
                      fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, padding: "6px 6px",
                      borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`, verticalAlign: "bottom",
                    }}>Description</th>
                  </tr>
                  <tr>
                    {wpYearGroups.flatMap((g) =>
                      g.quarters.map((q, qi) => (
                        <th key={q.key} style={{
                          width: 26, textAlign: "center", background: "#f3f4f6", color: MUTED, fontWeight: 600,
                          fontSize: 9, padding: "3px 0", borderBottom: `1px solid ${LINE}`,
                          borderLeft: qi === 0 ? `1px solid ${LINE}` : undefined,
                        }}>
                          {q.q}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {outcomeGroups.map(({ outcome, objectives }, outcomeIdx) => (
                    <Fragment key={outcome}>
                      <tr>
                        <td colSpan={3 + wpQuarters.length} style={{
                          fontWeight: 700, fontSize: 11, color: "#374151", background: SOFT,
                          padding: "5px 8px", borderBottom: `1px solid ${LINE}`, borderTop: `1px solid ${LINE}`,
                        }}>
                          {outcomeIdx + 1}. Outcome: {outcome}
                        </td>
                      </tr>
                      {objectives.map((obj, oi) => (
                        <Fragment key={oi}>
                          {(obj.num || obj.text) && (
                            <tr>
                              <td colSpan={3 + wpQuarters.length} style={{
                                fontWeight: 600, fontSize: 10.5, color: "#374151", background: "#f0f0ee",
                                padding: "4px 8px 4px 20px", borderBottom: `1px solid ${LINE}`,
                              }}>
                                {obj.num ? `${obj.num}. Objective: ` : ""}{obj.text || ""}
                              </td>
                            </tr>
                          )}
                          {obj.activities.map((a, ai) => {
                            const planned = new Set(a.planned_quarters ?? []);
                            const upd = activeUpdateId != null ? a.byUpdate[String(activeUpdateId)] : null;
                            return (
                              <tr key={ai}>
                                <td style={{ padding: "5px 8px 5px 32px", borderBottom: `1px solid ${LINE}`, verticalAlign: "middle" }}>
                                  <div style={{ fontWeight: 600 }}>
                                    {a.activity_num ? `${a.activity_num} ` : ""}{a.activity_text || "—"}
                                  </div>
                                  {a.implementing_agent && (
                                    <div style={{ fontSize: 9.5, color: MUTED, marginTop: 1 }}>
                                      {a.implementing_agent.replace(/ \| /g, ", ")}
                                    </div>
                                  )}
                                </td>
                                {wpQuarters.map((qk) => (
                                  <td key={qk} style={{ textAlign: "center", padding: "5px 0", borderBottom: `1px solid ${LINE}` }}>
                                    <QBox on={planned.has(qk)} />
                                  </td>
                                ))}
                                <td style={{ textAlign: "center", padding: "5px 4px", borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`, verticalAlign: "middle", fontSize: 10 }}>
                                  {upd?.status || "—"}
                                </td>
                                <td style={{ padding: "5px 6px", borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`, verticalAlign: "middle", fontSize: 10, color: "#374151" }}>
                                  {upd?.comment || "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            ) : (
              // No quarter range — activity list fallback
              outcomeGroups.map(({ outcome, objectives }, outcomeIdx) => (
                <div key={outcome} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 5, color: "#374151" }}>{outcomeIdx + 1}. Outcome: {outcome}</div>
                  {objectives.map((obj, oi) => (
                    <div key={oi} style={{ marginBottom: 6 }}>
                      {(obj.num || obj.text) && (
                        <div style={{ fontWeight: 600, fontSize: 11.5, color: "#374151", padding: "3px 0 3px 12px" }}>
                          {obj.num ? `${obj.num}. Objective: ` : ""}{obj.text || ""}
                        </div>
                      )}
                      {obj.activities.map((a, ai) => {
                        const upd = activeUpdateId != null ? a.byUpdate[String(activeUpdateId)] : null;
                        return (
                          <div key={ai} style={{ paddingLeft: 24, marginBottom: 4 }}>
                            <div style={{ fontWeight: 600 }}>
                              {a.activity_num ? `${a.activity_num} ` : ""}{a.activity_text || "—"}
                            </div>
                            {upd && (upd.status || upd.comment) && (
                              <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>
                                {upd.status || ""}
                                {upd.status && upd.comment ? " · " : ""}
                                {upd.comment || ""}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))
            )
          ) : (
            workplan && <Empty />
          )}
        </Section>

        {/* ── Indicators ── */}
        <Section title="Indicators" error={sectionErrors["indicators"]}>
          {indicators ? (
            <>
              {indStandard.length > 0 && (
                <IndicatorTable
                  rows={indStandard}
                  currentYear={indCurrentYear}
                  activities={wpActivitiesForLabels}
                  title={indCustom.length > 0 ? "Standard indicators" : undefined}
                />
              )}
              {indCustom.length > 0 && (
                <IndicatorTable
                  rows={indCustom}
                  currentYear={indCurrentYear}
                  activities={wpActivitiesForLabels}
                  title="Custom project indicators"
                  style={{ marginTop: 16 }}
                />
              )}
              {indRows.length === 0 && <Empty />}
            </>
          ) : null}
        </Section>

        {/* ── Expenditure ── */}
        <Section title="Expenditure" error={sectionErrors["expenditure"]}>
          {expenditure && expCats.length > 0 && expCurrentYear != null ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <Th align="left">Budget category</Th>
                  <Th align="right" width="18%">Approved budget {expCurrentYear}</Th>
                  <Th align="right" width="18%">Annual expenditure</Th>
                  <Th align="right" width="16%">Difference</Th>
                </tr>
              </thead>
              <tbody>
                {expCats.map((cat) => {
                  const budget = budgetAt(cat.id, expCurrentYear);
                  const spent = expAt(cat.id, expCurrentYear);
                  const diff = budget - spent;
                  return (
                    <tr key={cat.id}>
                      <Td>{cat.name}</Td>
                      <Td align="right">{formatUsd(budget)}</Td>
                      <Td align="right">{formatUsd(spent)}</Td>
                      <Td align="right" style={{ color: diff < 0 ? "#b91c1c" : undefined }}>
                        {formatUsd(diff)}
                      </Td>
                    </tr>
                  );
                })}
                {/* Subtotals row */}
                {(() => {
                  const totalBudget = expCats.reduce((s, c) => s + budgetAt(c.id, expCurrentYear), 0);
                  const totalSpent = expCats.reduce((s, c) => s + expAt(c.id, expCurrentYear), 0);
                  return (
                    <>
                      <tr style={{ background: "#fafafa", fontWeight: 600 }}>
                        <td style={{ padding: "6px 8px", borderTop: `1px solid ${LINE}`, verticalAlign: "middle" }}>
                          Project costs sub-total
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", borderTop: `1px solid ${LINE}` }}>{formatUsd(totalBudget)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", borderTop: `1px solid ${LINE}` }}>{formatUsd(totalSpent)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", borderTop: `1px solid ${LINE}`, color: totalBudget - totalSpent < 0 ? "#b91c1c" : undefined }}>
                          {formatUsd(totalBudget - totalSpent)}
                        </td>
                      </tr>
                      {expRate > 0 && (
                        <tr style={{ background: "#fafafa", fontWeight: 600 }}>
                          <td style={{ padding: "6px 8px", borderBottom: `1px solid ${LINE}`, verticalAlign: "middle" }}>
                            Indirect support costs ({Math.round(expRate * 100)}%)
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${LINE}` }}>{formatUsd(totalBudget * expRate)}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${LINE}` }}>{formatUsd(totalSpent * expRate)}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${LINE}`, color: (totalBudget - totalSpent) * expRate < 0 ? "#b91c1c" : undefined }}>
                            {formatUsd((totalBudget - totalSpent) * expRate)}
                          </td>
                        </tr>
                      )}
                      <tr style={{ background: "#f3f4f6", fontWeight: 700 }}>
                        <td style={{ padding: "6px 8px", borderTop: `1px solid ${LINE}`, verticalAlign: "middle" }}>Total</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", borderTop: `1px solid ${LINE}` }}>{formatUsd(totalBudget * (1 + expRate))}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", borderTop: `1px solid ${LINE}` }}>{formatUsd(totalSpent * (1 + expRate))}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", borderTop: `1px solid ${LINE}`, color: (totalBudget - totalSpent) * (1 + expRate) < 0 ? "#b91c1c" : undefined }}>
                          {formatUsd((totalBudget - totalSpent) * (1 + expRate))}
                        </td>
                      </tr>
                    </>
                  );
                })()}
              </tbody>
            </table>
          ) : (
            expenditure && <Empty />
          )}
        </Section>

        {/* ── Risk ── */}
        <Section title="Risk Management" error={sectionErrors["risk"]}>
          {risks && risks.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <Th align="left" width="3%">#</Th>
                  <Th align="left" width="22%">Risk</Th>
                  <Th align="left" width="14%">Updated likelihood</Th>
                  <Th align="left" width="14%">Updated impact</Th>
                  <Th align="left">Updated mitigation</Th>
                  <Th align="left" width="10%">Revision</Th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r, idx) => (
                  <tr key={r.id}>
                    <Td align="center">{idx + 1}</Td>
                    <Td>
                      <div style={{ fontWeight: 600 }}>{r.risk_name}</div>
                      {r.risk_description && (
                        <div style={{ color: MUTED, marginTop: 2 }}>{r.risk_description}</div>
                      )}
                      {r.risk_category?.length > 0 && (
                        <div style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>
                          {r.risk_category.join(", ")}
                        </div>
                      )}
                      {r.source_risk_id == null && (
                        <div style={{ fontSize: 9.5, color: BRAND, fontWeight: 700, marginTop: 2 }}>
                          New · {report.year}
                        </div>
                      )}
                    </Td>
                    <Td>{likelihoodLabel(r.updated_likelihood) || "—"}</Td>
                    <Td>{impactLabel(r.updated_impact) || "—"}</Td>
                    <Td>{r.updated_mitigation || "—"}</Td>
                    <Td>{r.project_revision == null ? "—" : r.project_revision ? "Yes" : "No"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            risks && <Empty />
          )}
        </Section>

        {/* ── Transfers ── */}
        <Section title="Transfers" error={sectionErrors["transfers"]}>
          {transferRows.length > 0 && transferCurrentYear != null ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <Th align="left">Organisation</Th>
                  <Th align="left" width="20%">Type</Th>
                  <Th align="right" width="22%">Amount transferred {transferCurrentYear}</Th>
                </tr>
              </thead>
              <tbody>
                {transferRows.map((r) => {
                  const byYear = r.byYear[String(transferCurrentYear)];
                  return (
                    <tr key={r.transfer_partner_id}>
                      <Td>{r.organization_name}</Td>
                      <Td>{r.partner_type || "—"}</Td>
                      <Td align="right">{formatUsd(byYear?.amount_transferred != null ? num(byYear.amount_transferred) : null)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            transfers && <Empty />
          )}
        </Section>

        {/* ── Complementary Funding ── */}
        <Section title="Complementary Funding" error={sectionErrors["complementary"]}>
          {complementaryRows.length > 0 && complementaryCurrentYear != null ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <Th align="left">Organisation</Th>
                  <Th align="left" width="20%">Type</Th>
                  <Th align="right" width="22%">Amount {complementaryCurrentYear}</Th>
                </tr>
              </thead>
              <tbody>
                {complementaryRows.map((r) => {
                  const byYear = r.byYear[String(complementaryCurrentYear)];
                  return (
                    <tr key={r.contributor_id}>
                      <Td>{r.contributor_name}</Td>
                      <Td>{r.funding_type || "—"}</Td>
                      <Td align="right">{formatUsd(byYear?.contribution_amount != null ? num(byYear.contribution_amount) : null)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            complementary && <Empty />
          )}
        </Section>

        <div style={{ marginTop: 40, paddingTop: 12, borderTop: `1px solid ${LINE}`, fontSize: 10, color: MUTED, textAlign: "center" }}>
          CRAF'd · Annual Report {report.year} · {report.project_title}
        </div>
      </div>
    </div>
  );
}

// ── Presentational helpers ────────────────────────────────────────────────────

function Section({
  title, children, error,
}: {
  title: string; children: React.ReactNode; error?: string;
}) {
  return (
    <div style={{ marginTop: 26 }}>
      <h2
        data-block
        style={{
          fontFamily: "var(--font-qanelas)", fontWeight: 700, fontSize: 17, margin: "0 0 10px",
          paddingBottom: 6, borderBottom: `2px solid ${BRAND}`,
        }}
      >
        {title}
      </h2>
      {error ? (
        <div style={{ fontSize: 11, color: "#b91c1c", padding: "6px 0" }}>Failed to load: {error}</div>
      ) : (
        children
      )}
    </div>
  );
}

function Empty() {
  return <div style={{ fontSize: 11, color: MUTED, padding: "6px 0" }}>—</div>;
}

function QBox({ on }: { on: boolean }) {
  return (
    <div style={{
      width: 11, height: 11, margin: "0 auto", borderRadius: 2,
      border: `1px solid ${on ? BRAND : "#c9c9c9"}`, background: on ? BRAND : "#ffffff",
    }} />
  );
}

function MetaGrid({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: LINE, border: `1px solid ${LINE}` }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ background: SOFT, padding: "8px 10px" }}>
          <div style={{ fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function Th({
  children, align = "left", width,
}: {
  children: React.ReactNode; align?: "left" | "center" | "right"; width?: string;
}) {
  return (
    <th style={{
      textAlign: align, width, background: "#f3f4f6", color: "#374151", fontWeight: 700,
      fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, padding: "6px 8px",
      borderBottom: `1px solid ${LINE}`, verticalAlign: "middle",
    }}>
      {children}
    </th>
  );
}

function Td({
  children, align = "left", style: extraStyle,
}: {
  children: React.ReactNode; align?: "left" | "center" | "right"; style?: React.CSSProperties;
}) {
  return (
    <td style={{ textAlign: align, padding: "6px 8px", borderBottom: `1px solid ${LINE}`, verticalAlign: "top", ...extraStyle }}>
      {children}
    </td>
  );
}

function IndicatorTable({
  rows, currentYear, activities, title, style: extraStyle,
}: {
  rows: IndicatorMatrixRow[];
  currentYear: number | undefined;
  activities: { outcome?: string | null; objective_num?: string | null; objective_text?: string | null }[];
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={extraStyle}>
      {title && (
        <div style={{ fontWeight: 700, fontSize: 12.5, color: INK, margin: "0 0 6px" }}>{title}</div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <Th align="left" width="28%">Indicator</Th>
            <Th align="left" width="14%">Baseline</Th>
            <Th align="left" width="14%">Target</Th>
            <Th align="left" width="12%">Achieved</Th>
            <Th align="left" width="12%">Status</Th>
            <Th align="left">Description / linked outcome</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const yearData = currentYear != null ? r.byYear[String(currentYear)] : undefined;
            const linkedLabels = r.linked_results.map((k) => resultLabel(k, activities)).filter(Boolean);
            return (
              <tr key={r.indicator_id}>
                <Td>
                  <div style={{ fontWeight: 600 }}>{r.indicator_name}</div>
                </Td>
                <Td>
                  {r.baseline_value || "—"}
                  {r.baseline_year && <span style={{ color: MUTED, fontSize: 9.5 }}> ({r.baseline_year})</span>}
                </Td>
                <Td>
                  {r.target_value || "—"}
                  {r.target_year && <span style={{ color: MUTED, fontSize: 9.5 }}> ({r.target_year})</span>}
                </Td>
                <Td>{yearData?.achieved_value || "—"}</Td>
                <Td>{yearData?.status ? statusLabel(yearData.status) : "—"}</Td>
                <Td>
                  {yearData?.comment && (
                    <div style={{ marginBottom: linkedLabels.length > 0 ? 4 : 0 }}>{yearData.comment}</div>
                  )}
                  {linkedLabels.length > 0 && (
                    <div style={{ fontSize: 9.5, color: MUTED }}>
                      {linkedLabels.join(" · ")}
                    </div>
                  )}
                  {!yearData?.comment && linkedLabels.length === 0 && "—"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
