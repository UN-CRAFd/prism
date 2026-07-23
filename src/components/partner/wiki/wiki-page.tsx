
const qualitativeSections = [
  "Overview",
  "Surveys",
  "Key Achievements",
  "Partnerships",
  "Results",
  "Lessons Learned",
  "External Coverage",
  "Testimonials",
];

const quantitativeSections = [
  "Risk Management",
  "Indicators",
  "Workplan",
  "Expenditure",
  "Transfers",
  "Complementary Funding",
];

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
    desc: "Formally submit your report by accepting the authorization statement. The report locks and enters CRAF'd's review queue.",
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

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 mt-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
          <span className="mt-2 size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pl-4 border-l-2 border-border">
      <p className="text-sm font-medium mb-1">{title}</p>
      <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

export function WikiPage() {
  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="sticky top-0 z-10 bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <p className="text-neutral-400 text-sm mb-1">PRISM V.0.2</p>
        <h1 className="text-3xl font-bold font-qanelas">Guide</h1>
        <p className="text-neutral-400 text-sm mt-2">How to use the PRISM reporting platform</p>
      </div>

      <div className="flex-1 px-8 py-8">
        <div className="max-w-3xl space-y-14">

            {/* ── How to Use the Platform ──────────────────── */}
            <section id="how-to-use" className="scroll-mt-6">
              <h2 className="text-xl font-bold mb-6 pb-3 border-b">How to Use the Platform</h2>

              <div className="space-y-8">

                {/* Introduction */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Introduction</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                    PRISM is a tool designed to streamline the creation and submission of Project Documents (ProDoc). This guide provides instructions for completing and submitting a ProDoc.
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The project document, once reviewed and signed by all relevant parties, will help initiate the funding disbursements. Please reach out to the CRAF&apos;d Secretariat at{" "}
                    <a href="mailto:crafd@un.org" className="underline underline-offset-2 hover:text-foreground transition-colors">
                      crafd@un.org
                    </a>{" "}
                    for any questions.
                  </p>
                </div>

                {/* Project Document */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">The Project Document</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    The <strong>Project Document (ProDoc)</strong> is your project&apos;s core reference document. Access it via <strong>Project Document</strong> in the sidebar. It contains the following sections:
                  </p>
                  <div className="space-y-4">

                    <SubSection title="General Information">
                      <p className="mb-1">Core project data that must be completed before populating other sections.</p>
                      <Bullets items={[
                        "Project Title — keep it short and meaningful.",
                        "Start Date — select the start date from the calendar.",
                        "Duration — enter a numeric value in months.",
                      ]} />
                    </SubSection>

                    <SubSection title="Narratives">
                      <p className="mb-1">
                        The narrative section comprises several predetermined text boxes, each requiring a response. Hover over the respective titles for detailed instructions on each narrative.
                      </p>
                      <Bullets items={[
                        "Include hyperlinks to pertinent documents that are publicly accessible.",
                      ]} />
                    </SubSection>

                    <SubSection title="Risk Management">
                      <p className="mb-1">
                        Select <strong>Add New Risk</strong> to add potential risks facing your project. For each risk, provide the following:
                      </p>
                      <Bullets items={[
                        "Risk — describe the potential risk.",
                        "Category — Social and Environmental, Financial, Operational, Organizational, Political, Regulatory, or Strategic.",
                        "Mitigating Measures — describe the measures taken to reduce the risk.",
                      ]} />
                    </SubSection>

                    <SubSection title="Indicators">
                      <p className="mb-1">Define the indicators for your project. For each indicator, provide the following:</p>
                      <Bullets items={[
                        "Baseline Year — the year when the project starts.",
                        "Target Year — the end of the project.",
                        "Baseline Value — the value of the indicator in the baseline year.",
                        "Target Value — the value of the indicator in the target year.",
                      ]} />
                    </SubSection>

                    <SubSection title="Workplan">
                      <p className="mb-1">
                        The Workplan is automatically populated based on the outcomes, outputs, and activities indicated in the Results Based Management section.
                      </p>
                      <Bullets items={[
                        "Tick the Time Frame boxes to indicate when each activity will be conducted.",
                      ]} />
                    </SubSection>

                    <SubSection title="Expenditure">
                      <p className="mb-1">Enter expenditure budgets according to the following requirements:</p>
                      <Bullets items={[
                        "Budgets must be indicated per participating organization, if applicable.",
                        "Disaggregated by year.",
                        "In compliance with the UNSDG Budget Categories.",
                        "All expenditure totals must equal the exact amount approved for the project.",
                      ]} />
                    </SubSection>

                  </div>
                </div>

                {/* Report Editor */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">The Report Editor</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    The <strong>Report Editor</strong> is where you submit your project&apos;s progress, usually on an annual basis. Each year your project gets its own report, which CRAF&apos;d opens and shares with you via a secure link.
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    Inside the Report Editor, you&apos;ll update 14 sections split into two groups:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="rounded-lg border bg-card p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Qualitative</p>
                      <ul className="space-y-1.5">
                        {qualitativeSections.map((s) => (
                          <li key={s} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-lg border bg-card p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quantitative</p>
                      <ul className="space-y-1.5">
                        {quantitativeSections.map((s) => (
                          <li key={s} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    A <strong>green checkmark</strong> appears in the sidebar next to sections PRISM considers complete. The Report Editor landing page shows an overall completion bar for each report.
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Once you&apos;ve filled everything in and all sections show a green checkmark, click <strong>Authorize</strong> to submit your report. The authorization statement also grants CRAF&apos;d permission to use submitted materials for outreach purposes. CRAF&apos;d will then review the report and may leave comments on specific sections — you&apos;ll be notified if this happens, and can respond or make edits directly. When everything is confirmed, CRAF&apos;d closes the report and it becomes read-only.
                  </p>
                </div>

              </div>
            </section>

            {/* ── Key Features ──────────────────────────────── */}
            <section id="key-features" className="scroll-mt-6">
              <h2 className="text-xl font-bold mb-6 pb-3 border-b">Key Features</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {keyFeatures.map((f) => (
                  <div key={f.title} className="rounded-xl border bg-card p-4">
                    <p className="text-sm font-semibold mb-1.5">{f.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── FAQ ───────────────────────────────────────── */}
            <section id="faq" className="scroll-mt-6">
              <h2 className="text-xl font-bold mb-6 pb-3 border-b">FAQ</h2>
              <div className="space-y-6">
                {faqs.map((item) => (
                  <div key={item.q} className="border-b pb-6 last:border-b-0 last:pb-0">
                    <p className="text-sm font-semibold mb-2">{item.q}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </section>

        </div>
      </div>
    </div>
  );
}
