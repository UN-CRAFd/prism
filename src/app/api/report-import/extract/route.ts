import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import AnthropicFoundry from "@anthropic-ai/foundry-sdk";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { badRequest, notFound, serverError, toIntId } from "@/lib/http";
import { logger } from "@/lib/logger";
import { loadOptionOverrides } from "@/lib/option-settings";
import { optionValues } from "@/lib/options";
import { reportIndicatorLines, type ReportIndicatorLine } from "@/lib/indicator-sync";
import { statusKeysFor, statusLabel } from "@/lib/indicators";
import { readXlsx } from "@/lib/xlsx-text";
import {
  EXTRACTION_FORMAT,
  LIST_SECTIONS,
  normaliseExtraction,
  type ExtractionKind,
} from "@/lib/report-import";
import { loadQuantContext } from "@/lib/report-import-quant";
import { QUANT_SECTIONS, type QuantPromptInput } from "@/lib/report-import-quant-extract";
import type { SheetText } from "@/lib/xlsx-text";

// ─────────────────────────────────────────────────────────────────────────────
// POST multipart { reportId, kind, file } → ReportExtraction (admin only)
//
// Sends a partner's report to Claude and returns the proposed values for
// review. Nothing is written to the database here; the admin reviews the
// result and /api/report-import applies what they approve.
//
//   kind = "narrative"    — narrative report, PDF
//   kind = "quantitative" — PDF or Excel (.xlsx): indicators, risks, work plan,
//                           budget, transfers and complementary funding, each
//                           extracted in its own request, in parallel (one per
//                           sheet for Excel). Excel is
//                           converted to text here (lib/xlsx-text); the model
//                           also suggests which PRISM indicator each row fills.
//
// Provider, chosen from the server's environment (first match wins):
//   1. Microsoft Foundry — ANTHROPIC_FOUNDRY_API_KEY plus ANTHROPIC_FOUNDRY_RESOURCE
//      (or ANTHROPIC_FOUNDRY_BASE_URL). ANTHROPIC_FOUNDRY_DEPLOYMENT names the
//      deployment if it is not called "claude-opus-5-5".
//   2. Anthropic API — ANTHROPIC_API_KEY.
// With neither, the endpoint answers 503 and the admin page falls back to
// uploading an extraction file instead.
//
// Data handling: the document is sent to the provider and is not stored by
// PRISM. Keep that in mind when deciding which documents to run through it.
// ─────────────────────────────────────────────────────────────────────────────

export const maxDuration = 300;

const MODEL = "claude-opus-5-5";
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type Provider =
  | { kind: "foundry"; client: AnthropicFoundry; model: string }
  | { kind: "anthropic"; client: Anthropic; model: string };

function provider(): Provider | null {
  const env = process.env;
  if (env.ANTHROPIC_FOUNDRY_API_KEY && (env.ANTHROPIC_FOUNDRY_RESOURCE || env.ANTHROPIC_FOUNDRY_BASE_URL)) {
    // The client reads the key and resource / base URL from the environment.
    return { kind: "foundry", client: new AnthropicFoundry(), model: env.ANTHROPIC_FOUNDRY_DEPLOYMENT?.trim() || MODEL };
  }
  if (env.ANTHROPIC_API_KEY) return { kind: "anthropic", client: new Anthropic(), model: MODEL };
  return null;
}

// ── Output schemas (structured outputs) ──────────────────────────────────────
// Structured outputs allow at most 16 nullable/union-typed fields per schema, so
// "not found" is an empty string / 0 instead of null. normaliseExtraction turns
// "" and 0 back into null.
const TEXT = { type: "string" } as const;
const PAGE = { type: "integer", description: "Page in the source file (1 = first page; 0 = unknown)" } as const;
const NOTES = { type: "array", items: obj({ section: { type: "string" }, message: { type: "string" } }) };

function obj(properties: Record<string, unknown>) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

function narrativeSchema() {
  const sections: Record<string, unknown> = {};
  for (const def of LIST_SECTIONS) {
    const props: Record<string, unknown> = { page: PAGE };
    for (const f of def.fields) props[f.key] = TEXT;
    sections[def.key] = { type: "array", items: obj(props) };
  }
  return obj({
    report_submission_date: { type: "string", description: "YYYY-MM-DD, or empty" },
    surveys: {
      type: "array",
      items: obj({
        question: { type: "string" },
        assessment: { type: "integer", description: "Rating 1-5, or 0 when there is none" },
        context: TEXT,
        page: PAGE,
      }),
    },
    sections: obj(sections),
    testimonials: {
      type: "array",
      items: obj({
        kind: { type: "string", enum: ["leadership", "partner"] },
        quote: TEXT,
        person_name: TEXT,
        person_title: TEXT,
        photo_credits: TEXT,
        page: PAGE,
      }),
    },
    notes: NOTES,
  });
}

function narrativePrompt(questions: string[], lessons: string[], coverage: string[]): string {
  const sectionLines = LIST_SECTIONS.map(
    (d) =>
      `- ${d.key} ("${d.label}"${d.max ? `, at most ${d.max} per report` : ""}): ${d.fields.map((f) => f.key).join(", ")}`
  ).join("\n");

  return `You extract data from a partner's annual or final narrative project report for CRAF'd (Complex Risk Analytics Fund) so it can be loaded into PRISM, CRAF'd's reporting platform. An administrator reviews every value before anything is saved.

Rules:
- Copy the partner's wording verbatim. Do not summarise, rephrase, correct, or add anything. Fix only broken line-wrapping and hyphenation from the PDF layout.
- Skip template material: section instructions, the grey example/instruction rows (marked with an "i" icon), and rows that are empty in the document.
- Leave a text field empty ("") when the document does not contain it, and use 0 for a missing rating or page. Never guess or invent values.
- For "page", give the page number of the source file (the first page of the file is 1, ignoring printed page numbers).
- Keep links as they appear; separate several links with a new line.
- Record anything the reviewer should know in "notes": more items than a section allows, inconsistent dates or figures, text that appears cut off, duplicate item numbering, content you could not place.

Fields:
- report_submission_date: the report submission date as YYYY-MM-DD (empty if not given).
- surveys: the project self-assessment. For each question, "assessment" is the rating number 1-5 (dropdowns may show only "4 - G…"; use the leading number), "context" is the justification. Use the question text exactly as in this list when the document's question corresponds to one of them:
${questions.length ? questions.map((q) => `  • ${q}`).join("\n") : "  (no questions are set up for this report — use the document's wording)"}
- sections:
${sectionLines}
  lessons_learned.category must be one of: ${lessons.join(", ")}.
  external_coverage.type must be one of: ${coverage.join(", ")} (dropdowns may be cut off, e.g. "News medi…" = News Coverage).
- testimonials: "leadership" for the leadership testimonial (one per report), "partner" for partner/user testimonials (at most 3 per report; extract all of them anyway and add a note if there are more). For partner quotes, person_title holds the title and organisation. Photo labels and photo files are not extracted.
Apart from the submission date, do not extract the project information table, the authorization checkbox, or photos.`;
}

function quantitativeSchema(statuses: string[], categories: string[]) {
  const YEAR = { type: "integer", description: "Year, e.g. 2024; 0 = not given" };
  return obj({
    indicators: {
      type: "array",
      items: obj({
        number: TEXT,
        name: TEXT,
        description: TEXT,
        means_of_verification: TEXT,
        category: { type: "string", enum: ["", ...categories] },
        cycle: { type: "string", enum: ["", "yearly", "at_closure"] },
        baseline_value: TEXT,
        baseline_year: YEAR,
        target_value: TEXT,
        target_year: YEAR,
        achieved_value: TEXT,
        status: { type: "string", enum: ["", ...statuses] },
        comment: TEXT,
        match_indicator_id: { type: "integer", description: "id of the matching PRISM indicator; 0 = none" },
        match_note: TEXT,
        page: PAGE,
        row: { type: "integer", description: "Spreadsheet row number; 0 for a PDF" },
      }),
    },
    notes: NOTES,
  });
}

function quantitativePrompt(
  year: number,
  reportType: string | null,
  statuses: string[],
  lines: ReportIndicatorLine[],
  isSpreadsheet: boolean,
  categories: string[]
): string {
  const kind = reportType === "final" ? "final" : "annual";
  const lineList = lines.length
    ? lines
        .map((l) => {
          const desc = l.description ? ` — ${l.description.replace(/\s+/g, " ").slice(0, 300)}` : "";
          return `  • ${l.indicator_id}: ${l.name}${desc}${l.category ? ` [${l.category}]` : ""}`;
        })
        .join("\n")
    : "  (this report has no indicators yet — set match_indicator_id to 0 for every row)";

  return `You extract indicator results from a partner's quantitative project report (an indicator table) for CRAF'd (Complex Risk Analytics Fund) so they can be loaded into PRISM, CRAF'd's reporting platform. An administrator reviews every value before anything is saved.

The PRISM report being filled is the ${kind} report for ${year}.

Rules:
- One entry per indicator row in the document, including sub-indicators (e.g. 11.1). Skip header rows, instruction rows ("Use only numbers…", "Hide") and empty template rows.
- The table may show several years side by side. Use only the ${year} columns for achieved_value, status and comment. If you cannot tell which columns belong to ${year}, leave those fields empty and add a note.
- Copy values exactly as displayed ("83,300,000", "92.70%", "US$50 million"). Do not convert, round or calculate.
- achieved_value: empty when the ${year} cell is empty.
- status: one of ${statuses.map((s) => `"${s}" (${statusLabel(s)})`).join(", ")}. Map the document's wording to these. Leave it empty when the status is missing, says "Select an option", or does not clearly correspond (e.g. "Delayed" in a final report) — and add a note naming the indicator.
- comment: the ${year} comment, verbatim (fix only broken line-wrapping).
- number, name, baseline_value, target_value: as shown in the document. baseline_year / target_year: the years given for them (0 if none).
- description and means_of_verification: the indicator's description and means of verification, verbatim, if the document has them (empty otherwise). They are used if the indicator is added to the project.
- category: the closest of ${categories.map((c) => `"${c}"`).join(", ")} for what the indicator measures; empty if none fits. (The document's own categories, e.g. "Beneficiaries", are a different scheme — do not copy them.)
- cycle: "yearly" if the indicator has a target or is reported for each year (e.g. "Yearly"), "at_closure" if its target is only for the end of the project; empty if unclear (e.g. "Every two years") — add a note then.
- match_indicator_id: the id of the PRISM indicator below that measures the same thing as the row. Match on meaning, not just topic or shared words — a row about "downloads of datasets via HDX" is not the same as "API calls". Use 0 when none fits. Use each PRISM indicator for at most one row; if several rows fit, pick the closest and explain in match_note.
- match_note: one short sentence: why the row matches, or why nothing fits.
- ${isSpreadsheet ? 'row: the spreadsheet row number ("Row 12" → 12); page: 0.' : "page: the page of the PDF file (1 = first page); row: 0."}
- notes: anything the reviewer should check — achieved values that look inconsistent with the target, missing statuses, comments that appear cut off, rows you could not read.

PRISM indicators of this report (id: name — description [category]):
${lineList}`;
}

// ── Calling the model ────────────────────────────────────────────────────────

interface ModelResult {
  parsed: Record<string, unknown>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

/** One structured-output request. Throws with a readable message on refusal / truncation. */
async function callModel(
  ai: Provider,
  system: string,
  schema: Record<string, unknown>,
  document: Anthropic.Beta.BetaRequestDocumentBlock
): Promise<ModelResult> {
  const params = {
    model: ai.model,
    max_tokens: 64000,
    output_config: { effort: "medium" as const, format: { type: "json_schema" as const, schema } },
    system,
    messages: [
      {
        role: "user" as const,
        content: [document, { type: "text" as const, text: "Extract this report into the JSON format." }],
      },
    ],
  };
  // Server-side refusal fallback exists only on the Anthropic API; on Foundry a
  // refusal is reported to the admin.
  const message =
    ai.kind === "foundry"
      ? await ai.client.beta.messages.stream(params).finalMessage()
      : await ai.client.beta.messages
          .stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
          .finalMessage();
  if (message.stop_reason === "refusal") throw new ExtractionError("The model declined to process this document.", 422);
  if (message.stop_reason === "max_tokens") throw new ExtractionError("The document is too long to extract in one go.", 422);
  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new ExtractionError("The model returned no result.", 502);
  return {
    parsed: JSON.parse(block.text) as Record<string, unknown>,
    model: message.model,
    usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
  };
}

class ExtractionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function errorText(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const detail = (err.error as { error?: { message?: string } } | undefined)?.error?.message;
    return `${err.status ?? "error"}${detail ? `: ${detail}` : ""}`;
  }
  return err instanceof Error ? err.message : "unknown error";
}

function logUsage(reportId: number, kind: string, actor: string, file: string, provider: string, results: ModelResult[]) {
  logger.info("Report import extraction", {
    reportId,
    kind,
    actor,
    file,
    provider,
    requests: results.length,
    input_tokens: results.reduce((n, r) => n + r.usage.input_tokens, 0),
    output_tokens: results.reduce((n, r) => n + r.usage.output_tokens, 0),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const ai = provider();
  if (!ai) {
    return NextResponse.json(
      {
        error:
          "Automatic extraction is not set up on this server (no Microsoft Foundry or Anthropic API settings). Upload an extraction file (.json) instead.",
        code: "no_api_key",
      },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return badRequest("Expected a file upload");
  }
  const reportId = toIntId(form.get("reportId"));
  const file = form.get("file");
  const kind: ExtractionKind = form.get("kind") === "quantitative" ? "quantitative" : "narrative";
  if (!reportId) return badRequest("reportId is required");
  if (!(file instanceof File)) return badRequest("file is required");
  if (file.size > MAX_FILE_BYTES) return badRequest("File is larger than 25 MB");

  const name = file.name.toLowerCase();
  const isPdf = name.endsWith(".pdf");
  const isXlsx = name.endsWith(".xlsx");
  if (kind === "narrative" && !isPdf) return badRequest("Upload the narrative report as a PDF.");
  if (kind === "quantitative" && !isPdf && !isXlsx) {
    return badRequest("Upload the quantitative report as an Excel (.xlsx) or PDF file.");
  }

  const report = (
    await query<{ project_id: number; year: number; report_type: string | null; data_type: string }>(
      `SELECT project_id, year, report_type::text AS report_type, data_type FROM reporting_platform.reports WHERE id = $1`,
      [reportId]
    )
  )[0];
  if (!report) return notFound("Report not found");
  if (report.data_type !== "report") return badRequest("Only annual/final reports can be imported into");

  const buf = new Uint8Array(await file.arrayBuffer());
  const pdfDocument = (): Anthropic.Beta.BetaRequestDocumentBlock => ({
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: Buffer.from(buf).toString("base64") },
    title: file.name,
  });
  const sheetDocument = (chosen: SheetText[]): Anthropic.Beta.BetaRequestDocumentBlock => ({
    type: "document",
    source: { type: "text", media_type: "text/plain", data: chosen.map((s) => `Sheet "${s.name}"\n${s.text}`).join("\n\n") },
    title: file.name,
  });
  let sheets: SheetText[] = [];
  if (isXlsx) {
    try {
      sheets = readXlsx(buf).filter((s) => !s.hidden && s.rows > 0);
    } catch {
      return badRequest("The file could not be read");
    }
    if (!sheets.length) return badRequest("The workbook has no data.");
  }

  try {
    // ── Narrative report: one request ──
    if (kind === "narrative") {
      const questions = (
        await query<{ question: string }>(
          `SELECT question FROM reporting_platform.surveys WHERE report_id = $1 ORDER BY id`,
          [reportId]
        )
      ).map((r) => r.question);
      await loadOptionOverrides();
      const res = await callModel(
        ai,
        narrativePrompt(questions, optionValues("lessonsCategory"), optionValues("externalCoverageType")),
        narrativeSchema(),
        pdfDocument()
      );
      const extraction = normaliseExtraction({
        ...res.parsed,
        format: EXTRACTION_FORMAT,
        kind,
        source: { file_name: file.name, extracted_by: res.model },
      });
      if (!extraction) return NextResponse.json({ error: "The result could not be read." }, { status: 502 });
      logUsage(reportId, kind, session.name, file.name, ai.kind, [res]);
      return NextResponse.json(extraction);
    }

    // ── Quantitative report: one request per section, in parallel ──
    await loadOptionOverrides();
    const lines = await reportIndicatorLines(reportId, report.project_id);
    const statuses: string[] = statusKeysFor(report.report_type);
    const indicatorCategories = optionValues("indicatorCategory");
    const context = await loadQuantContext({ id: reportId, project_id: report.project_id, year: report.year, report_type: report.report_type });
    const input: QuantPromptInput = {
      year: report.year,
      reportType: report.report_type,
      isSpreadsheet: isXlsx,
      context,
      options: {
        riskCategory: optionValues("riskCategory"),
        workplanStatus: optionValues("workplanStatus"),
        transferPartnerType: optionValues("transferPartnerType"),
        complementaryFundingType: optionValues("complementaryFundingType"),
      },
    };

    // Which sheet each section reads (Excel); a PDF goes to every section whole.
    const usedSheets: Record<string, string> = {};
    const pick = (re: RegExp) => sheets.find((s) => re.test(s.name) && !Object.values(usedSheets).includes(s.name));
    const tasks: { key: string; label: string; run: () => Promise<ModelResult> }[] = [];
    const indicatorSheet = isXlsx ? pick(/indicator/i) : undefined;
    if (indicatorSheet) usedSheets.indicators = indicatorSheet.name;
    for (const spec of QUANT_SECTIONS) {
      const sheet = isXlsx ? pick(spec.sheet) : undefined;
      if (isXlsx && !sheet) continue;
      if (sheet) usedSheets[spec.key] = sheet.name;
      tasks.push({
        key: spec.key,
        label: spec.label,
        run: () => callModel(ai, spec.prompt(input), spec.schema(input), sheet ? sheetDocument([sheet]) : pdfDocument()),
      });
    }
    // Indicators: the indicator sheet, or — in a workbook with no recognisable
    // sheets at all — every sheet, as before.
    if (!isXlsx || indicatorSheet || !tasks.length) {
      const docs = isXlsx ? (indicatorSheet ? [indicatorSheet] : sheets) : null;
      if (docs && !indicatorSheet) usedSheets.indicators = docs.map((s) => s.name).join(", ");
      tasks.unshift({
        key: "indicators",
        label: "Indicators",
        run: () =>
          callModel(
            ai,
            quantitativePrompt(report.year, report.report_type, statuses, lines, isXlsx, indicatorCategories),
            quantitativeSchema(statuses, indicatorCategories),
            docs ? sheetDocument(docs) : pdfDocument()
          ),
      });
    }

    const settled = await Promise.allSettled(tasks.map((t) => t.run()));
    const ok = settled.flatMap((s, i) => (s.status === "fulfilled" ? [{ key: tasks[i].key, label: tasks[i].label, res: s.value }] : []));
    if (!ok.length) throw (settled[0] as PromiseRejectedResult).reason;

    const by = (key: string) => ok.find((o) => o.key === key)?.res.parsed ?? {};
    const notes: { section: string; message: string }[] = [];
    for (const o of ok) {
      for (const n of Array.isArray(o.res.parsed.notes) ? (o.res.parsed.notes as Record<string, unknown>[]) : []) {
        if (typeof n?.message === "string" && n.message.trim()) notes.push({ section: o.label, message: n.message });
      }
    }
    settled.forEach((s, i) => {
      if (s.status === "rejected") {
        notes.push({ section: tasks[i].label, message: `This sheet could not be read (${errorText(s.reason)}). Try again, or enter it in the report editor.` });
      }
    });

    const risks = (Array.isArray(by("risks").risks) ? (by("risks").risks as Record<string, unknown>[]) : []).map((r) => ({
      ...r,
      project_revision: r.project_revision === "yes" ? true : r.project_revision === "no" ? false : null,
    }));
    const exp = by("expenditure");
    const extraction = normaliseExtraction({
      format: EXTRACTION_FORMAT,
      kind,
      source: {
        file_name: file.name,
        extracted_by: ok[0].res.model,
        sheet: usedSheets.indicators ?? null,
        sheets: usedSheets,
      },
      indicators: by("indicators").indicators,
      risks,
      workplan: by("workplan").activities,
      expenditure: { entries: exp.entries, indirect_expenditure: exp.indirect_expenditure, indirect_row: exp.indirect_row },
      transfers: by("transfers"),
      complementary: by("complementary"),
      notes,
    });
    if (!extraction) return NextResponse.json({ error: "The result could not be read." }, { status: 502 });

    // Suggested matches must belong to this report / project.
    const validIndicators = new Set(lines.map((l) => l.indicator_id));
    for (const ind of extraction.indicators) {
      if (ind.match_indicator_id !== null && !validIndicators.has(ind.match_indicator_id)) ind.match_indicator_id = null;
    }
    const validRisks = new Set(context.risks.map((r) => r.id));
    for (const r of extraction.risks) if (r.match_risk_id !== null && !validRisks.has(r.match_risk_id)) r.match_risk_id = null;
    const validActivities = new Set(context.activities.map((a) => a.id));
    for (const a of extraction.workplan) {
      if (a.match_activity_id !== null && !validActivities.has(a.match_activity_id)) a.match_activity_id = null;
    }

    logUsage(reportId, kind, session.name, file.name, ai.kind, ok.map((o) => o.res));
    return NextResponse.json(extraction);
  } catch (err) {
    if (err instanceof ExtractionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "The extraction service is busy. Try again in a minute." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      logger.error("Report import: Anthropic API error", err, { reportId, status: err.status });
      // Admin-only endpoint: pass the provider's reason through so it can be acted on.
      const detail = (err.error as { error?: { message?: string } } | undefined)?.error?.message;
      return NextResponse.json(
        {
          error: `The extraction service returned an error${err.status ? ` (${err.status})` : ""}${detail ? `: ${detail}` : "."}`,
        },
        { status: 502 }
      );
    }
    logger.error("POST /api/report-import/extract error:", err, { reportId });
    return serverError();
  }
}
