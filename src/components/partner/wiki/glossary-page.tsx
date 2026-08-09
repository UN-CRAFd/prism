import { Library } from "lucide-react";
import { SectionHeading } from "./wiki-components";

const terms = [
  {
    term: "PRISM",
    def: "The CRAF'd reporting platform you are using — where Project Documents and reports are created, submitted, and reviewed.",
  },
  {
    term: "Project Document (ProDoc)",
    def: "Your project's core reference document: general information, narratives, indicators, risks, budgets, workplan, and signatures. Must be completed before funding is disbursed.",
  },
  {
    term: "Report",
    def: "A periodic (usually annual, and a final) submission of your project's progress, organized into 14 qualitative and quantitative sections.",
  },
  {
    term: "RBM (Results Based Management)",
    def: "The framework of outcomes, outputs, and activities your project is built around. The Workplan is generated from it.",
  },
  {
    term: "Outcome / Output / Activity",
    def: "The RBM hierarchy: outcomes are the high-level changes sought, outputs are the deliverables that lead to them, and activities are the concrete tasks that produce outputs.",
  },
  {
    term: "Indicator",
    def: "A measurable value used to track progress. Each has a baseline (starting point) and a target (goal), with a year for each.",
  },
  {
    term: "Baseline / Target",
    def: "The indicator's value at the start of the project (baseline) and the value it aims to reach by the end (target).",
  },
  {
    term: "SDG Targets",
    def: "The specific UN Sustainable Development Goal targets your project contributes to. Each is assigned a focus percentage; together they should total 100%.",
  },
  {
    term: "UNSDG Budget Categories",
    def: "The standard budget-line categories all expenditure must be reported against.",
  },
  {
    term: "Indirect (support) costs",
    def: "The percentage added on top of direct project costs to cover overheads. Applied automatically in the budget totals.",
  },
  {
    term: "Transfers",
    def: "Movements of funds between participating organizations or budget lines, recorded in the report.",
  },
  {
    term: "Complementary Funding",
    def: "Additional funding sources that contributed to the project beyond the core CRAF'd grant.",
  },
  {
    term: "Focal Point",
    def: "The primary contact CRAF'd communicates with for the project, usually accountable for reporting.",
  },
  {
    term: "Authorize",
    def: "The action that formally submits a report to CRAF'd. It locks the report for you and grants CRAF'd permission to use submitted materials for outreach.",
  },
  {
    term: "Secure link",
    def: "A personal email link CRAF'd can send that opens a specific report directly, without a separate login.",
  },
  {
    term: "Auto-save",
    def: "PRISM's automatic saving — changes are written as you type or leave a field, confirmed by a brief 'Saved' indicator.",
  },
];

export function GlossaryPage() {
  return (
    <section id="glossary" className="scroll-mt-32 py-12">
      <SectionHeading icon={Library}>Glossary</SectionHeading>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left w-[28%]">Term</th>
              <th className="px-4 py-2.5 text-left">Meaning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {terms.map(({ term, def }) => (
              <tr key={term} className="hover:bg-muted/40 align-top">
                <td className="px-4 py-3 font-medium text-foreground leading-snug">
                  {term}
                </td>
                <td className="px-4 py-3 text-muted-foreground leading-relaxed">
                  {def}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
