import { Sparkles } from "lucide-react";
import { SectionHeading, Badge } from "./wiki-components";

const keyFeatures = [
  {
    title: "Report Editor",
    badge: "Core",
    desc: "Complete all 14 sections of your annual or final report in one place. Sections are grouped into Qualitative and Quantitative, with guidance throughout.",
  },
  {
    title: "Project Document",
    badge: "Core",
    desc: "Manage your project's core reference document — general information, narratives, risk register, indicators, workplan, and budget.",
  },
  {
    title: "Auto-save",
    badge: "Convenience",
    desc: "All changes save automatically as you type or leave a field. A brief 'Saved' indicator confirms each write. No manual saving needed.",
  },
  {
    title: "Feedback & Comments",
    badge: "Collaboration",
    desc: "CRAF'd reviewers leave comments on specific sections. These appear on your Home page and link directly to the relevant section.",
  },
  {
    title: "Completion Tracking",
    badge: "Progress",
    desc: "Green checkmarks in the sidebar show which sections are done. A progress bar on the Report Editor landing page shows overall completion.",
  },
  {
    title: "Authorization",
    badge: "Submission",
    desc: "Formally submit your report by accepting the authorization statement. The report locks and enters CRAF'd's review queue.",
  },
  {
    title: "Timeline",
    badge: "Planning",
    desc: "Your Home page shows project start/end dates and report deadlines on a visual timeline, with a pulsing marker for today.",
  },
  {
    title: "Contact Information",
    badge: "Admin",
    desc: "Manage your organization's team contacts, roles, and email addresses through the Contact Information section.",
  },
];

export function KeyFeaturesPage() {
  return (
    <section id="key-features" className="scroll-mt-32 py-12">
      <SectionHeading icon={Sparkles}>Key Features</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {keyFeatures.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{f.title}</p>
              <Badge>{f.badge}</Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
