import { Workflow } from "lucide-react";
import { SectionHeading, InfoBox } from "./wiki-components";

const statuses = [
  {
    status: "Open",
    tone: "blue",
    who: "You and CRAF'd",
    desc: "The document is being drafted. You can edit every field that isn't managed by CRAF'd. Fill in all sections here.",
  },
  {
    status: "Under Review",
    tone: "amber",
    who: "CRAF'd only",
    desc: "You have authorized/submitted, and CRAF'd is reviewing. The document becomes read-only for you while reviewers check it and may leave comments.",
  },
  {
    status: "Closed",
    tone: "zinc",
    who: "No one",
    desc: "The document is finalized and permanently read-only for everyone. Reopening requires CRAF'd to change the status back.",
  },
];

const toneClasses: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-700",
  zinc: "bg-zinc-100 text-zinc-700",
};

export function ReportLifecyclePage() {
  return (
    <section id="report-lifecycle" className="scroll-mt-32 py-12">
      <SectionHeading icon={Workflow}>Lifecycle &amp; Statuses</SectionHeading>

      <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
        Both the Project Document and each report move through the same three
        statuses. The status decides <strong>who can edit</strong> and appears
        as a coloured pill at the top of the editor. Knowing where you are in
        the lifecycle explains why a field might be editable one day and
        read-only the next.
      </p>

      <div className="mb-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5 text-left">Who can edit</th>
              <th className="px-4 py-2.5 text-left">What it means</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {statuses.map(({ status, tone, who, desc }) => (
              <tr key={status} className="hover:bg-muted/40">
                <td className="px-4 py-2.5 align-top">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
                  >
                    {status}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap align-top">
                  {who}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground leading-relaxed">
                  {desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mb-3 text-sm font-semibold text-foreground">
        The typical journey
      </p>
      <ol className="mb-6 space-y-2 text-sm text-muted-foreground leading-relaxed">
        <li>
          <strong>1. Draft (Open).</strong> You complete every section. PRISM
          auto-saves as you go and shows a green checkmark for each finished
          section.
        </li>
        <li>
          <strong>2. Authorize.</strong> For a report, you click{" "}
          <strong>Authorize</strong> and accept the authorization statement to
          submit. This formally hands the report to CRAF&apos;d and locks it for
          you.
        </li>
        <li>
          <strong>3. Under Review.</strong> CRAF&apos;d checks your submission
          and may leave comments on specific sections. If changes are needed,
          they reopen the document so you can respond.
        </li>
        <li>
          <strong>4. Closed.</strong> Once CRAF&apos;d is satisfied, the
          document is closed and becomes a permanent, read-only record.
        </li>
      </ol>

      <InfoBox variant="amber">
        <strong>Why is this field greyed out?</strong> Most often the document
        is <strong>Under Review</strong> or <strong>Closed</strong>, so editing
        is locked. Other fields (approved budgets, baselines, indicator targets,
        or figures from a previous year) are managed by CRAF&apos;d and stay
        read-only at all times. Contact your programme officer if you believe
        something should be editable.
      </InfoBox>
    </section>
  );
}
