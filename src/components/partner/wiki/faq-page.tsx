import { HelpCircle } from "lucide-react";
import { WikiShell, SectionHeading } from "./wiki-components";

const faqs = [
  {
    q: "I cannot log in — what should I do?",
    a: "Check that you are using the correct username and password provided by CRAF'd. Passwords are case-sensitive. If you have forgotten your password, contact your CRAF'd programme officer to request a reset.",
  },
  {
    q: "I manage more than one project — how do I switch between them?",
    a: "In the Report Editor section of the sidebar, each project and year appears as a separate entry. Click on the one you want to open.",
  },
  {
    q: "A field is greyed out and I cannot edit it — why?",
    a: "Fields become read-only after a report has been authorized, when the field is managed by CRAF'd (e.g. approved budgets, baselines, indicator targets), or when it belongs to a previous year in multi-year tables. Contact CRAF'd if you believe a field should be editable.",
  },
  {
    q: "How do I know my data has been saved?",
    a: "PRISM saves automatically. A 'Saved' indicator appears briefly in the top bar when a change is written. In sections with a Save button, click it after making changes — the button disappears once saved.",
  },
  {
    q: "Who do I contact for help?",
    a: "For questions about report content or deadlines, contact your CRAF'd programme officer. For technical issues with PRISM, contact the CRAF'd data team — include a screenshot and description of the problem.",
  },
];

export function FaqPage() {
  return (
    <WikiShell>
      <SectionHeading icon={HelpCircle}>FAQ</SectionHeading>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left w-[38%]">Question</th>
              <th className="px-4 py-2.5 text-left">Answer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {faqs.map(({ q, a }) => (
              <tr key={q} className="hover:bg-muted/40 align-top">
                <td className="px-4 py-3 font-medium text-foreground leading-snug">
                  {q}
                </td>
                <td className="px-4 py-3 text-muted-foreground leading-relaxed">
                  {a}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WikiShell>
  );
}
