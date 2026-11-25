import type { QuantContext } from "@/lib/report-import-quant";

// ─────────────────────────────────────────────────────────────────────────────
// Report import — what the model is asked for each quantitative sheet other
// than Indicators (instructions + structured-output schema). Each section is
// extracted in its own request, all in parallel; see
// /api/report-import/extract.
//
// Structured outputs allow at most 16 nullable/union-typed fields per schema, so
// "not found" is "" / 0 / [] and normaliseExtraction maps those back to null.
// ─────────────────────────────────────────────────────────────────────────────

export type QuantSectionKey = "risks" | "workplan" | "expenditure" | "transfers" | "complementary";

export interface QuantPromptInput {
  year: number;
  reportType: string | null;
  isSpreadsheet: boolean;
  context: QuantContext;
  options: {
    riskCategory: string[];
    workplanStatus: string[];
    transferPartnerType: string[];
    complementaryFundingType: string[];
  };
}

export interface QuantSectionSpec {
  key: QuantSectionKey;
  label: string;
  /** Which workbook sheet holds this section. */
  sheet: RegExp;
  schema: (i: QuantPromptInput) => Record<string, unknown>;
  prompt: (i: QuantPromptInput) => string;
}

const TEXT = { type: "string" } as const;
const INT = (description: string) => ({ type: "integer", description });
const LOCATION = {
  row: INT("Spreadsheet row number; 0 for a PDF"),
  page: INT("Page of the PDF file (1 = first page); 0 for a spreadsheet"),
};
const NOTES = { type: "array", items: obj({ message: { type: "string" } }) };

function obj(properties: Record<string, unknown>) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

function common(i: QuantPromptInput, what: string): string {
  const kind = i.reportType === "final" ? "final" : "annual";
  return `You extract ${what} from a partner's quantitative project report for CRAF'd (Complex Risk Analytics Fund) so it can be loaded into PRISM, CRAF'd's reporting platform. An administrator reviews every value before anything is saved.

The PRISM report being filled is the ${kind} report for ${i.year}. The document may show several years side by side: use the ${i.year} values unless told otherwise.

General rules:
- Copy text verbatim (fix only broken line-wrapping). Copy amounts exactly as displayed ("1,234", "$5,000"); do not convert, round or calculate.
- Leave a field empty ("", 0 or []) when the document does not contain it. Never guess.
- Skip header rows, instruction rows (e.g. "Provide…", "Hide", "Select one option"), placeholder rows ("Select an option", "[Add …]", rows with no name and only zeros) and total / subtotal rows.
- ${i.isSpreadsheet ? 'row: the spreadsheet row number ("Row 12" → 12); page: 0.' : "page: the page of the PDF file (1 = first page); row: 0."}
- notes: anything the reviewer should check (inconsistent figures, missing values, text that appears cut off, rows you could not place). Write each note so it names the item it is about.`;
}

const LIKELIHOOD = "1 Rare, 2 Unlikely, 3 Possible, 4 Likely, 5 Very likely";
const IMPACT = "1 Insignificant, 2 Minor, 3 Moderate, 4 Major, 5 Extreme";

export const QUANT_SECTIONS: QuantSectionSpec[] = [
  {
    key: "risks",
    label: "Risks",
    sheet: /risk/i,
    schema: (i) =>
      obj({
        risks: {
          type: "array",
          items: obj({
            name: TEXT,
            origin: { type: "string", enum: ["existing", "new"] },
            description: TEXT,
            categories: { type: "array", items: { type: "string", enum: i.options.riskCategory } },
            approved_mitigation: TEXT,
            updated_likelihood: INT("1-5 for the report year; 0 if not given"),
            updated_impact: INT("1-5 for the report year; 0 if not given"),
            updated_mitigation: TEXT,
            project_revision: { type: "string", enum: ["", "yes", "no"] },
            match_risk_id: INT("id of the matching risk of the PRISM report; 0 = none"),
            ...LOCATION,
          }),
        },
        notes: NOTES,
      }),
    prompt: (i) => `${common(i, "the risk register")}

Fields, one entry per risk:
- name: the risk as stated. origin: "existing" for risks from earlier years (marked "Existing" or with an approved assessment), "new" for risks added in ${i.year}.
- description: a separate description if the document has one.
- categories: the document's category mapped to PRISM's list (${i.options.riskCategory.join(", ")}); several if the document lists several (e.g. "Political, Regulatory" → Political, Legal & Compliance).
- approved_mitigation: the approved mitigation strategy.
- updated_likelihood / updated_impact: the ${i.year} update ("Update likelihood", "Update impact"), as numbers: likelihood ${LIKELIHOOD}; impact ${IMPACT}. 0 if the ${i.year} value is missing or "Select…".
- updated_mitigation: the ${i.year} updated mitigation strategy, verbatim.
- project_revision: "yes" / "no" if the document says whether the risk leads to a project revision; "" if empty.
- match_risk_id: the id of the PRISM risk below that is the same risk (same subject, wording may differ); 0 if none. Use each id at most once.

Risks of the PRISM report (id: name — description):
${i.context.risks.length ? i.context.risks.map((r) => `  • ${r.id}: ${r.risk_name}${r.risk_description ? ` — ${r.risk_description.replace(/\s+/g, " ").slice(0, 200)}` : ""}`).join("\n") : "  (none — set match_risk_id to 0)"}`,
  },
  {
    key: "workplan",
    label: "Work plan",
    sheet: /work\s*plan|activit/i,
    schema: (i) =>
      obj({
        activities: {
          type: "array",
          items: obj({
            number: TEXT,
            text: TEXT,
            objective: TEXT,
            output: TEXT,
            implementing_agent: TEXT,
            planned_quarters: { type: "array", items: { type: "string" } },
            updated_quarters: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["", ...i.options.workplanStatus] },
            comment: TEXT,
            match_activity_id: INT("id of the matching PRISM activity; 0 = none"),
            ...LOCATION,
          }),
        },
        notes: NOTES,
      }),
    prompt: (i) => `${common(i, "work plan progress")}

The work plan lists activities, grouped under objectives / outcomes and outputs. An activity may have several rows: the approved (baseline) timeline, and one row per reporting round (e.g. "Dec24 AR", "Dec25 AR") with the timeline as updated then, a progress status and a comment. Quarter columns are headed by a year and a quarter number; TRUE / a mark means the activity takes place in that quarter.

One entry per activity (not per row):
- number: the activity's number ("A.1.1"); text: the activity, without the number.
- objective: the objective / outcome it belongs to (its number and text); output: the output it belongs to.
- implementing_agent: as stated.
- planned_quarters: the approved timeline as quarter keys "YYYY-Qn" (e.g. "2024-Q2").
- updated_quarters: the timeline in the ${i.year} reporting row, same format.
- status: the ${i.year} progress status mapped to one of: ${i.options.workplanStatus.join(", ")} (e.g. "Delayed – Timeline not met." → Delayed, "Completed" → Achieved). "" if the ${i.year} row has no status.
- comment: the ${i.year} comment, verbatim.
- row: the row of the ${i.year} reporting entry (the activity's own row if there is none).
- match_activity_id: the id of the PRISM activity below that is the same activity (compare meaning; numbering schemes may differ); 0 if none. Use each id at most once.

Activities of the project in PRISM (id: number — activity):
${i.context.activities.length ? i.context.activities.map((a) => `  • ${a.id}: ${a.activity_num ?? ""} — ${(a.activity_text ?? "").replace(/\s+/g, " ").slice(0, 200)}`).join("\n") : "  (none — set match_activity_id to 0)"}`,
  },
  {
    key: "expenditure",
    label: "Budget",
    sheet: /expend|budget|financ/i,
    schema: (i) =>
      obj({
        entries: {
          type: "array",
          items: obj({
            category: { type: "string", enum: i.context.categories.map((c) => c.name) },
            annual_expenditure: TEXT,
            comment: TEXT,
            ...LOCATION,
          }),
        },
        indirect_expenditure: TEXT,
        indirect_row: INT("Row of the indirect support costs; 0 if none / PDF"),
        notes: NOTES,
      }),
    prompt: (i) => `${common(i, "budget expenditure")}

The expenditure table lists budget categories with, per year, the approved budget, the expenditure, the difference and a comment.
- entries: one per budget category: category = the PRISM category it corresponds to (${i.context.categories.map((c) => c.name).join("; ")}); annual_expenditure = the ACTUAL expenditure for ${i.year} (not the approved budget, not a total over all years, not an estimate for a later year); comment = the ${i.year} comment. Include categories whose expenditure is 0.
- Do not include subtotal / total rows.
- indirect_expenditure: the ${i.year} actual indirect support costs (ISC / overhead, e.g. "Indirect support costs (7%)"); indirect_row: its row.`,
  },
  {
    key: "transfers",
    label: "Transfers",
    sheet: /transfer/i,
    schema: (i) => fundingSchema(i.options.transferPartnerType),
    prompt: (i) => fundingPrompt(i, "funding transferred to implementing partners", i.options.transferPartnerType),
  },
  {
    key: "complementary",
    label: "Complementary funding",
    sheet: /complement/i,
    schema: (i) => fundingSchema(i.options.complementaryFundingType),
    prompt: (i) => fundingPrompt(i, "complementary funding (co-funding from other contributors)", i.options.complementaryFundingType),
  },
];

function fundingSchema(types: string[]) {
  return obj({
    rows: {
      type: "array",
      items: obj({
        name: TEXT,
        website: TEXT,
        type: { type: "string", enum: ["", ...types] },
        amount: TEXT,
        linked_activities: TEXT,
        ...LOCATION,
      }),
    },
    none: { type: "boolean", description: "true when no organisation has an amount for the report year" },
    notes: NOTES,
  });
}

function fundingPrompt(i: QuantPromptInput, what: string, types: string[]): string {
  return `${common(i, what)}

The table lists organisations with, per year, an amount and the linked activities.
- rows: one per organisation with an amount above 0 for ${i.year}: name; website (empty if "Unavailable" or missing); type = the organisation type mapped to one of ${types.join(", ")} ("" if not given); amount = the ${i.year} amount as displayed; linked_activities = the ${i.year} linked activities text.
- Organisations with no ${i.year} amount (or 0) are not rows; mention them in a note if they have amounts in other years.
- none: true when the table has no organisation with a ${i.year} amount (only placeholders or zeros).`;
}
