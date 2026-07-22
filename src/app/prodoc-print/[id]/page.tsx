"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import labels from "@/lib/labels.json";
import { likelihoodLabel, impactLabel } from "@/lib/risk";
import { quarterRange, quarterFromDate, groupQuartersByYear } from "@/lib/workplan";

// ─────────────────────────────────────────────────────────────────────────────
// Project Document print view. Renders the full prodoc as a styled A4 document
// using the real brand fonts (Qanelas headings, Roboto body). PDF output is via
// the browser's native print (window.print → "Save as PDF"), so the text stays
// real/vector — selectable and searchable — and the browser handles pagination
// (page breaks controlled by the @media print rules in PRINT_CSS).
// ─────────────────────────────────────────────────────────────────────────────

const BRAND = "#f1b434";
const INK = "#1a1a1a";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const SOFT = "#f8f8f6";

// Print rules: strip the on-screen chrome, let the document fill the page, and
// control where page breaks fall. `print-color-adjust` keeps the brand colours.
const PRINT_CSS = `
@media print {
  /* Standard page margin — the browser draws its own header/footer (title, URL,
     date, page numbers) in this margin area. */
  @page { size: A4; margin: 14mm; }
  html, body { background: #ffffff !important; }
  .prodoc-screen { background: #ffffff !important; padding: 0 !important; min-height: 0 !important; }
  .prodoc-doc {
    width: 100% !important; margin: 0 !important; padding: 0 !important;
  }
  .no-print { display: none !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  h1, h2 { break-after: avoid-page; }
  thead { display: table-header-group; }        /* repeat table headers per page */
  tr, [data-trow], .avoid-break { break-inside: avoid; }
}
`;

interface ProdocData {
  meta: Record<string, unknown>;
  narratives: { narrative_key: string; answer: string }[];
  surveys: { question: string }[];
  risks: {
    risk_name: string; likelihood: number | null; impact: number | null;
    approved_mitigation: string | null; categories: string[];
  }[];
  indicators: {
    indicator_name: string; indicator_description: string | null; category: string | null;
    baseline_value: string | null; baseline_year: number | null;
    target_value: string | null; target_year: number | null;
  }[];
  activities: {
    outcome: string | null; objective_num: string | null; objective_text: string | null;
    activity_num: string | null; activity_text: string | null;
    implementing_agent: string | null; planned_quarters: string[] | null;
  }[];
  budgets: { category_name: string; sort_order: number; year: number; approved_amount: string | null }[];
  applicants: { name: string; role: string | null }[];
}

const NARRATIVE_LABELS: Record<string, string> = Object.fromEntries(
  labels.narratives.questions.map((q) => [q.key, q.label])
);

function fmtUsd(v: number | null): string {
  if (v == null) return "—";
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function ProdocPrintPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const auto = search.get("auto") === "1";

  const [data, setData] = useState<ProdocData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // Org logo lives at /logos/<short_name>.<webp|png>. Probe both up front and
  // store the loadable URL (or null) so the image is fully loaded before capture.
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/reports/${params.id}/prodoc-export`)
      .then((r) => { if (!r.ok) throw new Error("Failed to load project document"); return r.json(); })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Unknown error"));
  }, [params.id]);

  // Probe + preload the org logo (and the CRAF'd watermark) before allowing export.
  useEffect(() => {
    if (!data) return;
    const short = (data.meta.partner_short_name as string | null)?.toLowerCase();
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
  }, [data]);

  // Open the browser print dialog (→ "Save as PDF"). Native print renders real
  // vector text with the actual fonts, so the output is selectable/searchable.
  const printPdf = useCallback(async () => {
    setExporting(true);
    try {
      await document.fonts.ready;
      window.print();
    } finally {
      setExporting(false);
    }
  }, []);

  // Set the document title so the print dialog / saved file uses a sensible name.
  useEffect(() => {
    if (!data) return;
    const short = (data.meta.project_short_name as string) || (data.meta.project_title as string) || "prodoc";
    const slug = short.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const prev = document.title;
    document.title = `${slug}_project-document`;
    return () => { document.title = prev; };
  }, [data]);

  // Auto-open the print dialog once data, fonts and logos are ready. Closing the
  // tab after printing is handled by the afterprint listener below.
  useEffect(() => {
    if (auto && data && assetsReady) {
      document.fonts.ready.then(() => setTimeout(() => window.print(), 350));
    }
  }, [auto, data, assetsReady]);

  // In auto mode, close the tab once the print dialog is dismissed.
  useEffect(() => {
    if (!auto) return;
    const onAfterPrint = () => window.close();
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [auto]);

  if (error) {
    return <div style={{ padding: 40, color: "#b91c1c", fontFamily: "var(--font-roboto)" }}>{error}</div>;
  }
  if (!data) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", gap: 8, color: MUTED }}>
        <Loader2 className="size-5 animate-spin" /> Loading project document…
      </div>
    );
  }

  const m = data.meta;
  const years: number[] = Array.isArray(m.years) ? (m.years as number[]) : [];
  const rate = num(m.indirect_cost_rate);

  // Budget matrix helpers
  const categories = Array.from(
    new Map(data.budgets.map((b) => [b.category_name, b.sort_order])).entries()
  ).sort((a, b) => a[1] - b[1]).map(([name]) => name);
  const budgetAt = (cat: string, year: number) =>
    num(data.budgets.find((b) => b.category_name === cat && b.year === year)?.approved_amount);
  const catTotal = (cat: string) => years.reduce((a, y) => a + budgetAt(cat, y), 0);
  const yearSub = (year: number) => categories.reduce((a, c) => a + budgetAt(c, year), 0);
  const grandSub = categories.reduce((a, c) => a + catTotal(c), 0);

  // Group workplan activities by outcome
  const outcomeGroups = Array.from(
    data.activities.reduce((map, a) => {
      const key = a.outcome || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
      return map;
    }, new Map<string, ProdocData["activities"]>())
  );

  // Workplan quarter columns — derived from the project's start → end, like the grid.
  const wpQuarters = quarterRange(
    quarterFromDate(m.project_start_date as string | null),
    quarterFromDate(m.project_end_date as string | null)
  );
  const wpYearGroups = groupQuartersByYear(wpQuarters);

  return (
    <div className="prodoc-screen" style={{ background: "#525659", minHeight: "100vh", padding: "24px 0", fontFamily: "var(--font-roboto)" }}>
      <style>{PRINT_CSS}</style>

      {/* Floating print button (screen only; hidden in auto mode and when printing) */}
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

      {/* A4 document (794px ≈ 210mm @ 96dpi on screen; full width when printed) */}
      <div
        ref={docRef}
        className="prodoc-doc"
        style={{
          width: 794, margin: "0 auto", background: "#ffffff", color: INK,
          padding: "12px 56px", boxSizing: "border-box", fontSize: 12.5, lineHeight: 1.55,
        }}
      >
        {/* ── Cover header ── */}
        <div data-block className="avoid-break" style={{ position: "relative", borderTop: `6px solid ${BRAND}`, paddingTop: 22, marginBottom: 28, overflow: "hidden" }}>
          {/* CRAF'd symbol watermark */}
          <img
            src="/images/crafd-symbol-black.svg"
            alt=""
            aria-hidden
            style={{
              position: "absolute", top: -16, right: -12, width: 150, height: "auto",
              opacity: 0.05, pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: MUTED, fontWeight: 600, marginTop: 4 }}>
                Complex Risk Analytics Fund (CRAF'd) Project Document
              </div>
              <h1 style={{ fontFamily: "var(--font-qanelas)", fontWeight: 700, fontSize: 30, lineHeight: 1.1, margin: "10px 0 8px" }}>
                {m.project_title as string}
              </h1>
              <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.2, margin: "0 0 10px" }}>
                {(m.partner_long_name as string) || (m.partner_short_name as string)}
                {m.partner_short_name && m.partner_long_name ? ` (${m.partner_short_name})` : ""}
              </div>
            </div>
            {orgLogo && (
              <img
                src={orgLogo}
                alt={(m.partner_short_name as string) || "Organization logo"}
                style={{ height: 56, width: "auto", maxWidth: 160, objectFit: "contain", flexShrink: 0 }}
              />
            )}
          </div>
        </div>

        {/* ── Meta grid ── */}
        <div data-block className="avoid-break">
          <MetaGrid
            items={[
              ["MPTFO number", (m.mptfo_project_number as string) || "—"],
              ["Status", (m.status as string) || "—"],
              ["Funding amount", fmtUsd(m.grant_size_usd != null ? num(m.grant_size_usd) : null)],
              ["Start date", fmtDate(m.project_start_date as string | null)],
              ["Duration", m.project_duration_months ? `${m.project_duration_months} months` : "—"],
              ["Geographic scope", (m.geographic_scope as string) || "—"],
            ]}
          />
        </div>
        {m.implementing_partners ? (
          <div data-block style={{ marginTop: 10, fontSize: 12 }}>
            <span style={{ color: MUTED }}>Implementing partners: </span>
            {m.implementing_partners as string}
          </div>
        ) : null}
        {m.description ? (
          <p data-block style={{ marginTop: 14, fontSize: 12.5, color: "#374151" }}>{m.description as string}</p>
        ) : null}

        {/* ── Narratives ── */}
        {data.narratives.length > 0 && (
          <Section title="Narratives">
            {data.narratives.map((n) => (
              <div key={n.narrative_key} data-block className="avoid-break" style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>
                  {NARRATIVE_LABELS[n.narrative_key] || n.narrative_key}
                </div>
                <div style={{ fontSize: 12, color: "#374151", whiteSpace: "pre-wrap" }}>{n.answer}</div>
              </div>
            ))}
          </Section>
        )}

        {/* ── Indicators ── */}
        {data.indicators.length > 0 && (
          <Section title="Indicators">
            <div data-block>
              <Table
                head={["Indicator", "Category", "Baseline", "Target"]}
                widths={["46%", "22%", "16%", "16%"]}
                rows={data.indicators.map((i) => [
                  i.indicator_name,
                  i.category || "—",
                  i.baseline_value ? `${i.baseline_value}${i.baseline_year ? ` (${i.baseline_year})` : ""}` : "—",
                  i.target_value ? `${i.target_value}${i.target_year ? ` (${i.target_year})` : ""}` : "—",
                ])}
              />
            </div>
          </Section>
        )}

        {/* ── Risk register ── */}
        {data.risks.length > 0 && (
          <Section title="Risk Management">
            <div data-block>
              <Table
                head={["Risk", "Categories", "Likelihood", "Impact", "Approved mitigation"]}
                widths={["22%", "16%", "13%", "13%", "36%"]}
                align={["left", "left", "left", "left", "left"]}
                rows={data.risks.map((r) => [
                  r.risk_name,
                  r.categories.length ? r.categories.join(", ") : "—",
                  likelihoodLabel(r.likelihood) || "—",
                  impactLabel(r.impact) || "—",
                  r.approved_mitigation || "—",
                ])}
              />
            </div>
          </Section>
        )}

        {/* ── Workplan ── */}
        {data.activities.length > 0 && (
          <Section title="Workplan">
            {wpQuarters.length > 0 ? (
              <table data-block style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, tableLayout: "fixed" }}>
                <colgroup>
                  <col />
                  {wpQuarters.map((q) => <col key={q} style={{ width: 18 }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{
                      textAlign: "left", background: "#f3f4f6", color: "#374151", fontWeight: 700,
                      fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, padding: "6px 8px",
                      borderBottom: `1px solid ${LINE}`, verticalAlign: "bottom",
                    }}>
                      Activity
                    </th>
                    {wpYearGroups.map((g) => (
                      <th key={g.year} colSpan={g.quarters.length} style={{
                        textAlign: "center", background: "#f3f4f6", color: "#374151", fontWeight: 700,
                        fontSize: 10, padding: "4px 2px", borderBottom: `1px solid ${LINE}`, borderLeft: `1px solid ${LINE}`,
                      }}>
                        {g.year}
                      </th>
                    ))}
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
                  {outcomeGroups.map(([outcome, acts]) => (
                    <Fragment key={outcome}>
                      <tr>
                        <td colSpan={1 + wpQuarters.length} style={{
                          fontWeight: 700, fontSize: 11, color: "#374151", background: SOFT,
                          padding: "5px 8px", borderBottom: `1px solid ${LINE}`, borderTop: `1px solid ${LINE}`,
                        }}>
                          {outcome}
                        </td>
                      </tr>
                      {acts.map((a, ai) => {
                        const planned = new Set(a.planned_quarters ?? []);
                        return (
                          <tr key={ai}>
                            <td style={{ padding: "5px 8px", borderBottom: `1px solid ${LINE}`, verticalAlign: "middle" }}>
                              <div style={{ fontWeight: 600 }}>
                                {a.activity_num ? `${a.activity_num} ` : ""}{a.activity_text || "—"}
                              </div>
                              {a.implementing_agent && (
                                <div style={{ fontSize: 9.5, color: MUTED, marginTop: 1 }}>{a.implementing_agent}</div>
                              )}
                            </td>
                            {wpQuarters.map((qk) => (
                              <td key={qk} style={{ textAlign: "center", padding: "5px 0", borderBottom: `1px solid ${LINE}` }}>
                                <QBox on={planned.has(qk)} />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            ) : (
              // No project dates — fall back to a simple activity list.
              outcomeGroups.map(([outcome, acts]) => (
                <div key={outcome} data-block style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 5, color: "#374151" }}>{outcome}</div>
                  <Table
                    head={["#", "Activity", "Implementing agent"]}
                    widths={["8%", "62%", "30%"]}
                    rows={acts.map((a) => [a.activity_num || "—", a.activity_text || "—", a.implementing_agent || "—"])}
                  />
                </div>
              ))
            )}
          </Section>
        )}

        {/* ── Expenditure budget ── */}
        {categories.length > 0 && years.length > 0 && (
          <Section title="Approved Budget (USD)">
            <table data-block style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <Th align="left">Budget category</Th>
                  {years.map((y) => <Th key={y} align="right">{y}</Th>)}
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c}>
                    <Td>{c}</Td>
                    {years.map((y) => <Td key={y} align="right">{fmtUsd(budgetAt(c, y))}</Td>)}
                    <Td align="right">{fmtUsd(catTotal(c))}</Td>
                  </tr>
                ))}
                <TotalRow label="Project costs sub total" years={years} cells={years.map(yearSub)} total={grandSub} />
                <TotalRow label={`Indirect support costs (${Math.round(rate * 100)}%)`} years={years}
                  cells={years.map((y) => yearSub(y) * rate)} total={grandSub * rate} />
                <TotalRow label="Total" years={years}
                  cells={years.map((y) => yearSub(y) * (1 + rate))} total={grandSub * (1 + rate)} strong />
              </tbody>
            </table>
          </Section>
        )}

        {/* ── Signatures ── */}
        <Section title="Signatures">
          <div data-block style={{ display: "flex", flexWrap: "wrap", gap: 28, marginTop: 4 }}>
            {(data.applicants.length > 0
              ? data.applicants.map((a) => ({ name: a.name, role: a.role || "Applicant" }))
              : [{ name: (m.partner_long_name as string) || (m.partner_short_name as string) || "Applicant", role: "Applicant" }]
            ).map((s, i) => (
              <SignatureBlock key={`app-${i}`} name={s.name} role={s.role} />
            ))}
            <SignatureBlock name="CRAF'd Secretariat" role="Complex Risk Analytics Fund" />
          </div>
        </Section>

        <div data-block style={{ marginTop: 40, paddingTop: 12, borderTop: `1px solid ${LINE}`, fontSize: 10, color: MUTED, textAlign: "center" }}>
          CRAF'd · Project Document · {m.project_title as string}
        </div>
      </div>
    </div>
  );
}

// ── Presentational helpers ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 26 }}>
      <h2
        data-block
        data-keep="1"
        style={{
          fontFamily: "var(--font-qanelas)", fontWeight: 700, fontSize: 17, margin: "0 0 10px",
          paddingBottom: 6, borderBottom: `2px solid ${BRAND}`,
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

// Quarter checkbox for the workplan matrix: filled brand square when planned.
function QBox({ on }: { on: boolean }) {
  return (
    <div style={{
      width: 11, height: 11, margin: "0 auto", borderRadius: 2,
      border: `1px solid ${on ? BRAND : "#c9c9c9"}`, background: on ? BRAND : "#ffffff",
    }} />
  );
}

function SignatureBlock({ name, role }: { name: string; role: string }) {
  return (
    <div className="avoid-break" style={{ flex: "1 1 220px", minWidth: 220 }}>
      {/* Space to sign */}
      <div style={{ height: 46 }} />
      <div style={{ borderTop: `1px solid ${INK}`, paddingTop: 5 }}>
        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{name}</div>
        <div style={{ fontSize: 11, color: MUTED }}>{role}</div>
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>Date: ____________________</div>
      </div>
    </div>
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

// Flexbox-based table. html2canvas ignores vertical-align on <td>, so rows use
// display:flex + alignItems:center to vertically centre every cell — including
// rows where one column wraps to multiple lines.
function Table({
  head, rows, widths, align,
}: {
  head: (string | number)[];
  rows: (string | number | null)[][];
  widths?: string[];
  align?: ("left" | "center" | "right")[];
}) {
  const colStyle = (i: number): React.CSSProperties =>
    widths?.[i] ? { flex: `0 0 ${widths[i]}`, maxWidth: widths[i] } : { flex: "1 1 0" };

  return (
    <div style={{ fontSize: 11 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "stretch", background: "#f3f4f6", borderBottom: `1px solid ${LINE}` }}>
        {head.map((h, i) => (
          <div key={i} style={{
            ...colStyle(i), boxSizing: "border-box", padding: "6px 8px",
            textAlign: align?.[i] ?? "left", color: "#374151", fontWeight: 700,
            fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4,
          }}>
            {h}
          </div>
        ))}
      </div>
      {/* Body rows */}
      {rows.map((row, ri) => (
        <div key={ri} data-trow style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${LINE}` }}>
          {row.map((cell, ci) => (
            <div key={ci} style={{
              ...colStyle(ci), boxSizing: "border-box", padding: "6px 8px",
              textAlign: align?.[ci] ?? "left",
            }}>
              {cell ?? "—"}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Th({ children, align = "left", width }: { children: React.ReactNode; align?: "left" | "center" | "right"; width?: string }) {
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

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "center" | "right" }) {
  return (
    <td style={{ textAlign: align, padding: "6px 8px", borderBottom: `1px solid ${LINE}`, verticalAlign: "middle" }}>
      {children}
    </td>
  );
}

function TotalRow({
  label, years, cells, total, strong,
}: {
  label: string; years: number[]; cells: number[]; total: number; strong?: boolean;
}) {
  return (
    <tr style={{ background: strong ? "#f3f4f6" : "#fafafa", fontWeight: strong ? 700 : 600 }}>
      <td style={{ padding: "6px 8px", borderTop: `1px solid ${LINE}`, verticalAlign: "middle" }}>{label}</td>
      {years.map((y, i) => (
        <td key={y} style={{ padding: "6px 8px", textAlign: "right", borderTop: `1px solid ${LINE}`, verticalAlign: "middle" }}>{fmtUsd(cells[i])}</td>
      ))}
      <td style={{ padding: "6px 8px", textAlign: "right", borderTop: `1px solid ${LINE}`, verticalAlign: "middle" }}>{fmtUsd(total)}</td>
    </tr>
  );
}
