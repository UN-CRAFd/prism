import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { likelihoodFromText, impactFromText } from "@/lib/risk";

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").trim().replace(/^"|"$/g, "");
    });
    return row;
  });
}

function toProjectRevision(val: string | undefined): boolean {
  if (!val) return false;
  return ["yes", "true", "1"].includes(val.trim().toLowerCase());
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const section = (form.get("section") as string | null) ?? "surveys";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (section !== "surveys" && section !== "risk") {
    return NextResponse.json({ error: `Unknown section: ${section}` }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCSV(text);

  if (rows.length === 0) {
    return NextResponse.json({ error: "No data rows found in file" }, { status: 400 });
  }

  // ── Risk Management ──────────────────────────────────────────────────────
  if (section === "risk") {
    const required = ["year", "project_name", "risk_name"];
    for (const col of required) {
      if (!(col in rows[0])) {
        return NextResponse.json(
          { error: `Missing required column: "${col}". Expected: year, project_name, risk_name` },
          { status: 400 }
        );
      }
    }

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const { year, project_name, risk_name, risk_category, likelihood, impact,
              approved_mitigation, updated_mitigation, project_revision } = row;

      if (!year || !project_name || !risk_name) {
        skipped++;
        errors.push(`Skipped empty row (year="${year}", project_name="${project_name}", risk_name="${risk_name}")`);
        continue;
      }

      const yearNum = Number(year);
      if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
        skipped++;
        errors.push(`Skipped row: invalid year "${year}" for project "${project_name}"`);
        continue;
      }

      const matches = await query<{ id: number }>(
        `SELECT r.id
         FROM reporting_platform.reports r
         JOIN reporting_platform.projects p ON p.id = r.project_id
         WHERE r.year = $1
           AND r.data_type = 'report'
           AND (p.project_title ILIKE $2 OR p.short_name ILIKE $2)
         LIMIT 1`,
        [yearNum, project_name.trim()]
      );

      if (matches.length === 0) {
        skipped++;
        errors.push(`No report found for year=${year}, project="${project_name}"`);
        continue;
      }

      const reportId = matches[0].id;
      const categories = risk_category
        ? risk_category.split(",").map((c) => c.trim()).filter(Boolean)
        : null;

      await query(
        `INSERT INTO reporting_platform.risk_management
           (report_id, risk_name, risk_category, likelihood, impact,
            approved_mitigation, updated_mitigation, project_revision)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          reportId,
          risk_name.trim(),
          categories,
          likelihoodFromText(likelihood),
          impactFromText(impact),
          approved_mitigation || null,
          updated_mitigation || null,
          toProjectRevision(project_revision),
        ]
      );

      inserted++;
    }

    return NextResponse.json({ inserted, skipped, errors });
  }

  // ── Surveys ──────────────────────────────────────────────────────────────
  const required = ["year", "project_name", "question"];
  for (const col of required) {
    if (!(col in rows[0])) {
      return NextResponse.json(
        { error: `Missing required column: "${col}". Expected: year, project_name, question, assessment, context` },
        { status: 400 }
      );
    }
  }

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const { year, project_name, question, assessment, context } = row;

    if (!year || !project_name || !question) {
      skipped++;
      errors.push(`Skipped empty row (year="${year}", project_name="${project_name}", question="${question}")`);
      continue;
    }

    const yearNum = Number(year);
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      skipped++;
      errors.push(`Skipped row: invalid year "${year}" for project "${project_name}"`);
      continue;
    }

    const matches = await query<{ id: number }>(
      `SELECT r.id
       FROM reporting_platform.reports r
       JOIN reporting_platform.projects p ON p.id = r.project_id
       WHERE r.year = $1
         AND r.data_type = 'report'
         AND (p.project_title ILIKE $2 OR p.short_name ILIKE $2)
       LIMIT 1`,
      [yearNum, project_name.trim()]
    );

    if (matches.length === 0) {
      skipped++;
      errors.push(`No report found for year=${year}, project="${project_name}"`);
      continue;
    }

    const reportId = matches[0].id;
    const assessmentVal = assessment ? Number(assessment) : null;
    const contextVal = context || null;

    await query(
      `INSERT INTO reporting_platform.surveys (report_id, question, assessment, context)
       VALUES ($1, $2, $3, $4)`,
      [reportId, question, Number.isFinite(assessmentVal) ? assessmentVal : null, contextVal]
    );

    inserted++;
  }

  return NextResponse.json({ inserted, skipped, errors });
}
