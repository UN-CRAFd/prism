import { FileText } from "lucide-react";
import { SectionHeading, InfoBox, Badge, Step } from "./wiki-components";

const prodocSections = [
  {
    name: "General Information",
    what: "Project title, start date, and duration in months. Must be completed before other sections are fully editable.",
    required: "Yes",
  },
  {
    name: "Narratives",
    what: "Several predetermined text boxes — hover each title for detailed instructions. Include hyperlinks to publicly accessible documents.",
    required: "Yes",
  },
  {
    name: "Indicators",
    what: "The standard CRAF'd indicators are already listed for you — remove any that are not relevant to your project, and add your own custom indicators if needed. For each, set the baseline year and value and the target year and value. Used to track progress in annual reports.",
    required: "Yes",
  },
  {
    name: "Risk Management",
    what: "Potential risks with category (Social/Environmental, Financial, Operational, Organizational, Political, Regulatory, or Strategic) and mitigating measures.",
    required: "Recommended",
  },
  {
    name: "Budgets",
    what: "Budgets per participating organization, disaggregated by year, in compliance with UNSDG Budget Categories. Must equal the total approved project amount.",
    required: "Yes",
  },
  {
    name: "Workplan",
    what: "Quarter-grid showing outcomes, outputs, and activities from RBM as rows. Tick the quarters in which each item is planned.",
    required: "Yes",
  },
  {
    name: "Signatures",
    what: "Sign off on the completed Project Document. See the dedicated Signatures section of this guide for the full workflow.",
    required: "Yes",
  },
];

export function ProjectDocumentPage() {
  return (
    <section id="project-document" className="scroll-mt-32 py-12">
      <SectionHeading icon={FileText}>Project Document</SectionHeading>

      <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
        The <strong>Project Document (ProDoc)</strong> is your project&apos;s
        core reference document. Access it via <strong>Project Document</strong>{" "}
        in the left sidebar. It must be completed before your project&apos;s
        funding disbursement can be initiated.
      </p>

      {/* Sections overview table */}
      <div className="mb-8 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left">Section</th>
              <th className="px-4 py-2.5 text-left">What to fill in</th>
              <th className="px-4 py-2.5 text-left">Required</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {prodocSections.map(({ name, what, required }) => (
              <tr key={name} className="hover:bg-muted/40">
                <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap align-top">
                  {name}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground leading-relaxed">
                  {what}
                </td>
                <td className="px-4 py-2.5 align-top">
                  <Badge>{required}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Step-by-step walkthrough */}
      <p className="mb-4 text-sm font-semibold text-foreground">
        How to complete the Project Document
      </p>
      <div className="space-y-0">
        <Step number={1} title="Open the Project Document">
          Click <strong>Project Document</strong> in the sidebar. You will
          open directly into the <strong>General Information</strong> section
          — complete this first, as other sections depend on it.
        </Step>
        <Step number={2} title="Fill in General Information">
          Enter the <strong>Project Title</strong> (keep it short and
          meaningful), select the <strong>Start Date</strong> from the calendar
          picker, and enter the <strong>Duration</strong> as a numeric value in
          months.
        </Step>
        <Step number={3} title="Complete the Narratives">
          The Narratives section contains several predetermined text boxes.
          Hover over each title to see detailed instructions specific to that
          narrative. Write substantive responses and include hyperlinks to
          publicly accessible documents where relevant.
        </Step>
        <Step number={4} title="Review your Indicators">
          The <strong>standard CRAF&apos;d indicators are already listed</strong>{" "}
          for you. Delete any that do not apply to your project, and click{" "}
          <strong>Add</strong> to create your own custom indicators — a custom
          indicator requires a <strong>name</strong>, a{" "}
          <strong>description</strong>, and a{" "}
          <strong>means of verification</strong>. For each indicator, enter the{" "}
          <strong>Baseline Year</strong> (project start) and{" "}
          <strong>Baseline Value</strong>, then the{" "}
          <strong>Target Year</strong> (project end) and{" "}
          <strong>Target Value</strong>. These values are used to track progress
          in annual reports.
        </Step>
        <Step number={5} title="Add risks in Risk Management">
          Click <strong>Add New Risk</strong> to create a risk entry. For each
          risk, describe the potential risk, select a category (Social and
          Environmental, Financial, Operational, Organizational, Political,
          Regulatory, or Strategic), and describe the measures taken to
          mitigate it.
        </Step>
        <Step number={6} title="Enter your Budgets">
          Enter budgets per participating organization (if applicable),
          disaggregated by year, in compliance with UNSDG Budget Categories.
          All budget totals must equal the exact amount approved for the
          project — the difference between the Grant Size and the Total budget
          must be under $1, or the section flags a budget adjustment.
        </Step>
        <Step number={7} title="Fill in the Workplan grid">
          The Workplan is a spreadsheet-like grid automatically populated from
          your Results Based Management (RBM) section. Each{" "}
          <strong>row</strong> corresponds to an outcome, output, or activity
          from RBM. <strong>Columns</strong> are organized by year and
          subdivided into quarters (Q1–Q4). Tick the checkbox in each quarter
          where the corresponding outcome, output, or activity is planned to
          take place.
        </Step>
        <Step number={8} title="Sign off in Signatures">
          Once every section is complete, open the <strong>Signatures</strong>{" "}
          tab and sign for your project contacts. The CRAF&apos;d Secretariat
          signs its own line. See the <strong>Signatures</strong> section of
          this guide for the full workflow.
        </Step>
      </div>

      <InfoBox variant="amber">
        <strong>Read-only fields:</strong> Fields managed by CRAF&apos;d (e.g.
        approved budgets, baselines, indicator targets) appear greyed out and
        cannot be edited. Contact your CRAF&apos;d programme officer if you
        believe a field should be editable.
      </InfoBox>
    </section>
  );
}
