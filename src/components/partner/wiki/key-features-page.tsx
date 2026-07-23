const keyFeatures = [
  {
    title: "Report Editor",
    desc: "Complete all 14 sections of your annual or final report in one place. Sections are grouped into Qualitative and Quantitative, with guidance throughout.",
  },
  {
    title: "Project Document",
    desc: "Manage your project's core reference document — general information, narratives, risk register, indicators, workplan, and budget.",
  },
  {
    title: "Auto-save",
    desc: "All changes save automatically as you type or leave a field. A brief 'Saved' indicator confirms each write. No manual saving needed.",
  },
  {
    title: "Feedback & Comments",
    desc: "CRAF'd reviewers leave comments on specific sections. These appear on your Home page and link directly to the relevant section.",
  },
  {
    title: "Completion Tracking",
    desc: "Green checkmarks in the sidebar show which sections are done. A progress bar on the Report Editor landing page shows overall completion.",
  },
  {
    title: "Authorization",
    desc: "Formally submit your report by accepting the authorization statement. The report will automatically enter CRAF'd's review queue.",
  },
  {
    title: "Timeline",
    desc: "Your Home page shows project start/end dates and report deadlines on a visual timeline, with a pulsing marker for today.",
  },
  {
    title: "Contact Information",
    desc: "Manage your organization's team contacts, roles, and manager hierarchy through the Contact Information section.",
  },
];

export function KeyFeaturesPage() {
  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="sticky top-0 z-10 bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <p className="text-neutral-400 text-sm mb-1">PRISM V.0.2</p>
        <h1 className="text-3xl font-bold font-qanelas">Guide</h1>
        <p className="text-neutral-400 text-sm mt-2">How to use the PRISM reporting platform</p>
      </div>

      <div className="flex-1 px-8 py-8">
        <div className="max-w-3xl space-y-6">
          <h2 className="text-xl font-bold pb-3 border-b">Key Features</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {keyFeatures.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-4">
                <p className="text-sm font-semibold mb-1.5">{f.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
