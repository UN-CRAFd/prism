import { LogIn } from "lucide-react";
import { SectionHeading, InfoBox, Step } from "./wiki-components";

const navItems = [
  {
    name: "Home",
    desc: "Your landing page — project timeline, upcoming report deadlines, and any comments CRAF'd has left for you.",
  },
  {
    name: "Project Document",
    desc: "Your project's core reference document (ProDoc). Complete this before funding can be disbursed.",
  },
  {
    name: "Report Editor",
    desc: "Your annual and final reports, grouped by project and year. Where you report progress each period.",
  },
  {
    name: "Contact Information",
    desc: "Manage your organization's team contacts, their roles, and the reporting hierarchy.",
  },
  {
    name: "Guide",
    desc: "This documentation. Use the sub-links to jump to any topic.",
  },
];

export function GettingStartedPage() {
  return (
    <section id="getting-started" className="scroll-mt-32 py-12">
      <SectionHeading icon={LogIn}>Getting Started</SectionHeading>

      <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
        PRISM is a web application — there is nothing to install. You access it
        in your browser using the credentials CRAF&apos;d provides. This section
        covers logging in and finding your way around.
      </p>

      {/* Steps to get in */}
      <div className="space-y-0">
        <Step number={1} title="Log in">
          Open the PRISM login page and enter the <strong>username</strong> and{" "}
          <strong>password</strong> issued by CRAF&apos;d. Passwords are
          case-sensitive. If you have lost your credentials, contact your
          CRAF&apos;d programme officer to request a reset.
        </Step>
        <Step number={2} title="Or use a secure link">
          When CRAF&apos;d opens a new report for you, they may send a{" "}
          <strong>secure link</strong> by email that takes you straight to that
          report — no separate login needed. These links are personal to you;
          please don&apos;t forward them.
        </Step>
        <Step number={3} title="Get your bearings">
          Everything is reached from the <strong>left sidebar</strong>. The
          panel at the bottom shows your organization and a{" "}
          <strong>log-out</strong> button. Use the small arrow on the sidebar
          edge to collapse or expand it for more screen space.
        </Step>
      </div>

      {/* What's in the sidebar */}
      <p className="mb-3 mt-6 text-sm font-semibold text-foreground">
        What&apos;s in the sidebar
      </p>
      <div className="mb-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left">Menu item</th>
              <th className="px-4 py-2.5 text-left">What it&apos;s for</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {navItems.map(({ name, desc }) => (
              <tr key={name} className="hover:bg-muted/40">
                <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap align-top">
                  {name}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground leading-relaxed">
                  {desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InfoBox variant="blue">
        <strong>Best experience:</strong> PRISM works in any modern browser
        (Chrome, Edge, Firefox, or Safari). Keep your browser up to date, and
        make sure you have a stable internet connection so your work saves
        reliably.
      </InfoBox>
    </section>
  );
}
