import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { zipSync, strToU8 } from "fflate";

// ── CSV helpers ────────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join(", ") : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines: string[] = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

function slug(s: string): string {
  return (s ?? "unknown").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sections = req.nextUrl.searchParams.getAll("sections");
  if (sections.length === 0) {
    return NextResponse.json({ error: "At least one section is required" }, { status: 400 });
  }

  const files: Record<string, Uint8Array> = {};

  try {
    if (sections.includes("surveys")) {
      const rows = (await query(`
        SELECT
          r.year,
          p.project_title  AS project_name,
          pt.short_name    AS partner,
          s.question,
          s.assessment,
          s.context
        FROM reporting_platform.surveys s
        JOIN reporting_platform.reports  r  ON r.id  = s.reportid
        JOIN reporting_platform.projects p  ON p.id  = r.project_id
        JOIN reporting_platform.partners pt ON pt.id = p.partner_id
        WHERE r.data_type = 'report'
        ORDER BY r.year, pt.short_name, p.project_title, s.id
      `)) as Record<string, unknown>[];

      const groups = new Map<string, { partner: string; year: number; rows: Record<string, unknown>[] }>();
      for (const row of rows) {
        const key = `${row.partner}::${row.year}`;
        if (!groups.has(key)) {
          groups.set(key, { partner: row.partner as string, year: row.year as number, rows: [] });
        }
        groups.get(key)!.rows.push(row);
      }

      const HEADERS = ["year", "project_name", "partner", "question", "assessment", "context"];
      for (const { partner, year, rows: groupRows } of groups.values()) {
        files[`surveys_${slug(partner)}_${year}.csv`] = strToU8(toCsv(HEADERS, groupRows));
      }
    }

    if (sections.includes("risk")) {
      const rows = (await query(`
        SELECT
          r.year,
          p.project_title  AS project_name,
          pt.short_name    AS partner,
          rm.risk_name,
          rm.risk_category,
          rm.likelihood,
          rm.impact,
          rm.approved_mitigation,
          rm.updated_mitigation,
          rm.project_revision
        FROM reporting_platform.risk_management rm
        JOIN reporting_platform.reports  r  ON r.id  = rm.report_id
        JOIN reporting_platform.projects p  ON p.id  = r.project_id
        JOIN reporting_platform.partners pt ON pt.id = p.partner_id
        ORDER BY r.year, pt.short_name, p.project_title, rm.id
      `)) as Record<string, unknown>[];

      const groups = new Map<string, { partner: string; year: number; rows: Record<string, unknown>[] }>();
      for (const row of rows) {
        const key = `${row.partner}::${row.year}`;
        if (!groups.has(key)) {
          groups.set(key, { partner: row.partner as string, year: row.year as number, rows: [] });
        }
        groups.get(key)!.rows.push(row);
      }

      const HEADERS = [
        "year", "project_name", "partner", "risk_name", "risk_category",
        "likelihood", "impact", "approved_mitigation", "updated_mitigation", "project_revision",
      ];
      for (const { partner, year, rows: groupRows } of groups.values()) {
        files[`risk_${slug(partner)}_${year}.csv`] = strToU8(toCsv(HEADERS, groupRows));
      }
    }

    if (Object.keys(files).length === 0) {
      return NextResponse.json({ error: "No data found for the selected sections" }, { status: 404 });
    }

    const zipped = zipSync(files);
    return new Response(zipped, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="export.zip"',
      },
    });
  } catch (err) {
    console.error("GET /api/download/zip error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
