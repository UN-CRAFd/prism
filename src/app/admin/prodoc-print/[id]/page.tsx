"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, Download } from "lucide-react";
import labels from "@/lib/labels.json";

// ─────────────────────────────────────────────────────────────────────────────
// Project Document print view. Renders the full prodoc as a styled A4 document
// using the real brand fonts (Qanelas headings, Roboto body) and captures it to
// a multi-page PDF client-side (html2canvas → jsPDF). All colours are inline hex
// so html2canvas never meets an oklch() token it can't parse.
// ─────────────────────────────────────────────────────────────────────────────

const BRAND = "#f1b434";
const INK = "#1a1a1a";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const SOFT = "#f8f8f6";

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

  const exportPdf = useCallback(async () => {
    if (!docRef.current || !data) return;
    setExporting(true);
    const docEl = docRef.current;
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      await document.fonts.ready;

      const canvas = await html2canvas(docEl, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        // Tailwind v4 preflight sets border/color props on every element using
        // lab()/oklch(), which html2canvas can't parse. Sweep the clone and
        // rewrite only the unsupported values to safe fallbacks — our explicit
        // hex colours (brand yellow, greys) don't match and are left intact.
        onclone: (clonedDoc: Document) => {
          const props = [
            "color", "backgroundColor",
            "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
            "outlineColor", "textDecorationColor", "columnRuleColor", "caretColor",
          ] as const;
          const unsupported = /(oklch|oklab|\blab\b|\blch\b|color\()/;
          const view = clonedDoc.defaultView;
          if (!view) return;
          clonedDoc.querySelectorAll<HTMLElement>("*").forEach((el) => {
            const cs = view.getComputedStyle(el);
            for (const p of props) {
              const val = cs[p as keyof CSSStyleDeclaration] as string | undefined;
              if (val && unsupported.test(val)) {
                el.style[p as "color"] =
                  p === "backgroundColor" || p === "caretColor" ? "transparent" :
                  p.startsWith("border") || p === "columnRuleColor" ? "#e5e7eb" :
                  "#1a1a1a";
              }
            }
          });
        },
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const PAGE_W = 210, PAGE_H = 297;
      const MARGIN_TOP = 12, MARGIN_BOTTOM = 16;   // bottom leaves room for page number
      const usableMm = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;
      const pxPerMm = canvas.width / PAGE_W;
      const usablePx = usableMm * pxPerMm;

      // Measure block boundaries in canvas pixels so we only cut between blocks.
      const docRect = docEl.getBoundingClientRect();
      const factor = canvas.width / docEl.offsetWidth;
      const blocks = Array.from(docEl.querySelectorAll<HTMLElement>("[data-block]"))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            top: (r.top - docRect.top) * factor,
            bottom: (r.bottom - docRect.top) * factor,
            keep: el.dataset.keep === "1", // headings: never orphan at page bottom
          };
        })
        .sort((a, b) => a.top - b.top);

      // Greedy pack blocks into pages; the end of a page is the top of the next
      // block (so inter-block whitespace rides along), never inside a block.
      const pages: { start: number; end: number }[] = [];
      if (blocks.length === 0) {
        pages.push({ start: 0, end: canvas.height });
      } else {
        const ends = blocks.map((b, i) => (i < blocks.length - 1 ? blocks[i + 1].top : canvas.height));
        let start = 0;
        let idx = 0;
        while (idx < blocks.length) {
          const limit = start + usablePx;
          let j = -1;
          for (let k = idx; k < blocks.length; k++) {
            if (ends[k] <= limit) j = k; else break;
          }
          if (j < idx) {
            // First block is taller than a page — hard-cut it across pages.
            const end = Math.min(limit, canvas.height);
            pages.push({ start, end });
            start = end;
            while (idx < blocks.length && ends[idx] <= start) idx++;
            continue;
          }
          if (blocks[j].keep && j > idx) j -= 1; // push a trailing heading to next page
          pages.push({ start, end: ends[j] });
          start = ends[j];
          idx = j + 1;
        }
      }

      // Render each page slice onto its own white canvas, with margins + page number.
      for (let p = 0; p < pages.length; p++) {
        const { start, end } = pages[p];
        const sliceH = Math.max(1, Math.round(end - start));
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, sliceH);
        ctx.drawImage(canvas, 0, start, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

        if (p > 0) pdf.addPage();
        const sliceHmm = sliceH / pxPerMm;
        pdf.addImage(slice.toDataURL("image/png"), "PNG", 0, MARGIN_TOP, PAGE_W, sliceHmm);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`${p + 1} / ${pages.length}`, PAGE_W / 2, PAGE_H - 8, { align: "center" });
      }

      const shortName = (data.meta.project_short_name as string) || (data.meta.project_title as string) || "prodoc";
      const slug = shortName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      pdf.save(`${slug}_project-document.pdf`);

      if (auto) setTimeout(() => window.close(), 400);
    } catch (e) {
      console.error("PDF export failed:", e);
      setError("PDF export failed. See console for details.");
    } finally {
      setExporting(false);
    }
  }, [data, auto]);

  // Auto-trigger the export once data, fonts and logos are ready.
  useEffect(() => {
    if (auto && data && assetsReady && !exporting) {
      document.fonts.ready.then(() => setTimeout(exportPdf, 300));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, data, assetsReady]);

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

  return (
    <div style={{ background: "#525659", minHeight: "100vh", padding: "24px 0", fontFamily: "var(--font-roboto)" }}>
      {/* Floating export button (hidden in auto mode) */}
      {!auto && (
        <div style={{ position: "fixed", top: 20, right: 24, zIndex: 50 }}>
          <button
            onClick={exportPdf}
            disabled={exporting}
            style={{
              display: "flex", alignItems: "center", gap: 8, background: BRAND, color: "#1a1a1a",
              fontWeight: 700, border: "none", borderRadius: 8, padding: "10px 18px", cursor: "pointer",
              fontFamily: "var(--font-roboto)", fontSize: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {exporting ? "Generating…" : "Download PDF"}
          </button>
        </div>
      )}

      {/* A4 document (794px ≈ 210mm @ 96dpi) */}
      <div
        ref={docRef}
        style={{
          width: 794, margin: "0 auto", background: "#ffffff", color: INK,
          padding: "12px 56px", boxSizing: "border-box", fontSize: 12.5, lineHeight: 1.55,
        }}
      >
        {/* ── Cover header ── */}
        <div data-block style={{ position: "relative", borderTop: `6px solid ${BRAND}`, paddingTop: 22, marginBottom: 28, overflow: "hidden" }}>
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
              <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: MUTED, fontWeight: 600 }}>
                Project Document
              </div>
              <h1 style={{ fontFamily: "var(--font-qanelas)", fontWeight: 700, fontSize: 30, lineHeight: 1.12, margin: "10px 0 6px" }}>
                {m.project_title as string}
              </h1>
              <div style={{ fontSize: 14, color: MUTED }}>
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
        <div data-block>
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
              <div key={n.narrative_key} data-block style={{ marginBottom: 14 }}>
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
                head={["Risk", "Categories", "L", "I", "Approved mitigation"]}
                widths={["24%", "18%", "6%", "6%", "46%"]}
                align={["left", "left", "center", "center", "left"]}
                rows={data.risks.map((r) => [
                  r.risk_name,
                  r.categories.length ? r.categories.join(", ") : "—",
                  r.likelihood ?? "—",
                  r.impact ?? "—",
                  r.approved_mitigation || "—",
                ])}
              />
            </div>
          </Section>
        )}

        {/* ── Workplan ── */}
        {data.activities.length > 0 && (
          <Section title="Workplan">
            {outcomeGroups.map(([outcome, acts]) => (
              <div key={outcome} data-block style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 5, color: "#374151" }}>
                  {outcome}
                </div>
                <Table
                  head={["#", "Activity", "Implementing agent", "Planned quarters"]}
                  widths={["8%", "42%", "22%", "28%"]}
                  rows={acts.map((a) => [
                    a.activity_num || "—",
                    a.activity_text || "—",
                    a.implementing_agent || "—",
                    Array.isArray(a.planned_quarters) && a.planned_quarters.length
                      ? a.planned_quarters.join(", ") : "—",
                  ])}
                />
              </div>
            ))}
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
