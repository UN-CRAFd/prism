import { FileEdit } from "lucide-react";
import { WikiShell, SectionHeading, InfoBox, Step } from "./wiki-components";

const reportSections = [
  {
    name: "Overview",
    group: "Qualitative",
    desc: "High-level narrative summary of the project's progress and context during the reporting period.",
  },
  {
    name: "Surveys",
    group: "Qualitative",
    desc: "Data and findings from surveys or assessments conducted as part of the project.",
  },
  {
    name: "Key Achievements",
    group: "Qualitative",
    desc: "Narrative description of the project's most significant outputs and outcomes.",
  },
  {
    name: "Partnerships",
    group: "Qualitative",
    desc: "Description of partnerships formed and their contribution to the project's results.",
  },
  {
    name: "Results",
    group: "Qualitative",
    desc: "Progress against the project's stated results and objectives for the period.",
  },
  {
    name: "Lessons Learned",
    group: "Qualitative",
    desc: "Insights gathered during implementation that could improve future projects or inform adaptive management.",
  },
  {
    name: "External Coverage",
    group: "Qualitative",
    desc: "Media mentions, publications, or external recognition of the project's work.",
  },
  {
    name: "Testimonials",
    group: "Qualitative",
    desc: "Quotes or statements from project beneficiaries, partners, or stakeholders.",
  },
  {
    name: "Risk Management",
    group: "Quantitative",
    desc: "Updated risk register with current statuses and any newly identified risks since the last report.",
  },
  {
    name: "Indicators",
    group: "Quantitative",
    desc: "Actual values achieved for each indicator compared to baseline and targets.",
  },
  {
    name: "Workplan",
    group: "Quantitative",
    desc: "Quarter-grid showing planned vs. completed activities. Tick the quarters completed during this reporting period.",
  },
  {
    name: "Expenditure",
    group: "Quantitative",
    desc: "Actual expenditure versus approved budget, disaggregated by year and participating organization.",
  },
  {
    name: "Transfers",
    group: "Quantitative",
    desc: "Record of fund transfers between participating organizations or budget lines.",
  },
  {
    name: "Complementary Funding",
    group: "Quantitative",
    desc: "Additional funding sources that contributed to the project beyond the core CRAF'd grant.",
  },
];

export function ReportEditorPage() {
  return (
    <WikiShell>
      <SectionHeading icon={FileEdit}>Report Editor</SectionHeading>

      <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
        The <strong>Report Editor</strong> is where you submit your
        project&apos;s progress, usually on an annual basis. Access it via{" "}
        <strong>Report Editor</strong> in the sidebar — all reports available
        to you appear there, organized by project and year. CRAF&apos;d may
        also send you a direct secure link when a new report is opened. Each
        report has <strong>14 sections</strong> split into Qualitative and
        Quantitative groups.
      </p>

      {/* 14 sections table */}
      <div className="mb-8 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left">Section</th>
              <th className="px-4 py-2.5 text-left">Group</th>
              <th className="px-4 py-2.5 text-left">What to fill in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reportSections.map(({ name, group, desc }) => (
              <tr key={name} className="hover:bg-muted/40">
                <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap align-top">
                  {name}
                </td>
                <td className="px-4 py-2.5 align-top">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      group === "Qualitative"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {group}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground leading-relaxed">
                  {desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Step-by-step */}
      <p className="mb-4 text-sm font-semibold text-foreground">
        How to complete and submit a Report
      </p>
      <div className="space-y-0">
        <Step number={1} title="Open your report">
          Click <strong>Report Editor</strong> in the sidebar. Every report
          available to you is listed there, grouped by project and year —
          click the one you want to open. If CRAF&apos;d sent you a direct
          link for a newly opened report, that will take you there too.
        </Step>
        <Step number={2} title="Navigate sections from the sidebar">
          Once inside a report, the sidebar shows each of its 14 sections.
          Sections with a <strong>green checkmark</strong> are considered
          complete by PRISM. The Report Editor landing page shows an overall
          completion progress bar.
        </Step>
        <Step number={3} title="Complete the Qualitative sections">
          Work through Overview, Surveys, Key Achievements, Partnerships,
          Results, Lessons Learned, External Coverage, and Testimonials. Each
          is a rich text area — write narrative content describing your
          project&apos;s progress for the period. PRISM auto-saves as you type
          or leave a field.
        </Step>
        <Step number={4} title="Complete the Quantitative sections">
          Fill in Risk Management (updated register), Indicators (actual values
          vs. targets), Workplan (quarter-grid ticks), Expenditure (actual vs.
          budget), Transfers, and Complementary Funding. These sections contain
          structured tables — enter figures in each row.
        </Step>
        <Step number={5} title="Check all sections show a green checkmark">
          Review the sidebar to confirm every section has a green checkmark.
          If any are missing, open that section and complete or save the
          remaining required fields before returning.
        </Step>
        <Step number={6} title="Authorize and submit">
          Click <strong>Authorize</strong> on the Report Editor landing page.
          Read and accept the authorization statement — this formally submits
          your report and grants CRAF&apos;d permission to use submitted
          materials for outreach purposes. The report locks and enters
          CRAF&apos;d&apos;s review queue.
        </Step>
        <Step number={7} title="Respond to CRAF'd comments (if any)">
          During review, CRAF&apos;d may leave comments on specific sections.
          You will see a notification on your Home page — click it to jump
          directly to the relevant section. Edit the content or leave a reply,
          then save. When CRAF&apos;d is satisfied, they will close the report
          and it becomes permanently read-only.
        </Step>
      </div>

      <div className="space-y-3">
        <InfoBox variant="green">
          <strong>Auto-save:</strong> PRISM saves your work automatically as
          you type or leave a field. A &apos;Saved&apos; indicator appears
          briefly in the top bar. In sections with an explicit Save button,
          click it after making changes — the button disappears once saved.
        </InfoBox>
        <InfoBox variant="amber">
          <strong>After authorization:</strong> The report locks and all fields
          become read-only. Changes can only be made if CRAF&apos;d reopens
          the report for revision.
        </InfoBox>
      </div>
    </WikiShell>
  );
}
