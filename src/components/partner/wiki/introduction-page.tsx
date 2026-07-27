import { BookOpen } from "lucide-react";
import { WikiShell, SectionHeading, InfoBox } from "./wiki-components";

export function IntroductionPage() {
  return (
    <WikiShell>
      <div className="mb-6 border-b border-border pb-6">
        <p className="mb-1 text-sm font-medium text-crafd-yellow">
          Partner Documentation
        </p>
        <h1 className="text-2xl font-bold text-foreground">
          PRISM Reporting Platform
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          User guide for partners submitting Project Documents and annual
          reports through the CRAF&apos;d PRISM platform.
        </p>
      </div>

      <SectionHeading icon={BookOpen}>Introduction</SectionHeading>

      <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
        <strong>PRISM</strong> is a tool designed to streamline the creation
        and submission of Project Documents (ProDoc) and annual reports. Once
        your project document is reviewed and signed by all relevant parties,
        it initiates the funding disbursements. Please reach out to the
        CRAF&apos;d Secretariat with any questions.
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          {
            title: "Create a ProDoc",
            desc: "Fill in your project's core reference document with general info, narratives, risks, indicators, workplan, and budget.",
          },
          {
            title: "Submit Reports",
            desc: "Each year, complete 14 sections covering qualitative progress and quantitative data, then authorize your submission.",
          },
          {
            title: "Respond to Feedback",
            desc: "CRAF'd reviewers may leave comments on specific sections — reply or edit directly from the platform.",
          },
        ].map(({ title, desc }) => (
          <div
            key={title}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {desc}
            </p>
          </div>
        ))}
      </div>

      <InfoBox variant="blue">
        For questions about report content or deadlines, contact your
        CRAF&apos;d programme officer at{" "}
        <a
          href="mailto:crafd@un.org"
          className="underline underline-offset-2 font-medium"
        >
          crafd@un.org
        </a>
        .
      </InfoBox>
    </WikiShell>
  );
}
